import type { CVEScanResult } from "../../types/cve.js";
import { parseLockfile } from "./parser.js";
import { matchLockfileAgainstRule } from "./matcher.js";
import { getRule, getAllCVEIds } from "./rules.js";

export interface CVEScanOptions {
  cwd: string;
  cveId?: string;
}

export function scanCVE(options: CVEScanOptions): CVEScanResult {
  const { cwd, cveId } = options;

  const lockfile = parseLockfile(cwd);

  if (!lockfile) {
    return {
      cve: cveId || "all",
      vulnerable: false,
      findings: [],
      scannedPackages: 0,
    };
  }

  const scannedPackages = Object.keys(lockfile.packages).length;

  if (cveId) {
    const rule = getRule(cveId);
    if (!rule) {
      throw new Error(`CVE rule not found: ${cveId}`);
    }

    const findings = matchLockfileAgainstRule(lockfile, rule);

    return {
      cve: cveId,
      vulnerable: findings.length > 0,
      findings,
      scannedPackages,
    };
  }

  const allCVEIds = getAllCVEIds();
  const allFindings = [];

  for (const id of allCVEIds) {
    const rule = getRule(id);
    if (!rule) continue;

    const findings = matchLockfileAgainstRule(lockfile, rule);
    allFindings.push(...findings);
  }

  return {
    cve: "all",
    vulnerable: allFindings.length > 0,
    findings: allFindings,
    scannedPackages,
  };
}

export function listCVEs(): Array<{
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
}> {
  const cveIds = getAllCVEIds();
  return cveIds
    .map((id) => {
      const rule = getRule(id);
      if (!rule) return null;
      return {
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        title: string;
        severity: "critical" | "high" | "medium" | "low";
      } => item !== null
    );
}
