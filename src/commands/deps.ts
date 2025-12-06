import path from "path";
import { Command } from "commander";
import { minVersion, gt } from "semver";
import { fetch } from "undici";
import { logger } from "../utils/logger.js";
import { readPackageJson } from "../utils/fs.js";
import { ScanResult } from "../types/result.js";

const bannedVersions = new Set(["19.0.0", "19.1.0", "19.1.1", "19.2.0"]);
const rscPackages = ["react-server-dom-webpack", "react-server-dom-turbopack"];

const normalizeVersion = (range: string | undefined): string | null => {
  if (!range) return null;
  const match = range.match(/(\d+)(\.\d+)?(\.\d+)?/);
  if (!match) return null;
  return match[0];
};

const fetchLatestVersion = async (pkgName: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, { method: "GET" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string; "dist-tags"?: Record<string, string> };
    return body.version || body["dist-tags"]?.latest || null;
  } catch {
    return null;
  }
};

export const performDepsCheck = async (cwd = process.cwd()): Promise<ScanResult> => {
  const pkg = await readPackageJson(cwd);

  if (!pkg) {
    return {
      ok: false,
      warnings: [],
      errors: ["package.json not found. Are you in a React or Next.js project?"],
    };
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const warnings: string[] = [];
  const errors: string[] = [];
  const issues: string[] = [];
  const outdated: Record<string, boolean | null> = {};

  if (Object.keys(allDeps).length === 0) {
    warnings.push("No dependencies found in package.json.");
  }

  const reactVersion = normalizeVersion(allDeps["react"]);

  for (const pkgName of rscPackages) {
    const version = normalizeVersion(allDeps[pkgName]);
    if (!version) continue;

    if (bannedVersions.has(version)) {
      issues.push(
        `${pkgName} ${version} is flagged. Consider upgrading away from ${[...bannedVersions].join(", ")}.`
      );
    }

    if (reactVersion && reactVersion.startsWith("19")) {
      issues.push(
        `react ${reactVersion} combined with ${pkgName} may be unsafe. Review compatibility.`
      );
    }
  }

  const packagesToCheck = ["react", ...rscPackages].filter((name) => allDeps[name]);
  for (const name of packagesToCheck) {
    const installedRange = allDeps[name];
    const installed = installedRange ? minVersion(installedRange) : null;
    const latest = await fetchLatestVersion(name);
    if (!latest) {
      warnings.push(`Could not determine latest version for ${name} (network unavailable?).`);
      outdated[name] = null;
      continue;
    }
    const isOutdated = installed ? gt(installed, latest) : false;
    outdated[name] = isOutdated;
    if (isOutdated && installed) {
      warnings.push(`${name} ${installed.version} is behind latest ${latest}.`);
    }
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    meta: { issues, outdated, reactVersion, dependenciesChecked: packagesToCheck },
  };
};

export const runDepsCheck = async (cwd = process.cwd()): Promise<ScanResult> => {
  const outcome = await performDepsCheck(cwd);

  if (!outcome.ok) {
    outcome.errors.forEach((err) => logger.error(err));
    outcome.warnings.forEach((warn) => logger.warn(warn));
    return outcome;
  }

  const meta = (outcome.meta || {}) as {
    issues?: string[];
    outdated?: Record<string, boolean | null>;
  };
  const issues = meta.issues || [];

  if (issues.length === 0) {
    logger.success("No known risky dependency combinations detected.");
  } else {
    logger.heading("Dependency warnings:");
    issues.forEach((issue) => logger.warn(`- ${issue}`));
  }

  Object.entries(meta.outdated || {}).forEach(([pkgName, flag]) => {
    if (flag === null) return;
    if (flag) {
      logger.warn(`${pkgName} appears outdated compared to registry.`);
    }
  });

  outcome.warnings.forEach((warn) => logger.warn(warn));
  return outcome;
};

export const registerDepsCommand = (program: Command): void => {
  program
    .command("deps")
    .description("Inspect dependencies for known risky versions.")
    .action(async () => {
      const outcome = await runDepsCheck(path.resolve(process.cwd()));
      if (!outcome.ok) {
        process.exitCode = 1;
      }
    });
};
