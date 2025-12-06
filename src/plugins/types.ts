import { ScanResult } from "../types/result.js";
import { ScanContext } from "../types/context.js";

export interface ReactscanPlugin {
  name: string;
  run: (context: ScanContext) => Promise<ScanResult>;
}
