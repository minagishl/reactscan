import path from "path";
import { Command } from "commander";
import { format, logger } from "../utils/logger.js";
import { pathExists, readPackageJson } from "../utils/fs.js";

type Detection = {
  hasReact: boolean;
  hasNext: boolean;
  versions: Record<string, string | null>;
  hasAppDir: boolean;
  usesRscPackages: boolean;
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

  return { hasReact, hasNext, versions, hasAppDir, usesRscPackages };
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

  const likelyRsc =
    detection.hasAppDir ||
    detection.usesRscPackages ||
    (detection.hasNext && Boolean(versions["react-server-dom-webpack"]));

  if (likelyRsc) {
    logger.success("RSC usage is likely (app directory or RSC packages detected).");
  } else {
    logger.warn(
      "RSC usage not detected. If you use the App Router, ensure server components are configured correctly."
    );
  }
};

export const runScan = async (cwd = process.cwd()): Promise<void> => {
  const detection = await detectProject(cwd);

  if (!detection) {
    logger.error("Could not read package.json. Please run inside a React or Next.js project.");
    return;
  }

  if (!detection.hasReact && !detection.hasNext) {
    logger.warn(
      "This directory does not look like a React or Next.js project. Add react/next to dependencies and retry."
    );
    return;
  }

  printScanResult(detection);
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
