import path from "path";
import { Command } from "commander";
import { format, logger } from "../utils/logger.js";
import { findFilesWithString, pathExists, readPackageJson } from "../utils/fs.js";

export const runRscCheck = async (cwd = process.cwd()): Promise<void> => {
  const pkg = await readPackageJson(cwd);
  if (!pkg) {
    logger.error("package.json not found. Run this command in a project directory.");
    return;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasNext = Boolean(deps["next"]);
  const usesRscPackages = Boolean(
    deps["react-server-dom-webpack"] || deps["react-server-dom-turbopack"]
  );

  const appDir = path.join(cwd, "app");
  const appDirExists = await pathExists(appDir);
  const serverActionFiles = appDirExists ? await findFilesWithString(appDir, "use server") : [];

  logger.heading("RSC diagnosis:");
  logger.info(`${format.label("next.js")} ${hasNext ? format.value("found") : "not detected"}`);
  logger.info(`${format.label("app dir")} ${appDirExists ? format.value("present") : "missing"}`);
  logger.info(
    `${format.label("rsc pkgs")} ${usesRscPackages ? format.value("found") : "not found"}`
  );
  logger.info(
    `${format.label("server actions")} ${
      serverActionFiles.length > 0
        ? format.value(`${serverActionFiles.length} file(s)`)
        : "no matches"
    }`
  );

  if (!hasNext && !appDirExists) {
    logger.warn("Next.js App Router signals not found. RSC is unlikely here.");
    return;
  }

  if (appDirExists) {
    logger.success("App Router directory detected. RSC support is likely enabled.");
  }

  if (serverActionFiles.length > 0) {
    logger.success('Server Actions detected via "use server".');
  } else {
    logger.warn(
      'No "use server" markers found. If you use Server Actions, ensure files include the directive.'
    );
  }
};

export const registerRscCommand = (program: Command): void => {
  program
    .command("rsc")
    .description("Inspect Next.js App Router and server action usage.")
    .action(async () => runRscCheck(path.resolve(process.cwd())));
};
