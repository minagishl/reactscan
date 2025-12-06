import path from "path";
import { pathToFileURL } from "url";
import { readJsonFile, pathExists } from "../utils/fs.js";

export type RemoteConfig = {
  timeout?: number;
};

export type ReactscanConfig = {
  ignore?: string[];
  remote?: RemoteConfig;
  pluginsDir?: string;
};

const defaultConfig: Required<ReactscanConfig> = {
  ignore: [],
  remote: {
    timeout: 5000,
  },
  pluginsDir: "plugins",
};

const CONFIG_FILES = [
  ".reactscanrc.json",
  ".reactscanrc",
  "reactscan.config.json",
  "reactscan.config.js",
  "reactscan.config.mjs",
  "reactscan.config.cjs",
];

const loadConfigFromPackageJson = async (cwd: string): Promise<ReactscanConfig | null> => {
  const pkgPath = path.join(cwd, "package.json");
  const pkg = await readJsonFile<{ reactscan?: ReactscanConfig }>(pkgPath);
  return pkg?.reactscan ?? null;
};

const loadJsConfig = async (configPath: string): Promise<ReactscanConfig | null> => {
  try {
    const mod = await import(pathToFileURL(configPath).toString());
    return mod.default ?? null;
  } catch {
    return null;
  }
};

export const loadConfig = async (cwd: string): Promise<ReactscanConfig> => {
  let userConfig: ReactscanConfig | null = null;

  // Try config files in order
  for (const fileName of CONFIG_FILES) {
    const configPath = path.join(cwd, fileName);
    if (await pathExists(configPath)) {
      if (fileName.endsWith(".js") || fileName.endsWith(".mjs") || fileName.endsWith(".cjs")) {
        userConfig = await loadJsConfig(configPath);
      } else {
        userConfig = await readJsonFile<ReactscanConfig>(configPath);
      }
      if (userConfig) break;
    }
  }

  // Fallback to package.json if no config file found
  if (!userConfig) {
    userConfig = await loadConfigFromPackageJson(cwd);
  }

  return {
    ignore: userConfig?.ignore ?? defaultConfig.ignore,
    remote: {
      timeout: userConfig?.remote?.timeout ?? defaultConfig.remote.timeout,
    },
    pluginsDir: userConfig?.pluginsDir ?? defaultConfig.pluginsDir,
  };
};
