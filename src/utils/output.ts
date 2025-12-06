import { logger } from "./logger.js";
import { ScanResult } from "../types/result.js";

export const renderResult = (result: ScanResult, onSuccess?: (res: ScanResult) => void): void => {
  if (!result.ok) {
    result.errors.forEach((err) => logger.error(err));
  }
  result.warnings.forEach((warn) => logger.warn(warn));
  if (result.ok && onSuccess) {
    onSuccess(result);
  }
};
