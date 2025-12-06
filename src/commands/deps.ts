import path from "path";
import { Command } from "commander";
import { format, logger } from "../utils/logger.js";
import { readPackageJson } from "../utils/fs.js";

const bannedVersions = new Set(["19.0.0", "19.1.0", "19.1.1", "19.2.0"]);
const rscPackages = ["react-server-dom-webpack", "react-server-dom-turbopack"];

const normalizeVersion = (range: string | undefined): string | null => {
  if (!range) return null;
  const match = range.match(/(\d+)(\.\d+)?(\.\d+)?/);
  if (!match) return null;
  return match[0];
};

export type DepsOutcome = { ok: true; issues: string[] } | { ok: false; message: string };

export const performDepsCheck = async (cwd = process.cwd()): Promise<DepsOutcome> => {
  const pkg = await readPackageJson(cwd);

  if (!pkg) {
    return { ok: false, message: "package.json not found. Are you in a React or Next.js project?" };
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (Object.keys(allDeps).length === 0) {
    return { ok: true, issues: ["No dependencies found in package.json."] };
  }

  const reactVersion = normalizeVersion(allDeps["react"]);
  const issues: string[] = [];

  for (const pkgName of rscPackages) {
    const version = normalizeVersion(allDeps[pkgName]);
    if (!version) continue;

    if (bannedVersions.has(version)) {
      issues.push(
        `${format.key(pkgName)} ${format.danger(version)} is flagged. Consider upgrading away from ${[
          ...bannedVersions,
        ].join(", ")}.`
      );
    }

    if (reactVersion === null) continue;
    if (reactVersion.startsWith("19") && version) {
      issues.push(
        `${format.key("react")} ${format.value(reactVersion)} combined with ${format.key(
          pkgName
        )} may be unsafe. Review compatibility.`
      );
    }
  }

  return { ok: true, issues };
};

export const runDepsCheck = async (cwd = process.cwd()): Promise<DepsOutcome> => {
  const outcome = await performDepsCheck(cwd);

  if (!outcome.ok) {
    if ("message" in outcome) {
      logger.error(outcome.message);
    } else {
      logger.error("Unknown error occurred.");
    }
    return outcome;
  }

  if (outcome.issues.length === 0) {
    logger.success("No known risky dependency combinations detected.");
  } else {
    logger.heading("Dependency warnings:");
    outcome.issues.forEach((issue) => logger.warn(`- ${issue}`));
  }

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
