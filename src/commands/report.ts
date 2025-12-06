import path from "path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { writeFileSafe } from "../utils/fs.js";
import { performScan } from "./scan.js";
import { performDepsCheck } from "./deps.js";
import { analyzeLocalRsc } from "./rsc.js";
import { ScanResult } from "../types/result.js";

type ReportFormat = "json" | "html";

type ReportData = {
  generatedAt: string;
  cwd: string;
  scan: ScanResult;
  deps: ScanResult;
  rsc: ScanResult;
};

const escapeHtml = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderWarningsErrors = (res: ScanResult): string => {
  const warnings = res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const errors = res.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="lists">
    <div><strong>Warnings</strong><ul>${warnings || "<li>None</li>"}</ul></div>
    <div><strong>Errors</strong><ul class="errors">${errors || "<li>None</li>"}</ul></div>
  </div>`;
};

const renderSection = (title: string, res: ScanResult): string => {
  const meta = escapeHtml(JSON.stringify(res.meta ?? {}, null, 2));
  return `<div class="section">
    <div class="section-title">${title}</div>
    ${renderWarningsErrors(res)}
    <details>
      <summary>Meta</summary>
      <pre>${meta}</pre>
    </details>
  </div>`;
};

const buildHtmlReport = (data: ReportData): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>reactscan report</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0b1221; color: #e5e7eb; margin: 0; padding: 28px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #9ca3af; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .section { background: linear-gradient(135deg, #111827, #0f172a); border: 1px solid #1f2937; border-radius: 12px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
    .section-title { font-weight: 700; margin-bottom: 8px; }
    pre { background: #0b1224; padding: 10px; border-radius: 8px; overflow-x: auto; border: 1px solid #1f2937; }
    details { margin-top: 10px; }
    summary { cursor: pointer; }
    ul { padding-left: 18px; margin: 6px 0; }
    .lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .errors li { color: #f87171; }
  </style>
</head>
<body>
  <h1>reactscan report</h1>
  <div class="meta">Generated at ${escapeHtml(data.generatedAt)} · Path: ${escapeHtml(data.cwd)}</div>
  <div class="grid">
    ${renderSection("Scan", data.scan)}
    ${renderSection("Dependencies", data.deps)}
    ${renderSection("RSC", data.rsc)}
  </div>
</body>
</html>`;

const buildJsonReport = (data: ReportData, pretty = false): string =>
  JSON.stringify(data, null, pretty ? 2 : 0);

const defaultOutPath = (format: ReportFormat, cwd: string): string =>
  path.join(cwd, format === "html" ? "reactscan-report.html" : "reactscan-report.json");

export const runReport = async (
  options: { format?: ReportFormat; out?: string; pretty?: boolean },
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

  const content =
    format === "html" ? buildHtmlReport(data) : buildJsonReport(data, Boolean(options.pretty));

  await writeFileSafe(outPath, content);
  logger.success(`Report written to ${outPath}`);
};

export const registerReportCommand = (program: Command): void => {
  program
    .command("report")
    .option("--format <format>", "json or html", "json")
    .option("--out <path>", "Output file path")
    .option("--pretty", "Pretty print JSON output")
    .description("Generate scan report in JSON or HTML.")
    .action(async (options: { format?: ReportFormat; out?: string; pretty?: boolean }) => {
      await runReport(options, process.cwd());
    });
};
