import path from "path";
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { loadConfig } from "../config/loadConfig.js";
import { performScan } from "../commands/scan.js";
import { performDepsCheck } from "../commands/deps.js";
import { analyzeLocalRsc, handleRemoteRscScan } from "../commands/rsc.js";
import { loadPlugins, runPlugins } from "../plugins/index.js";
import { ScanContext } from "../types/context.js";
import { ScanResult } from "../types/result.js";
import { scanCVE } from "../utils/cve/scanner.js";
import { scanRemoteCVE } from "../utils/cve/remote.js";
import { setLogLevel } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version?: string };

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type McpStartOptions = {
  debug?: boolean;
};

const stringifyMeta = (meta: unknown): string => {
  try {
    return JSON.stringify(meta ?? {}, null, 2);
  } catch {
    return "[unserializable meta]";
  }
};

const buildToolResponse = (
  title: string,
  ok: boolean,
  warnings: string[],
  errors: string[],
  meta?: Record<string, unknown>
): ToolResponse => {
  const warningText = warnings.length > 0 ? warnings.map((w) => `- ${w}`).join("\n") : "- none";
  const errorText = errors.length > 0 ? errors.map((e) => `- ${e}`).join("\n") : "- none";

  const summary = [
    `${title}: ${ok ? "ok" : "issues found"}`,
    `Warnings (${warnings.length}):`,
    warningText,
    `Errors (${errors.length}):`,
    errorText,
    `Meta: ${stringifyMeta(meta ?? {})}`,
  ].join("\n");

  return {
    content: [{ type: "text", text: summary }],
    structuredContent: { title, ok, warnings, errors, meta },
    isError: !ok,
  };
};

const mergeWithPlugins = async (context: ScanContext, base: ScanResult): Promise<ScanResult> => {
  const plugins = await loadPlugins(context.cwd, context.debug);
  const pluginResult = await runPlugins(plugins, { ...context, baseResult: base });

  return {
    ok: base.ok && pluginResult.ok,
    warnings: [...base.warnings, ...pluginResult.warnings],
    errors: [...base.errors, ...pluginResult.errors],
    meta: { ...base.meta, ...pluginResult.meta },
  };
};

const isProbablyUrl = (input?: string): boolean => {
  if (!input) return false;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export const startMcpServer = async (options: McpStartOptions = {}): Promise<void> => {
  // Avoid stdout logging interfering with MCP stdio messages.
  setLogLevel("error");
  const debug = Boolean(options.debug);
  const debugLog = (...args: unknown[]) => {
    if (debug) console.error("[reactscan:mcp]", ...args);
  };

  const server = new McpServer(
    {
      name: "reactscan",
      version: pkg.version || "dev",
      websiteUrl: "https://github.com/minagishl/reactscan",
    },
    {
      capabilities: { tools: {} },
      instructions:
        "Use reactscan tools to inspect React/Next.js projects. Paths default to the current working directory.",
    }
  );

  server.registerTool(
    "scan",
    {
      title: "Scan project",
      description: "Detect React/Next.js presence and RSC signals in a directory.",
      inputSchema: {
        path: z.string().describe("Directory to scan").optional(),
        useCache: z.boolean().describe("Whether to use cached results").optional(),
      },
    },
    async ({ path: targetPath, useCache }) => {
      try {
        const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
        const config = await loadConfig(cwd);
        const context: ScanContext = { cwd, command: "scan", config, debug };
        const base = await performScan(context, useCache !== false);
        const merged = await mergeWithPlugins(context, base);

        return buildToolResponse("scan", merged.ok, merged.warnings, merged.errors, {
          cwd,
          meta: merged.meta,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog("scan tool failed", message);
        return buildToolResponse("scan", false, [], [message]);
      }
    }
  );

  server.registerTool(
    "deps",
    {
      title: "Dependency check",
      description: "Inspect dependencies for risky version combinations.",
      inputSchema: {
        path: z.string().describe("Directory containing package.json").optional(),
        useCache: z.boolean().describe("Whether to use cached results").optional(),
      },
    },
    async ({ path: targetPath, useCache }) => {
      try {
        const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
        const config = await loadConfig(cwd);
        const context: ScanContext = { cwd, command: "deps", config, debug };
        const base = await performDepsCheck(context, useCache !== false);
        const merged = await mergeWithPlugins(context, base);

        return buildToolResponse("deps", merged.ok, merged.warnings, merged.errors, {
          cwd,
          meta: merged.meta,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog("deps tool failed", message);
        return buildToolResponse("deps", false, [], [message]);
      }
    }
  );

  server.registerTool(
    "rsc",
    {
      title: "RSC analysis",
      description: "Inspect local directories or URLs for React Server Components markers.",
      inputSchema: {
        target: z
          .string()
          .describe("Directory or URL to inspect. Defaults to current working directory.")
          .optional(),
        useCache: z.boolean().describe("Whether to use cached results for local scans").optional(),
      },
    },
    async ({ target, useCache }) => {
      const input = target || process.cwd();
      const treatAsUrl = isProbablyUrl(input);

      try {
        const cwd = treatAsUrl ? process.cwd() : path.resolve(input);
        const config = await loadConfig(cwd);
        const context: ScanContext = {
          cwd,
          command: treatAsUrl ? "remote-rsc" : "rsc",
          config,
          debug,
          input,
        };

        const base = treatAsUrl
          ? await handleRemoteRscScan(new URL(input), context, false)
          : await analyzeLocalRsc(context, useCache !== false);

        const merged = await mergeWithPlugins(context, base);

        return buildToolResponse("rsc", merged.ok, merged.warnings, merged.errors, {
          target: input,
          meta: merged.meta,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog("rsc tool failed", message);
        return buildToolResponse("rsc", false, [], [message]);
      }
    }
  );

  server.registerTool(
    "cve",
    {
      title: "CVE scan",
      description: "Scan lockfiles locally or probe remote endpoints for known CVE markers.",
      inputSchema: {
        path: z
          .string()
          .describe("Directory to scan for lockfiles. Defaults to current working directory.")
          .optional(),
        cveId: z.string().describe("Specific CVE id to check.").optional(),
        url: z.string().describe("Remote URL to probe for CVE-2025-55182 indicators.").optional(),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .describe("Timeout for remote probes in ms.")
          .optional(),
      },
    },
    async ({ path: targetPath, cveId, url, timeoutMs }) => {
      try {
        if (url) {
          const result = await scanRemoteCVE(url, {
            timeout: timeoutMs,
            cveId: cveId || "CVE-2025-55182",
            debug,
          });

          const ok = !result.vulnerable && !result.error;
          const warnings: string[] = [];
          const errors: string[] = [];
          if (result.error) errors.push(result.error);
          if (result.vulnerable) {
            const signature = result.signature ? ` (${result.signature})` : "";
            errors.push(`Remote target appears vulnerable${signature}`);
          }
          if (result.statusCode && result.statusCode >= 400) {
            warnings.push(`Remote responded with status ${result.statusCode}`);
          }

          return buildToolResponse("cve", ok, warnings, errors, {
            mode: "remote",
            result,
          });
        }

        const cwd = targetPath ? path.resolve(targetPath) : process.cwd();
        const localResult = scanCVE({ cwd, cveId });

        const warnings: string[] = [];
        const errors: string[] = [];
        let ok = !localResult.vulnerable;

        if (localResult.scannedPackages === 0) {
          warnings.push("No lockfile found. Run the package manager install step first.");
          ok = false;
        }

        if (localResult.vulnerable) {
          errors.push(`${localResult.findings.length} vulnerable package(s) detected`);
        }

        return buildToolResponse("cve", ok, warnings, errors, {
          mode: "local",
          cwd,
          result: localResult,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog("cve tool failed", message);
        return buildToolResponse("cve", false, [], [message]);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog("MCP stdio transport connected");

  await new Promise<void>((resolve) => {
    let closed = false;

    const finish = async (reason?: string) => {
      if (closed) return;
      closed = true;
      debugLog("Stopping MCP server", reason ? `(${reason})` : "");
      try {
        await server.close();
        await transport.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        debugLog("Error while closing MCP server", message);
      }
      resolve();
    };

    transport.onclose = () => finish("transport closed");
    transport.onerror = (err) => {
      console.error("MCP transport error:", err);
      finish("transport error");
    };

    const handleSignal = (signal: string) => {
      debugLog(`Received ${signal}, shutting down MCP server.`);
      void finish(signal);
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
  });
};
