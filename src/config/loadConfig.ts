import path from "path";
import { readJsonFile } from "../utils/fs.js";

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

export const loadConfig = async (cwd: string): Promise<ReactscanConfig> => {
  const configPath = path.join(cwd, "reactscan.config.json");
  const userConfig = await readJsonFile<ReactscanConfig>(configPath);

  return {
    ignore: userConfig?.ignore ?? defaultConfig.ignore,
    remote: {
      timeout: userConfig?.remote?.timeout ?? defaultConfig.remote.timeout,
    },
    pluginsDir: userConfig?.pluginsDir ?? defaultConfig.pluginsDir,
  };
};
