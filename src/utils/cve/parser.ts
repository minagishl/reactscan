import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ParsedLockfile } from "../../types/cve.js";

export function parseNpmLockfile(projectDir: string): ParsedLockfile | null {
  const lockfilePath = join(projectDir, "package-lock.json");
  if (!existsSync(lockfilePath)) {
    return null;
  }

  try {
    const content = readFileSync(lockfilePath, "utf-8");
    const lockfile = JSON.parse(content);

    const packages: Record<string, { version: string }> = {};

    if (lockfile.packages) {
      for (const [pkgPath, pkgData] of Object.entries(lockfile.packages)) {
        if (!pkgPath || pkgPath === "") continue;

        const pkgName = pkgPath.startsWith("node_modules/")
          ? pkgPath.replace("node_modules/", "")
          : pkgPath;

        if (pkgData && typeof pkgData === "object" && "version" in pkgData) {
          const version = (pkgData as { version: string }).version;
          if (!packages[pkgName]) {
            packages[pkgName] = { version };
          }
        }
      }
    }

    return { packages };
  } catch {
    return null;
  }
}

export function parsePnpmLockfile(projectDir: string): ParsedLockfile | null {
  const lockfilePath = join(projectDir, "pnpm-lock.yaml");
  if (!existsSync(lockfilePath)) {
    return null;
  }

  try {
    const content = readFileSync(lockfilePath, "utf-8");
    const packages: Record<string, { version: string }> = {};

    const lines = content.split("\n");
    let currentPackage = "";

    for (const line of lines) {
      const pkgMatch = line.match(/^\s{2}'?([^'@\s]+)(?:@([^']+))?'?:/);
      if (pkgMatch) {
        currentPackage = pkgMatch[1];
        const version = pkgMatch[2];
        if (version) {
          packages[currentPackage] = { version };
        }
      } else if (currentPackage && line.includes("version:")) {
        const versionMatch = line.match(/version:\s*([^\s]+)/);
        if (versionMatch) {
          packages[currentPackage] = { version: versionMatch[1] };
        }
      }
    }

    return { packages };
  } catch {
    return null;
  }
}

export function parseYarnLockfile(projectDir: string): ParsedLockfile | null {
  const lockfilePath = join(projectDir, "yarn.lock");
  if (!existsSync(lockfilePath)) {
    return null;
  }

  try {
    const content = readFileSync(lockfilePath, "utf-8");
    const packages: Record<string, { version: string }> = {};

    const lines = content.split("\n");
    let currentPackage = "";

    for (const line of lines) {
      if (line.match(/^[^#\s]/)) {
        const pkgMatch = line.match(/^"?([^@\s"]+)(?:@[^"]+)?"?:/);
        if (pkgMatch) {
          currentPackage = pkgMatch[1];
        }
      } else if (currentPackage && line.includes("version")) {
        const versionMatch = line.match(/version\s+"?([^"\s]+)"?/);
        if (versionMatch) {
          packages[currentPackage] = { version: versionMatch[1] };
          currentPackage = "";
        }
      }
    }

    return { packages };
  } catch {
    return null;
  }
}

export function parseLockfile(projectDir: string): ParsedLockfile | null {
  return (
    parseNpmLockfile(projectDir) || parsePnpmLockfile(projectDir) || parseYarnLockfile(projectDir)
  );
}
