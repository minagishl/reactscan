import semver from "semver";
import type { CVERule, Finding, ParsedLockfile } from "../../types/cve.js";

export function isVersionVulnerable(version: string, vulnerableRange: string): boolean {
  const cleanVersion = semver.clean(version);
  if (!cleanVersion) {
    return false;
  }

  try {
    return semver.satisfies(cleanVersion, vulnerableRange);
  } catch {
    return false;
  }
}

export function findFixedVersion(currentVersion: string, fixedVersions: string[]): string {
  const cleanVersion = semver.clean(currentVersion);
  if (!cleanVersion) {
    return fixedVersions[fixedVersions.length - 1];
  }

  const sorted = [...fixedVersions].sort(semver.compare);

  const currentMajor = semver.major(cleanVersion);
  const currentMinor = semver.minor(cleanVersion);

  for (const fixed of sorted) {
    const fixedMajor = semver.major(fixed);
    const fixedMinor = semver.minor(fixed);

    if (fixedMajor === currentMajor && fixedMinor === currentMinor) {
      return fixed;
    }
    if (fixedMajor === currentMajor && fixedMinor > currentMinor) {
      return fixed;
    }
  }

  return sorted[sorted.length - 1];
}

export function matchLockfileAgainstRule(lockfile: ParsedLockfile, rule: CVERule): Finding[] {
  const findings: Finding[] = [];

  for (const vulnPkg of rule.packages) {
    const installedVersion = lockfile.packages[vulnPkg.name]?.version;

    if (!installedVersion) {
      continue;
    }

    if (isVersionVulnerable(installedVersion, vulnPkg.vulnerable)) {
      findings.push({
        package: vulnPkg.name,
        currentVersion: installedVersion,
        fixedVersion: findFixedVersion(installedVersion, vulnPkg.fixed),
        severity: rule.severity,
        advisoryUrl: rule.advisoryUrl,
      });
    }
  }

  for (const framework of rule.frameworks) {
    const installedVersion = lockfile.packages[framework.name]?.version;

    if (!installedVersion) {
      continue;
    }

    if (isVersionVulnerable(installedVersion, framework.vulnerable)) {
      findings.push({
        package: framework.name,
        currentVersion: installedVersion,
        fixedVersion: findFixedVersion(installedVersion, framework.fixed),
        severity: rule.severity,
        advisoryUrl: rule.advisoryUrl,
      });
    }
  }

  return findings;
}

export function hasTargetPackages(lockfile: ParsedLockfile, rule: CVERule): boolean {
  const targetPackages = [
    ...rule.packages.map((p) => p.name),
    ...rule.frameworks.map((f) => f.name),
  ];

  return targetPackages.some((pkg) => pkg in lockfile.packages);
}
