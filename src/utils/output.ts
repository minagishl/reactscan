import { format, logger } from "./logger.js";
import { ScanResult } from "../types/result.js";

export type OutputOptions = {
  quiet?: boolean;
  showTiming?: boolean;
  elapsed?: number;
};

export const renderResult = (
  result: ScanResult,
  onSuccess?: (res: ScanResult) => void,
  options: OutputOptions = {}
): void => {
  if (options.quiet) {
    if (!result.ok) {
      result.errors.forEach((err) => logger.error(err));
    }
    return;
  }

  if (!result.ok) {
    logger.heading("Errors:");
    result.errors.forEach((err) => logger.error(`  ${err}`));
  }

  if (result.warnings.length > 0) {
    logger.heading("Warnings:");
    result.warnings.forEach((warn) => logger.warn(`  ${warn}`));
  }

  if (result.ok && onSuccess) {
    onSuccess(result);
  }

  if (options.showTiming && options.elapsed !== undefined) {
    logger.info(`\n${format.label("elapsed")} ${format.value(`${options.elapsed}ms`)}`);
  }
};

export class Timer {
  private start: number;

  constructor() {
    this.start = Date.now();
  }

  elapsed(): number {
    return Date.now() - this.start;
  }

  reset(): void {
    this.start = Date.now();
  }
}
