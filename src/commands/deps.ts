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

export const runDepsCheck = async (cwd = process.cwd()): Promise<void> => {
  const pkg = await readPackageJson(cwd);

  if (!pkg) {
    logger.error("package.json not found. Are you in a React or Next.js project?");
    return;
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (Object.keys(allDeps).length === 0) {
    logger.warn("No dependencies found in package.json.");
    return;
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

  if (issues.length === 0) {
    logger.success("No known risky dependency combinations detected.");
    return;
  }

  logger.heading("Dependency warnings:");
  issues.forEach((issue) => logger.warn(`- ${issue}`));
};

export const registerDepsCommand = (program: Command): void => {
  program
    .command("deps")
    .description("Inspect dependencies for known risky versions.")
    .action(async () => runDepsCheck(path.resolve(process.cwd())));
};
