import { EventEmitter } from "node:events";
import { logger } from "../utils/logger.js";

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
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  reason?: string;
  autoApproved: boolean;
  decidedAt: number;
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

export class ApprovalSystem extends EventEmitter {
  private pendingRequests: Map<string, ApprovalRequest> = new Map();
  private decisions: Map<string, ApprovalDecision> = new Map();
  private autoApprovalRules: AutoApprovalRule[] = [];
  private requestTimeout: number;
  private idCounter = 0;

  constructor(options?: { requestTimeout?: number }) {
    super();
    this.requestTimeout = options?.requestTimeout ?? 60000;
  }

  async requestApproval(request: Omit<ApprovalRequest, "id" | "createdAt" | "expiresAt">): Promise<ApprovalDecision> {
    const fullRequest: ApprovalRequest = {
      ...request,
      id: this.generateId(),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.requestTimeout,
    };

    const autoDecision = this.evaluateAutoApproval(fullRequest);
    if (autoDecision) {
      this.decisions.set(autoDecision.requestId, autoDecision);
      logger.info(`Auto-approved: ${fullRequest.toolName} (${autoDecision.reason ?? "auto rule"})`);
      return autoDecision;
    }

    this.pendingRequests.set(fullRequest.id, fullRequest);

    this.emit("approval_requested", fullRequest);

    return new Promise<ApprovalDecision>((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(fullRequest.id);
        const decision: ApprovalDecision = {
          requestId: fullRequest.id,
          approved: false,
          reason: "Request timed out",
          autoApproved: false,
          decidedAt: Date.now(),
        };
        this.decisions.set(decision.requestId, decision);
        resolve(decision);
      }, this.requestTimeout);

      this.once(`decision:${fullRequest.id}`, (decision: ApprovalDecision) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(fullRequest.id);
        this.decisions.set(decision.requestId, decision);
        resolve(decision);
      });
    });
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
