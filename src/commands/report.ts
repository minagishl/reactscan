import path from "path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { writeFileSafe } from "../utils/fs.js";
import { performScan, ScanOutcome } from "./scan.js";
import { performDepsCheck, DepsOutcome } from "./deps.js";
import { analyzeLocalRsc, RscOutcome } from "./rsc.js";

type ReportFormat = "json" | "html";

type ReportData = {
  generatedAt: string;
  cwd: string;
  scan: ScanOutcome;
  deps: DepsOutcome;
  rsc: RscOutcome;
};

const buildJsonReport = (data: ReportData): string => JSON.stringify(data, null, 2);

const renderOutcome = (outcome: ScanOutcome | DepsOutcome | RscOutcome): string => {
  const message = "message" in outcome ? outcome.message : "Unknown error occurred.";
  if (!outcome.ok) return `<p class="error">${escapeHtml(message)}</p>`;
  return `<pre>${escapeHtml(JSON.stringify(outcome, null, 2))}</pre>`;
};

const escapeHtml = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const buildHtmlReport = (data: ReportData): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>reactscan report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
    h1 { margin-bottom: 4px; }
    h2 { margin: 16px 0 8px; }
    .section { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    pre { background: #0b1224; padding: 12px; border-radius: 8px; overflow-x: auto; }
    .meta { color: #94a3b8; font-size: 14px; }
    .error { color: #f97316; }
  </style>
</head>
<body>
  <h1>reactscan report</h1>
  <div class="meta">Generated at ${data.generatedAt}</div>
  <div class="meta">Path: ${escapeHtml(data.cwd)}</div>
  <div class="section">
    <h2>Scan</h2>
    ${renderOutcome(data.scan)}
  </div>
  <div class="section">
    <h2>Dependencies</h2>
    ${renderOutcome(data.deps)}
  </div>
  <div class="section">
    <h2>RSC</h2>
    ${renderOutcome(data.rsc)}
  </div>
</body>
</html>`;

const defaultOutPath = (format: ReportFormat, cwd: string): string =>
  path.join(cwd, format === "html" ? "reactscan-report.html" : "reactscan-report.json");

export const runReport = async (
  options: { format?: ReportFormat; out?: string },
  cwd = process.cwd()
): Promise<void> => {
  const format: ReportFormat = options.format === "html" ? "html" : "json";
  const outPath = options.out
    ? path.isAbsolute(options.out)
      ? options.out
      : path.join(cwd, options.out)
    : defaultOutPath(format, cwd);

  const data: ReportData = {
    generatedAt: new Date().toISOString(),
    cwd,
    scan: await performScan(cwd),
    deps: await performDepsCheck(cwd),
    rsc: await analyzeLocalRsc(cwd),
  };

  const content = format === "html" ? buildHtmlReport(data) : buildJsonReport(data);

  await writeFileSafe(outPath, content);
  logger.success(`Report written to ${outPath}`);
};

export const registerReportCommand = (program: Command): void => {
  program
    .command("report")
    .option("--format <format>", "json or html", "json")
    .option("--out <path>", "Output file path")
    .description("Generate scan report in JSON or HTML.")
    .action(async (options: { format?: ReportFormat; out?: string }) => {
      await runReport(options, process.cwd());
    });
};
