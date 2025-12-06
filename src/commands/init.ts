import path from "path";
import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { pathExists, writeFileSafe } from "../utils/fs.js";

const githubActionsTemplate = `name: React Scanner
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install
      - run: npx reactscan scan
      - run: npx reactscan deps
      - run: npx reactscan rsc
`;

const npmScriptsTemplate = `{
  "scripts": {
    "scan": "reactscan scan",
    "scan:deps": "reactscan deps",
    "scan:rsc": "reactscan rsc"
  }
}
`;

const writeGithubActions = async (cwd: string): Promise<void> => {
  const workflowPath = path.join(cwd, ".github", "workflows", "reactscan.yml");
  if (await pathExists(workflowPath)) {
    logger.warn(`Workflow already exists at ${workflowPath}. Skipping.`);
    return;
  }
  await writeFileSafe(workflowPath, githubActionsTemplate);
  logger.success(`Created GitHub Actions workflow at ${workflowPath}`);
};

const writeNpmScripts = async (cwd: string): Promise<void> => {
  const scriptsPath = path.join(cwd, "reactscan.scripts.json");
  if (await pathExists(scriptsPath)) {
    logger.warn(`Template already exists at ${scriptsPath}. Skipping.`);
    return;
  }
  await writeFileSafe(scriptsPath, npmScriptsTemplate);
  logger.success(`Created npm scripts template at ${scriptsPath}`);
};

export const runInit = async (template: string, cwd = process.cwd()): Promise<void> => {
  if (template === "github-actions") {
    await writeGithubActions(cwd);
    return;
  }
  if (template === "npm") {
    await writeNpmScripts(cwd);
    return;
  }

  logger.error(`Unknown template "${template}". Supported: github-actions, npm`);
};

export const registerInitCommand = (program: Command): void => {
  program
    .command("init")
    .argument("<template>", "Template to generate (e.g., github-actions)")
    .description("Generate CI or project setup templates.")
    .action(async (template: string) => {
      await runInit(template, process.cwd());
    });
};
