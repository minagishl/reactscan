import path from "path";
import { Command } from "commander";
import { logger, setLogLevel, format } from "../utils/logger.js";
import { scanCVE, listCVEs } from "../utils/cve/scanner.js";
import { Timer } from "../utils/output.js";

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
      logger.warn("No lockfile found. Run npm/pnpm/yarn install first.");
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

export const registerCVECommand = (program: Command): void => {
  program
    .command("cve")
    .argument("[cve-id]", "Specific CVE ID to check (e.g., CVE-2025-55182)")
    .option("--list", "List available CVE rules")
    .option("--debug", "Enable debug logging")
    .description("Check for known CVE vulnerabilities in dependencies.")
    .action(async (cveId: string | undefined, options: { list?: boolean; debug?: boolean }) => {
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

      const cwd = path.resolve(process.cwd());
      const result = await runCVE(cwd, cveId, Boolean(options.debug));
      if (!result.ok) process.exitCode = 1;
    });
};
