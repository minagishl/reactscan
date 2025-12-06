import path from "path";
import { Command } from "commander";
import { logger, setLogLevel } from "../utils/logger.js";
import { runDeps } from "./deps.js";
import { runRsc } from "./rsc.js";

export const registerCheckCommand = (program: Command): void => {
  program
    .command("check")
    .argument("<target>", "Check target: deps | rsc")
    .option("--debug", "Enable debug logging")
    .description("Run targeted checks.")
    .action(async (target: string, options: { debug?: boolean }) => {
      const cwd = path.resolve(process.cwd());
      if (options.debug) setLogLevel("debug");

      if (target === "deps") {
        const res = await runDeps(cwd, Boolean(options.debug));
        if (!res.ok) process.exitCode = 1;
        return;
      }

      if (target === "rsc") {
        const res = await runRsc(cwd, Boolean(options.debug));
        if (!res.ok) process.exitCode = 1;
        return;
      }

      logger.error(`Unknown target "${target}". Use "deps" or "rsc".`);
      process.exitCode = 1;
    });
};
