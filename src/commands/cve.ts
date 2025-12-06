import path from "path";
import { Command } from "commander";
import { logger, setLogLevel, format } from "../utils/logger.js";
import { scanCVE, listCVEs } from "../utils/cve/scanner.js";
import { scanRemoteCVE } from "../utils/cve/remote.js";
import { Timer } from "../utils/output.js";

const looksLikeUrl = (value?: string): boolean => {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const parseTimeout = (value?: string): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.warn(`Invalid timeout value "${value}". Falling back to default.`);
    return undefined;
  }
  return parsed;
};

export const runCVE = async (
  cwd: string,
  cveId?: string,
  debug = false
): Promise<{ ok: boolean }> => {
  const timer = new Timer();
  if (debug) setLogLevel("debug");

  try {
    const result = scanCVE({ cwd, cveId });

    if (debug) {
      logger.debug(`Scanned ${result.scannedPackages} packages`);
    }

    if (result.scannedPackages === 0) {
      logger.warn("No lockfile found. Run bun install (or npm/pnpm/yarn) first.");
      return { ok: false };
    }

    logger.heading(`CVE Scan Results (${result.cve})`);
    logger.info(`Scanned ${result.scannedPackages} packages\n`);

    if (result.vulnerable && result.findings.length > 0) {
      logger.error(`Found ${result.findings.length} vulnerable package(s):\n`);

      for (const finding of result.findings) {
        logger.error(`  ${finding.package}`);
        logger.info(`    Current version: ${format.value(finding.currentVersion)}`);
        logger.info(`    Fixed version:   ${format.value(finding.fixedVersion)}`);
        logger.info(`    Severity:        ${format.label(finding.severity)}`);
        if (finding.advisoryUrl) {
          logger.info(`    Advisory:        ${finding.advisoryUrl}`);
        }
        logger.info("");
      }

      logger.error("Action required: Upgrade vulnerable packages to fixed versions.");
      logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
      return { ok: false };
    }

    logger.success("No vulnerabilities detected.");
    logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`CVE scan failed: ${message}`);
    if (debug && error instanceof Error) {
      logger.debug(error.stack || "");
    }
    return { ok: false };
  }
};

export const runRemoteCVE = async (
  url: string,
  cveId: string,
  timeoutMs?: number,
  debug = false
): Promise<{ ok: boolean }> => {
  const timer = new Timer();
  if (debug) setLogLevel("debug");

  if (cveId !== "CVE-2025-55182") {
    logger.error("Remote URL scanning is only implemented for CVE-2025-55182 at this time.");
    return { ok: false };
  }

  try {
    const result = await scanRemoteCVE(url, { timeout: timeoutMs, cveId, debug });

    logger.heading(`Remote CVE Scan Results (${result.cve})`);
    logger.info(`Target: ${format.value(result.url)}`);

    if (result.error) {
      logger.warn(`Scan failed: ${result.error}`);
      logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
      return { ok: false };
    }

    logger.info(`Status: ${format.value(String(result.statusCode ?? "n/a"))}`);
    logger.info(`Response time: ${format.value(`${result.responseTime}ms`)}`);

    if (result.vulnerable) {
      logger.error("Target appears VULNERABLE to this CVE.");
      if (result.signature) {
        logger.info(`Signature: ${format.value(result.signature)}`);
      }
      logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
      return { ok: false };
    }

    logger.success("No remote vulnerability indicators detected.");
    logger.info(`\n${format.label("elapsed")} ${format.value(`${timer.elapsed()}ms`)}`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Remote CVE scan failed: ${message}`);
    if (debug && error instanceof Error) {
      logger.debug(error.stack || "");
    }
    return { ok: false };
  }
};

export const registerCVECommand = (program: Command): void => {
  program
    .command("cve")
    .argument(
      "[cve-id-or-url]",
      "CVE ID to check (e.g., CVE-2025-55182). Accepts URL when using --url."
    )
    .option("--list", "List available CVE rules")
    .option("--debug", "Enable debug logging")
    .option("--url <remote>", "Scan a remote URL for CVE indicators (CVE-2025-55182)")
    .option("--timeout <ms>", "Request timeout for remote URL scans", "10000")
    .description("Check for known CVE vulnerabilities in dependencies or remote endpoints.")
    .action(
      async (
        cveId: string | undefined,
        options: {
          list?: boolean;
          debug?: boolean;
          url?: string;
          timeout?: string;
        }
      ) => {
        if (options.list) {
          const cves = listCVEs();
          if (cves.length === 0) {
            logger.warn("No CVE rules found.");
            return;
          }

          logger.heading("Available CVE Rules:");
          for (const cve of cves) {
            logger.info(`  ${format.value(cve.id)} - ${cve.title}`);
            logger.info(`    Severity: ${format.label(cve.severity)}\n`);
          }
          return;
        }

        const argIsUrl = looksLikeUrl(cveId);
        const targetUrl = options.url || (argIsUrl ? cveId : undefined);
        const selectedCveId = argIsUrl ? undefined : cveId;

        if (targetUrl) {
          const timeout = parseTimeout(options.timeout);
          const cveToScan = selectedCveId || "CVE-2025-55182";
          const result = await runRemoteCVE(targetUrl, cveToScan, timeout, Boolean(options.debug));
          if (!result.ok) process.exitCode = 1;
          return;
        }

        const cwd = path.resolve(process.cwd());
        const result = await runCVE(cwd, selectedCveId, Boolean(options.debug));
        if (!result.ok) process.exitCode = 1;
      }
    );
};
