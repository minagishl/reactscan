import path from "path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { runDepsCheck } from "./deps.js";
import { runRscCheck } from "./rsc.js";

export const registerCheckCommand = (program: Command): void => {
  program
    .command("check")
    .argument("<target>", "Check target: deps | rsc")
    .description("Run targeted checks.")
    .action(async (target: string) => {
      const cwd = path.resolve(process.cwd());

      if (target === "deps") {
        await runDepsCheck(cwd);
        return;
      }

      if (target === "rsc") {
        await runRscCheck(cwd);
        return;
      }

      logger.error(`Unknown target "${target}". Use "deps" or "rsc".`);
      process.exitCode = 1;
    });
};
