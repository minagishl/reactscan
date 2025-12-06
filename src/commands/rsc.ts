import path from "path";
import { Command } from "commander";
import { fetch } from "undici";
import { format, logger } from "../utils/logger.js";
import { findFilesWithString, pathExists, readPackageJson } from "../utils/fs.js";
import { confirmPrompt } from "../utils/prompt.js";

type LocalRscResult = {
  type: "local";
  hasNext: boolean;
  usesRscPackages: boolean;
  appDirExists: boolean;
  serverActionFiles: string[];
};

type RemoteRscResult = {
  type: "remote";
  url: string;
  status: number;
  headerFlight: boolean;
  contentTypeRsc: boolean;
  headerHints: string[];
  bodyMarkers: string[];
};

export type RscOutcome =
  | { ok: true; result: LocalRscResult | RemoteRscResult }
  | { ok: false; message: string };

const isLocalhost = (url: URL): boolean =>
  url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";

const analyzeLocalRsc = async (cwd: string): Promise<RscOutcome> => {
  const pkg = await readPackageJson(cwd);
  if (!pkg) {
    return {
      ok: false,
      message: "package.json not found. Run this command in a project directory.",
    };
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasNext = Boolean(deps["next"]);
  const usesRscPackages = Boolean(
    deps["react-server-dom-webpack"] || deps["react-server-dom-turbopack"]
  );

  const appDir = path.join(cwd, "app");
  const appDirExists = await pathExists(appDir);
  const serverActionFiles = appDirExists ? await findFilesWithString(appDir, "use server") : [];

  return {
    ok: true,
    result: { type: "local", hasNext, usesRscPackages, appDirExists, serverActionFiles },
  };
};

const printLocalRsc = (result: LocalRscResult): void => {
  logger.heading("RSC diagnosis:");
  logger.info(
    `${format.label("next.js")} ${result.hasNext ? format.value("found") : "not detected"}`
  );
  logger.info(
    `${format.label("app dir")} ${result.appDirExists ? format.value("present") : "missing"}`
  );
  logger.info(
    `${format.label("rsc pkgs")} ${result.usesRscPackages ? format.value("found") : "not found"}`
  );
  logger.info(
    `${format.label("server actions")} ${
      result.serverActionFiles.length > 0
        ? format.value(`${result.serverActionFiles.length} file(s)`)
        : "no matches"
    }`
  );

  if (!result.hasNext && !result.appDirExists) {
    logger.warn("Next.js App Router signals not found. RSC is unlikely here.");
    return;
  }

  if (result.appDirExists) {
    logger.success("App Router directory detected. RSC support is likely enabled.");
  }

  if (result.serverActionFiles.length > 0) {
    logger.success('Server Actions detected via "use server".');
  } else {
    logger.warn(
      'No "use server" markers found. If you use Server Actions, ensure files include the directive.'
    );
  }
};

const handleRemoteRscScan = async (url: URL): Promise<RscOutcome> => {
  logger.warn("Note: reactscan performs only safe, read-only, non-intrusive checks.");

  if (!isLocalhost(url)) {
    logger.info(`This action will scan an external site: ${url.toString()}`);
    logger.info("Only safe, non-intrusive checks will be performed.");
    const confirmed = await confirmPrompt("Do you want to continue? (y/N) ");
    if (!confirmed) {
      return { ok: false, message: "Scan cancelled by user." };
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });

    const headerHints: string[] = [];
    let headerFlight = false;
    let contentTypeRsc = false;

    response.headers.forEach((value, key) => {
      const pair = `${key}: ${value}`;
      if (/react|next|flight/i.test(key) || /react|next|flight/i.test(value)) {
        headerHints.push(pair);
      }
      if (key.toLowerCase() === "x-react-flight") {
        headerFlight = true;
      }
      if (key.toLowerCase() === "content-type" && value.includes("text/x-component")) {
        contentTypeRsc = true;
      }
    });

    const body = await response.text();
    const bodyMarkers: string[] = [];
    if (body.includes("react-server-dom-webpack")) bodyMarkers.push("react-server-dom-webpack");
    if (body.includes("__next_f")) bodyMarkers.push("__next_f");
    if (body.includes("use server")) bodyMarkers.push("use server");
    if (/app[-_]router/i.test(body)) bodyMarkers.push("App Router marker");

    return {
      ok: true,
      result: {
        type: "remote",
        url: url.toString(),
        status: response.status,
        headerFlight,
        contentTypeRsc,
        headerHints: [...new Set(headerHints)],
        bodyMarkers,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return { ok: false, message: `Network error during remote scan: ${message}` };
  }
};

const printRemoteRsc = (result: RemoteRscResult): void => {
  logger.heading(`Remote RSC signals for ${result.url}`);
  logger.info(`${format.label("status")} ${result.status}`);
  logger.info(
    `${format.label("header")} X-React-Flight: ${result.headerFlight ? format.value("present") : "missing"}`
  );
  logger.info(
    `${format.label("header")} Content-Type text/x-component: ${result.contentTypeRsc ? format.value("present") : "missing"}`
  );

  if (result.headerHints.length > 0) {
    logger.info(`${format.label("header hints")} ${result.headerHints.join("; ")}`);
  }

  if (result.bodyMarkers.length > 0) {
    logger.success(`Body markers detected: ${result.bodyMarkers.join(", ")}`);
  } else {
    logger.warn("No obvious RSC markers found in response body.");
  }
};

export const runRscCheck = async (input?: string): Promise<RscOutcome> => {
  const candidate = input ?? process.cwd();
  let url: URL | null = null;

  try {
    url = new URL(candidate);
  } catch {
    url = null;
  }

  if (url) {
    const outcome = await handleRemoteRscScan(url);
    if (outcome.ok) {
      printRemoteRsc(outcome.result as RemoteRscResult);
    } else {
      if ("message" in outcome) {
        logger.error(outcome.message);
      } else {
        logger.error("Unknown error occurred.");
      }
    }
    return outcome;
  }

  const cwd = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
  const outcome = await analyzeLocalRsc(cwd);
  if (outcome.ok) {
    printLocalRsc(outcome.result as LocalRscResult);
  } else {
    if ("message" in outcome) {
      logger.error(outcome.message);
    } else {
      logger.error("Unknown error occurred.");
    }
  }
  return outcome;
};

export const registerRscCommand = (program: Command): void => {
  program
    .command("rsc")
    .argument("[pathOrUrl]", "Local directory or URL to inspect.")
    .description("Inspect Next.js App Router and server action usage.")
    .action(async (pathOrUrl?: string) => {
      const outcome = await runRscCheck(pathOrUrl);
      if (!outcome.ok) {
        process.exitCode = 1;
      }
    });
};

export { analyzeLocalRsc, handleRemoteRscScan };
