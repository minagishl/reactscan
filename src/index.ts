#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { registerScanCommand } from "./commands/scan.js";
import { registerCheckCommand } from "./commands/check.js";
import { registerDepsCommand } from "./commands/deps.js";
import { registerRscCommand } from "./commands/rsc.js";
import { registerReportCommand } from "./commands/report.js";
import { registerInitCommand } from "./commands/init.js";
import { suggestCommand } from "./utils/suggest.js";
import { logger } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string; name?: string };

const program = new Command();

program
  .name("reactscan")
  .description("Non-intrusive CLI to statically inspect React / Next.js projects.")
  .version(pkg.version || "0.0.0");

program.configureOutput({
  writeErr: (str) => logger.error(str.trim()),
  writeOut: (str) => process.stdout.write(str),
  outputError: (str) => logger.error(str.trim()),
});

program.on("command:*", ([cmd]) => {
  const suggestion = suggestCommand(cmd, [
    "scan",
    "deps",
    "rsc",
    "report",
    "init",
    "check",
    "version",
  ]);
  logger.error(`Unknown command "${cmd}".`);
  if (suggestion) {
    logger.info(`Did you mean "${suggestion}"?`);
  }
  process.exitCode = 1;
});

registerScanCommand(program);
registerCheckCommand(program);
registerDepsCommand(program);
registerRscCommand(program);
registerReportCommand(program);
registerInitCommand(program);

program
  .command("version")
  .description("Print reactscan version.")
  .action(() => {
    console.log(pkg.version || "unknown");
  });

program.parse(process.argv);
