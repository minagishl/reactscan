import path from "path";
import { Command } from "commander";
import { fetch } from "undici";
import { loadConfig } from "../config/loadConfig.js";
import { format, logger, setLogLevel } from "../utils/logger.js";
import { findFilesWithString, pathExists, readPackageJson } from "../utils/fs.js";
import { confirmPrompt } from "../utils/prompt.js";
import { renderResult } from "../utils/output.js";
import { loadPlugins, runPlugins } from "../plugins/index.js";
import { ScanContext } from "../types/context.js";
import { ScanResult } from "../types/result.js";

type LocalMeta = {
  type: "local";
  hasNext: boolean;
  usesRscPackages: boolean;
  appDirExists: boolean;
  serverActionFiles: string[];
  routerMarkers: string[];
};

type RemoteMeta = {
  type: "remote";
  url: string;
  status: number;
  headerFlight: boolean;
  contentTypeRsc: boolean;
  headerHints: string[];
  bodyMarkers: string[];
  serverActionMarkers: string[];
};

const isLocalhost = (url: URL): boolean =>
  url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";

const stripScripts = (html: string): string =>
  html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, "");

const serverActionPatterns = [
  "use server",
  "__SERVER_ACTIONS__",
  "serverActionsManifest",
  "server_actions",
  "serverActions",
];

export const analyzeLocalRsc = async (context: ScanContext): Promise<ScanResult> => {
  const pkg = await readPackageJson(context.cwd);
  if (!pkg) {
    return {
      ok: false,
      warnings: [],
      errors: ["package.json not found. Run this command in a project directory."],
    };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasNext = Boolean(deps["next"]);
  const usesRscPackages = Boolean(
    deps["react-server-dom-webpack"] || deps["react-server-dom-turbopack"]
  );

  const appDir = path.join(context.cwd, "app");
  const appDirExists = await pathExists(appDir);
  const serverActionFiles = appDirExists
    ? await findFilesWithString(
        appDir,
        "use server",
        [".js", ".jsx", ".ts", ".tsx"],
        context.config.ignore
      )
    : [];
  const routerMarkers = appDirExists
    ? await findFilesWithString(
        appDir,
        "__NEXT_ROUTER_APP",
        [".js", ".jsx", ".ts", ".tsx"],
        context.config.ignore
      )
    : [];

  const warnings: string[] = [];
  if (!hasNext && !appDirExists)
    warnings.push("Next.js App Router signals not found. RSC is unlikely here.");
  if (appDirExists && serverActionFiles.length === 0) {
    warnings.push(
      'No "use server" markers found. If you use Server Actions, ensure files include the directive.'
    );
  }

  const meta: LocalMeta = {
    type: "local",
    hasNext,
    usesRscPackages,
    appDirExists,
    serverActionFiles,
    routerMarkers,
  };

  if (context.debug) logger.debug(`rsc local meta: ${JSON.stringify(meta, null, 2)}`);

  return { ok: true, warnings, errors: [], meta };
};

export const handleRemoteRscScan = async (
  url: URL,
  context: ScanContext,
  promptConfirm = true
): Promise<ScanResult> => {
  logger.warn("Note: reactscan performs only safe, read-only, non-intrusive checks.");

  if (!isLocalhost(url) && promptConfirm) {
    logger.info(`This action will scan an external site: ${url.toString()}`);
    logger.info("Only safe, non-intrusive checks will be performed.");
    const confirmed = await confirmPrompt("Do you want to continue? (y/N) ");
    if (!confirmed) {
      return { ok: false, warnings: [], errors: ["Scan cancelled by user."] };
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "Accept-Encoding": "gzip, deflate, br" },
      signal: AbortSignal.timeout(context.config.remote?.timeout ?? 5000),
    });

    const headerHints: string[] = [];
    let headerFlight = false;
    let contentTypeRsc = false;

    response.headers.forEach((value, key) => {
      const pair = `${key}: ${value}`;
      if (/react|next|flight/i.test(key) || /react|next|flight/i.test(value)) {
        headerHints.push(pair);
      }
      if (key.toLowerCase() === "x-react-flight") headerFlight = true;
      if (key.toLowerCase() === "content-type" && value.includes("text/x-component")) {
        contentTypeRsc = true;
      }
    });

    const rawBody = await response.text();
    const body = stripScripts(rawBody);
    const lowerBody = body.toLowerCase();

    const bodyMarkers: string[] = [];
    if (lowerBody.includes("react-server-dom-webpack"))
      bodyMarkers.push("react-server-dom-webpack");
    if (lowerBody.includes("__next_f")) bodyMarkers.push("__next_f");
    if (/app[-_]router/i.test(lowerBody)) bodyMarkers.push("App Router marker");

    const serverActionMarkers: string[] = [];
    for (const marker of serverActionPatterns) {
      if (lowerBody.includes(marker.toLowerCase())) serverActionMarkers.push(marker);
    }

    const meta: RemoteMeta = {
      type: "remote",
      url: url.toString(),
      status: response.status,
      headerFlight,
      contentTypeRsc,
      headerHints: [...new Set(headerHints)],
      bodyMarkers,
      serverActionMarkers,
    };

    const warnings: string[] = [];
    if (response.status >= 400)
      warnings.push(`Received HTTP status ${response.status} from remote host.`);
    if (
      bodyMarkers.length === 0 &&
      serverActionMarkers.length === 0 &&
      !headerFlight &&
      !contentTypeRsc
    ) {
      warnings.push("No obvious RSC markers found in response.");
    }

    if (context.debug) logger.debug(`rsc remote meta: ${JSON.stringify(meta, null, 2)}`);

    return { ok: true, warnings, errors: [], meta };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return { ok: false, warnings: [], errors: [`Network error during remote scan: ${message}`] };
  }
};

const printLocalRsc = (meta: LocalMeta): void => {
  logger.heading("RSC diagnosis:");
  logger.info(
    `${format.label("next.js")} ${meta.hasNext ? format.value("found") : "not detected"}`
  );
  logger.info(
    `${format.label("app dir")} ${meta.appDirExists ? format.value("present") : "missing"}`
  );
  logger.info(
    `${format.label("rsc pkgs")} ${meta.usesRscPackages ? format.value("found") : "not found"}`
  );
  logger.info(
    `${format.label("server actions")} ${
      meta.serverActionFiles.length > 0
        ? format.value(`${meta.serverActionFiles.length} file(s)`)
        : "no matches"
    }`
  );
  logger.info(
    `${format.label("router marker")} ${
      meta.routerMarkers.length > 0
        ? format.value(`${meta.routerMarkers.length} file(s) with __NEXT_ROUTER_APP`)
        : "no matches"
    }`
  );

  if (meta.appDirExists)
    logger.success("App Router directory detected. RSC support is likely enabled.");
  if (meta.serverActionFiles.length > 0)
    logger.success('Server Actions detected via "use server".');
};

const printRemoteRsc = (meta: RemoteMeta): void => {
  logger.heading(`Remote RSC signals for ${meta.url}`);
  logger.info(`${format.label("status")} ${meta.status}`);
  logger.info(
    `${format.label("header")} X-React-Flight: ${meta.headerFlight ? format.value("present") : "missing"}`
  );
  logger.info(
    `${format.label("header")} Content-Type text/x-component: ${meta.contentTypeRsc ? format.value("present") : "missing"}`
  );

  if (meta.headerHints.length > 0)
    logger.info(`${format.label("header hints")} ${meta.headerHints.join("; ")}`);
  if (meta.bodyMarkers.length > 0)
    logger.success(`Body markers detected: ${meta.bodyMarkers.join(", ")}`);
  if (meta.serverActionMarkers.length > 0)
    logger.success(`Server Action markers detected: ${meta.serverActionMarkers.join(", ")}`);
};

export const registerRscCommand = (program: Command): void => {
  program
    .command("rsc")
    .argument("[pathOrUrl]", "Local directory or URL to inspect.")
    .option("--debug", "Enable debug logging")
    .description("Inspect Next.js App Router and server action usage.")
    .action(async (pathOrUrl?: string, options?: { debug?: boolean }) => {
      const result = await runRsc(pathOrUrl, Boolean(options?.debug));
      if (!result.ok) process.exitCode = 1;
    });
};

export const runRsc = async (pathOrUrl?: string, debug = false): Promise<ScanResult> => {
  const input = pathOrUrl || process.cwd();
  if (debug) setLogLevel("debug");
  const isUrl = (() => {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  })();
  const cwd = isUrl ? process.cwd() : path.resolve(input);
  const config = await loadConfig(cwd);
  const context: ScanContext = { cwd, command: isUrl ? "remote-rsc" : "rsc", config, debug, input };
  const base = isUrl
    ? await handleRemoteRscScan(new URL(input), context, true)
    : await analyzeLocalRsc(context);
  const plugins = await loadPlugins(cwd, debug);
  const pluginResult = await runPlugins(plugins, { ...context, baseResult: base });
  const merged: ScanResult = {
    ok: base.ok && pluginResult.ok,
    warnings: [...base.warnings, ...pluginResult.warnings],
    errors: [...base.errors, ...pluginResult.errors],
    meta: { ...base.meta, ...pluginResult.meta },
  };
  renderResult(merged, (res) => {
    const meta = res.meta as LocalMeta | RemoteMeta | undefined;
    if (!meta) return;
    if (meta.type === "local") printLocalRsc(meta);
    else printRemoteRsc(meta);
  });
  return merged;
};
