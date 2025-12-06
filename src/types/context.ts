import { ReactscanConfig } from "../config/loadConfig.js";

import { ScanResult } from "./result.js";

export interface ScanContext {
  cwd: string;
  command: string;
  input?: string;
  config: ReactscanConfig;
  debug: boolean;
  baseResult?: ScanResult;
}
