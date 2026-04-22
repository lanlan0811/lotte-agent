import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";

export type ApprovalMode = "auto" | "gate" | "strict";

export interface ApprovalPolicy {
  mode: ApprovalMode;
  gateTimeoutMs: number;
  gateAutoDenyOnTimeout: boolean;
  maxPendingRequests: number;
  riskLevelRequireManual: ("low" | "medium" | "high" | "critical")[];
}

export interface ApprovalRequest {
  id: string;
  sessionId: string;
  toolName: string;
  toolCategory: string;
  arguments: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high" | "critical";
  description: string;
  createdAt: number;
  expiresAt: number;
  gateNotified: boolean;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  reason?: string;
  autoApproved: boolean;
  decidedAt: number;
  gateMode?: boolean;
}

export interface AutoApprovalRule {
  name: string;
  toolPattern: string | string[];
  categoryPattern?: string;
  riskLevelMax: "low" | "medium" | "high" | "critical";
  condition?: (request: ApprovalRequest) => boolean;
  enabled: boolean;
}

const RISK_LEVEL_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_POLICY: ApprovalPolicy = {
  mode: "auto",
  gateTimeoutMs: 120_000,
  gateAutoDenyOnTimeout: true,
  maxPendingRequests: 100,
  riskLevelRequireManual: ["high", "critical"],
};

export class ApprovalSystem extends EventEmitter {
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private decisions: Map<string, ApprovalDecision> = new Map();
  private autoApprovalRules: AutoApprovalRule[] = [];
  private requestTimeout: number;
  private policy: ApprovalPolicy;
  private idCounter = 0;

  constructor(options?: { requestTimeout?: number; policy?: Partial<ApprovalPolicy> }) {
    super();
    this.requestTimeout = options?.requestTimeout ?? 60000;
    this.policy = { ...DEFAULT_POLICY, ...options?.policy };
  }

  getPolicy(): ApprovalPolicy {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<ApprovalPolicy>): void {
    this.policy = { ...this.policy, ...updates };
    logger.info(`Approval policy updated: mode=${this.policy.mode}`);
  }

  async requestApproval(request: Omit<ApprovalRequest, "id" | "createdAt" | "expiresAt" | "gateNotified">): Promise<ApprovalDecision> {
    const fullRequest: ApprovalRequest = {
      ...request,
      id: this.generateId(),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.requestTimeout,
      gateNotified: false,
    };

    if (this.pendingRequests.size >= this.policy.maxPendingRequests) {
      const oldest = this.pendingRequests.values().next().value;
      if (oldest) {
        this.expireRequest(oldest.id, "Max pending requests exceeded");
      }
    }

    if (this.policy.mode === "strict") {
      return this.gateApproval(fullRequest);
    }

    if (this.policy.mode === "gate" && this.requiresManualApproval(fullRequest)) {
      return this.gateApproval(fullRequest);
    }

    const autoDecision = this.evaluateAutoApproval(fullRequest);
    if (autoDecision) {
      this.decisions.set(autoDecision.requestId, autoDecision);
      logger.info(`Auto-approved: ${fullRequest.toolName} (${autoDecision.reason ?? "auto rule"})`);
      return autoDecision;
    }

    if (this.policy.mode === "gate" || this.requiresManualApproval(fullRequest)) {
      return this.gateApproval(fullRequest);
    }

    return this.gateApproval(fullRequest);
  }

  private requiresManualApproval(request: ApprovalRequest): boolean {
    return this.policy.riskLevelRequireManual.includes(request.riskLevel);
  }

  private gateApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    this.pendingRequests.set(request.id, request);
    request.gateNotified = true;

    this.emit("approval_requested", request);
    this.emit("gate_opened", {
      requestId: request.id,
      toolName: request.toolName,
      riskLevel: request.riskLevel,
      description: request.description,
    });

    logger.info(`Gate opened for ${request.toolName} (risk: ${request.riskLevel}, id: ${request.id})`);

    return new Promise<ApprovalDecision>((resolve) => {
      const gateTimeout = this.policy.gateTimeoutMs;

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        const decision: ApprovalDecision = {
          requestId: request.id,
          approved: false,
          reason: this.policy.gateAutoDenyOnTimeout
            ? "Gate timeout - auto denied"
            : "Gate timeout - no response",
          autoApproved: false,
          decidedAt: Date.now(),
          gateMode: true,
        };
        this.decisions.set(decision.requestId, decision);
        this.emit("gate_timeout", { requestId: request.id, autoDenied: this.policy.gateAutoDenyOnTimeout });
        resolve(decision);
      }, gateTimeout);

      this.once(`decision:${request.id}`, (decision: ApprovalDecision) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(request.id);
        decision.gateMode = true;
        this.decisions.set(decision.requestId, decision);
        resolve(decision);
      });
    });
  }

  private expireRequest(requestId: string, reason: string): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) return;

    this.pendingRequests.delete(requestId);
    const decision: ApprovalDecision = {
      requestId,
      approved: false,
      reason,
      autoApproved: false,
      decidedAt: Date.now(),
    };
    this.decisions.set(requestId, decision);
    this.emit(`decision:${requestId}`, decision);
  }

  decide(requestId: string, approved: boolean, reason?: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      logger.warn(`Approval request not found: ${requestId}`);
      return false;
    }

    const decision: ApprovalDecision = {
      requestId,
      approved,
      reason,
      autoApproved: false,
      decidedAt: Date.now(),
    };

    this.emit(`decision:${requestId}`, decision);
    logger.info(`Manual decision for ${requestId}: ${approved ? "approved" : "denied"}`);
    return true;
  }

  addAutoApprovalRule(rule: AutoApprovalRule): void {
    this.autoApprovalRules.push(rule);
    logger.debug(`Added auto-approval rule: ${rule.name}`);
  }

  removeAutoApprovalRule(name: string): boolean {
    const index = this.autoApprovalRules.findIndex((r) => r.name === name);
    if (index === -1) return false;
    this.autoApprovalRules.splice(index, 1);
    return true;
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  getDecision(requestId: string): ApprovalDecision | undefined {
    return this.decisions.get(requestId);
  }

  getDecisionHistory(limit = 50): ApprovalDecision[] {
    return Array.from(this.decisions.values()).slice(-limit);
  }

  private evaluateAutoApproval(request: ApprovalRequest): ApprovalDecision | null {
    for (const rule of this.autoApprovalRules) {
      if (!rule.enabled) continue;

      if (!this.matchesRule(rule, request)) continue;

      if ((RISK_LEVEL_ORDER[request.riskLevel] ?? 0) > (RISK_LEVEL_ORDER[rule.riskLevelMax] ?? 0)) {
        continue;
      }

      if (rule.condition && !rule.condition(request)) continue;

      return {
        requestId: request.id,
        approved: true,
        reason: `Auto-approved by rule: ${rule.name}`,
        autoApproved: true,
        decidedAt: Date.now(),
      };
    }

    return null;
  }

  private matchesRule(rule: AutoApprovalRule, request: ApprovalRequest): boolean {
    const patterns = Array.isArray(rule.toolPattern) ? rule.toolPattern : [rule.toolPattern];

    const matchesTool = patterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.endsWith("*")) {
        return request.toolName.startsWith(pattern.slice(0, -1));
      }
      return request.toolName === pattern;
    });

    if (!matchesTool) return false;

    if (rule.categoryPattern) {
      const catPatterns = Array.isArray(rule.categoryPattern)
        ? rule.categoryPattern
        : [rule.categoryPattern];

      const matchesCategory = catPatterns.some((pattern) => {
        if (pattern === "*") return true;
        return request.toolCategory === pattern;
      });

      if (!matchesCategory) return false;
    }

    return true;
  }

  private generateId(): string {
    return `apr_${Date.now()}_${++this.idCounter}`;
  }
}
