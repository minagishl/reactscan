import path from "path";
import { Command } from "commander";
import { loadConfig } from "../config/loadConfig.js";
import { format, logger, setLogLevel } from "../utils/logger.js";
import { pathExists, readPackageJson } from "../utils/fs.js";
import { renderResult, Timer } from "../utils/output.js";
import { loadPlugins, runPlugins } from "../plugins/index.js";
import { ScanResult } from "../types/result.js";
import { ScanContext } from "../types/context.js";
import { Cache } from "../utils/cache.js";
import { handleError } from "../utils/errors.js";

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

export const performScan = async (context: ScanContext, useCache = true): Promise<ScanResult> => {
  const cache = new Cache(context.cwd, context.config);
  const cacheKey = `scan-${context.cwd}`;

  if (useCache) {
    const cached = await cache.get<ScanResult>(cacheKey);
    if (cached) {
      if (context.debug) logger.debug("Using cached scan result");
      return cached;
    }
  }

  try {
    const detection = await detectProject(context.cwd);

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

    if (context.debug) logger.debug(`scan detection: ${JSON.stringify(detection, null, 2)}`);

    const result = { ok: true, warnings: [], errors: [], meta: detection };

    if (useCache) {
      await cache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    const errorMsg = handleError(error, context.debug);
    return { ok: false, warnings: [], errors: [errorMsg] };
  }
};

const printScanResult = (result: ScanResult): void => {
  const detection = result.meta as Detection | undefined;
  if (!detection) return;
  logger.heading("reactscan results:");
  logger.info(
    `${format.label("framework")} React: ${detection.hasReact ? format.success("yes") : "no"}`
  );
  logger.info(
    `${format.label("framework")} Next.js: ${detection.hasNext ? format.success("yes") : "no"}`
  );

  const { versions } = detection;
  logger.info(
    `${format.label("version")} react: ${versions["react"] ? format.value(versions["react"]!) : "not found"}`
  );
  logger.info(
    `${format.label("version")} next: ${versions["next"] ? format.value(versions["next"]!) : "not found"}`
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

export const registerScanCommand = (program: Command): void => {
  program
    .command("scan")
    .option("--debug", "Enable debug logging")
    .option("--no-cache", "Disable cache")
    .option("--quiet", "Minimal output")
    .description("Scan project for React/Next.js presence and RSC signals.")
    .action(async (options: { debug?: boolean; cache?: boolean; quiet?: boolean }) => {
      const timer = new Timer();
      const cwd = path.resolve(process.cwd());
      if (options.debug) setLogLevel("debug");
      const config = await loadConfig(cwd);
      const context: ScanContext = { cwd, command: "scan", config, debug: Boolean(options.debug) };
      const useCache = options.cache !== false;
      const base = await performScan(context, useCache);
      const plugins = await loadPlugins(cwd, Boolean(options.debug));
      const pluginResult = await runPlugins(plugins, { ...context, baseResult: base });
      const merged: ScanResult = {
        ok: base.ok && pluginResult.ok,
        warnings: [...base.warnings, ...pluginResult.warnings],
        errors: [...base.errors, ...pluginResult.errors],
        meta: { ...base.meta, ...pluginResult.meta },
      };
      renderResult(merged, printScanResult, {
        quiet: Boolean(options.quiet),
        showTiming: true,
        elapsed: timer.elapsed(),
      });
      if (!merged.ok) process.exitCode = 1;
    });
};
