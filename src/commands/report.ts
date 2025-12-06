import path from "path";
import { Command } from "commander";
import { logger, setLogLevel } from "../utils/logger.js";
import { writeFileSafe, readPackageJson } from "../utils/fs.js";
import { performScan } from "./scan.js";
import { performDepsCheck } from "./deps.js";
import { analyzeLocalRsc } from "./rsc.js";
import { ScanResult } from "../types/result.js";
import { loadConfig } from "../config/loadConfig.js";
import { loadPlugins, runPlugins } from "../plugins/index.js";
import { ScanContext } from "../types/context.js";

type ReportFormat = "json" | "html";

type ReportData = {
  schema: "reactscan-report@1.0.0";
  generatedAt: string;
  version?: string;
  cwd: string;
  results: {
    scan: ScanResult;
    deps: ScanResult;
    rsc: ScanResult;
  };
};

const escapeHtml = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderWarningsErrors = (res: ScanResult): string => {
  const warnings = res.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("") || "<li>None</li>";
  const errors = res.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("") || "<li>None</li>";
  return `<div class="lists">
    <div><strong>Warnings</strong><ul>${warnings}</ul></div>
    <div><strong>Errors</strong><ul class="errors">${errors}</ul></div>
  </div>`;
};

const renderSection = (title: string, res: ScanResult, accent: string): string => {
  const meta = escapeHtml(JSON.stringify(res.meta ?? {}, null, 2));
  return `<section id="${title.toLowerCase()}">
    <div class="section-title" style="border-left: 4px solid ${accent}; padding-left: 8px;">${title}</div>
    ${renderWarningsErrors(res)}
    <details>
      <summary>Meta</summary>
      <pre>${meta}</pre>
    </details>
  </section>`;
};

const buildHtmlReport = (data: ReportData): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>reactscan report</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0c1220; color: #e5e7eb; margin: 0; padding: 28px; line-height: 1.6; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #9ca3af; margin-bottom: 16px; }
    nav { margin: 12px 0 18px; }
    nav a { color: #93c5fd; margin-right: 12px; text-decoration: none; }
    nav a:hover { text-decoration: underline; }
    section { background: #0f172a; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); margin-bottom: 14px; }
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
  <div class="meta">Generated at ${escapeHtml(data.generatedAt)} · Path: ${escapeHtml(data.cwd)} · Version: ${escapeHtml(
    data.version || "unknown"
  )}</div>
  <nav>
    <a href="#scan">Scan</a>
    <a href="#dependencies">Dependencies</a>
    <a href="#rsc">RSC</a>
  </nav>
  ${renderSection("Scan", data.results.scan, "#22d3ee")}
  ${renderSection("Dependencies", data.results.deps, "#c084fc")}
  ${renderSection("RSC", data.results.rsc, "#fca5a5")}
</body>
</html>`;

const buildJsonReport = (data: ReportData, pretty = false): string =>
  JSON.stringify(data, null, pretty ? 2 : 0);

const defaultOutPath = (format: ReportFormat, cwd: string): string =>
  path.join(cwd, format === "html" ? "reactscan-report.html" : "reactscan-report.json");

export const registerReportCommand = (program: Command): void => {
  program
    .command("report")
    .option("--format <format>", "json or html", "json")
    .option("--out <path>", "Output file path")
    .option("--pretty", "Pretty print JSON output")
    .option("--debug", "Enable debug logging")
    .description("Generate scan report in JSON or HTML.")
    .action(
      async (options: {
        format?: ReportFormat;
        out?: string;
        pretty?: boolean;
        debug?: boolean;
      }) => {
        const cwd = process.cwd();
        if (options.debug) setLogLevel("debug");
        const config = await loadConfig(cwd);
        const pkg = await readPackageJson(cwd);
        const plugins = await loadPlugins(cwd, Boolean(options.debug));

        const makeContext = (command: string): ScanContext => ({
          cwd,
          command,
          config,
          debug: Boolean(options.debug),
        });

        const scanBase = await performScan(makeContext("scan"));
        const scan = await runPlugins(plugins, {
          ...makeContext("scan"),
          baseResult: scanBase,
        }).then((p) => ({
          ok: scanBase.ok && p.ok,
          warnings: [...scanBase.warnings, ...p.warnings],
          errors: [...scanBase.errors, ...p.errors],
          meta: { ...scanBase.meta, ...p.meta },
        }));

        const depsBase = await performDepsCheck(makeContext("deps"));
        const deps = await runPlugins(plugins, {
          ...makeContext("deps"),
          baseResult: depsBase,
        }).then((p) => ({
          ok: depsBase.ok && p.ok,
          warnings: [...depsBase.warnings, ...p.warnings],
          errors: [...depsBase.errors, ...p.errors],
          meta: { ...depsBase.meta, ...p.meta },
        }));

        const rscBase = await analyzeLocalRsc(makeContext("rsc"));
        const rsc = await runPlugins(plugins, { ...makeContext("rsc"), baseResult: rscBase }).then(
          (p) => ({
            ok: rscBase.ok && p.ok,
            warnings: [...rscBase.warnings, ...p.warnings],
            errors: [...rscBase.errors, ...p.errors],
            meta: { ...rscBase.meta, ...p.meta },
          })
        );

        const data: ReportData = {
          schema: "reactscan-report@1.0.0",
          generatedAt: new Date().toISOString(),
          version: pkg?.version,
          cwd,
          results: { scan, deps, rsc },
        };

        const format: ReportFormat = options.format === "html" ? "html" : "json";
        const outPath = options.out
          ? path.isAbsolute(options.out)
            ? options.out
            : path.join(cwd, options.out)
          : defaultOutPath(format, cwd);

        const content =
          format === "html"
            ? buildHtmlReport(data)
            : buildJsonReport(data, Boolean(options.pretty));
        await writeFileSafe(outPath, content);
        logger.success(`Report written to ${outPath}`);
      }
    );
};
