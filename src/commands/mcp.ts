import { Command } from "commander";
import { startMcpServer } from "../mcp/server.js";

export const registerMcpCommand = (program: Command): void => {
  program
    .command("mcp")
    .description("Start reactscan as an MCP (Model Context Protocol) server over stdio.")
    .option("--debug", "Log MCP server activity to stderr")
    .action(async (options: { debug?: boolean }) => {
      try {
        await startMcpServer({ debug: Boolean(options.debug) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to start MCP server: ${message}`);
        process.exitCode = 1;
      }
    });
};
