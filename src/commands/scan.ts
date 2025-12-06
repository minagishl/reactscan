import path from "path";
import { Command } from "commander";
import { format, logger } from "../utils/logger.js";
import { pathExists, readPackageJson } from "../utils/fs.js";
import { ScanResult } from "../types/result.js";

type Detection = {
  hasReact: boolean;
  hasNext: boolean;
  versions: Record<string, string | null>;
  hasAppDir: boolean;
  usesRscPackages: boolean;
  likelyRsc: boolean;
};

const readVersions = (
  pkg: Record<string, string> | undefined,
  keys: string[]
): Record<string, string | null> => {
  const result: Record<string, string | null> = {};
  keys.forEach((key) => {
    result[key] = pkg?.[key] || null;
  });
  return result;
};

const detectProject = async (cwd: string): Promise<Detection | null> => {
  const pkg = await readPackageJson(cwd);
  if (!pkg) return null;

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const versions = readVersions(deps, [
    "react",
    "next",
    "react-server-dom-webpack",
    "react-server-dom-turbopack",
  ]);

  const hasReact = Boolean(versions["react"]);
  const hasNext = Boolean(versions["next"]);
  const usesRscPackages = Boolean(
    versions["react-server-dom-webpack"] || versions["react-server-dom-turbopack"]
  );
  const hasAppDir = await pathExists(path.join(cwd, "app"));

  const likelyRsc =
    hasAppDir ||
    usesRscPackages ||
    (hasNext &&
      Boolean(versions["react-server-dom-webpack"] || versions["react-server-dom-turbopack"]));

  return { hasReact, hasNext, versions, hasAppDir, usesRscPackages, likelyRsc };
};

const printScanResult = (detection: Detection): void => {
  logger.heading("reactscan results:");

  logger.info(
    `${format.label("framework")} React: ${detection.hasReact ? format.success("yes") : "no"}`
  );
  logger.info(
    `${format.label("framework")} Next.js: ${detection.hasNext ? format.success("yes") : "no"}`
  );

  const { versions } = detection;
  logger.info(
    `${format.label("version")} react: ${
      versions["react"] ? format.value(versions["react"]!) : "not found"
    }`
  );
  logger.info(
    `${format.label("version")} next: ${
      versions["next"] ? format.value(versions["next"]!) : "not found"
    }`
  );
  logger.info(
    `${format.label("version")} react-server-dom-webpack: ${
      versions["react-server-dom-webpack"]
        ? format.value(versions["react-server-dom-webpack"]!)
        : "not found"
    }`
  );
  logger.info(
    `${format.label("version")} react-server-dom-turbopack: ${
      versions["react-server-dom-turbopack"]
        ? format.value(versions["react-server-dom-turbopack"]!)
        : "not found"
    }`
  );

  if (detection.likelyRsc) {
    logger.success("RSC usage is likely (app directory or RSC packages detected).");
  } else {
    logger.warn(
      "RSC usage not detected. If you use the App Router, ensure server components are configured correctly."
    );
  }
};

export const performScan = async (cwd = process.cwd()): Promise<ScanResult> => {
  const detection = await detectProject(cwd);

  if (!detection) {
    return {
      ok: false,
      warnings: [],
      errors: ["Could not read package.json. Please run inside a React or Next.js project."],
    };
  }

  if (!detection.hasReact && !detection.hasNext) {
    return {
      ok: false,
      warnings: [],
      errors: [
        "This directory does not look like a React or Next.js project. Add react/next to dependencies and retry.",
      ],
    };
  }

  return { ok: true, warnings: [], errors: [], meta: detection };
};

export const runScan = async (cwd = process.cwd()): Promise<ScanResult> => {
  const outcome = await performScan(cwd);
  if (outcome.ok) {
    printScanResult(outcome.meta as Detection);
  } else {
    outcome.errors.forEach((err) => logger.error(err));
    outcome.warnings.forEach((warn) => logger.warn(warn));
  }
  return outcome;
};

export const registerScanCommand = (program: Command): void => {
  program
    .command("scan")
    .description("Scan project for React/Next.js presence and RSC signals.")
    .action(async () => {
      const cwd = path.resolve(process.cwd());
      await runScan(cwd);
    });
};
