export interface VulnerablePackage {
  name: string;
  vulnerable: string;
  fixed: string[];
  notes?: string;
}

export interface VulnerableFramework {
  name: string;
  vulnerable: string;
  fixed: string[];
  notes?: string;
}

export interface CVERule {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  cvss?: number;
  packages: VulnerablePackage[];
  frameworks: VulnerableFramework[];
  advisoryUrl?: string;
}

export interface Finding {
  package: string;
  currentVersion: string;
  fixedVersion: string;
  severity: string;
  advisoryUrl?: string;
}

export interface LockfileEntry {
  version: string;
  resolved?: string;
  integrity?: string;
}

export interface ParsedLockfile {
  packages: Record<string, LockfileEntry>;
}

export interface CVEScanResult {
  cve: string;
  vulnerable: boolean;
  findings: Finding[];
  scannedPackages: number;
}
