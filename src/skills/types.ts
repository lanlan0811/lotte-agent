export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  tags?: string[];
  enabled: boolean;
  source: "local" | "hub" | "builtin";
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
  content: string;
  references: Record<string, unknown>;
  scripts: Record<string, unknown>;
  signature?: string;
}

export interface SkillPoolManifest {
  schema_version: string;
  version: number;
  skills: Record<string, SkillManifest>;
}

export interface SkillSearchResult {
  slug: string;
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
}

export interface SkillInstallResult {
  name: string;
  enabled: boolean;
  sourceUrl: string;
}

export type ScanSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface ScanFinding {
  id: string;
  severity: ScanSeverity;
  rule: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ScanResult {
  skillName: string;
  isSafe: boolean;
  maxSeverity: ScanSeverity;
  findings: ScanFinding[];
  scanDurationSeconds: number;
  analyzersUsed: string[];
}
