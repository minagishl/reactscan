import { logger } from "./logger.js";

export enum ErrorType {
  NETWORK = "network",
  FILESYSTEM = "filesystem",
  PARSE = "parse",
  CONFIG = "config",
  UNKNOWN = "unknown",
}

export class ReactscanError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public originalError?: Error
  ) {
    super(message);
    this.name = "ReactscanError";
  }
}

export const classifyError = (error: unknown): ReactscanError => {
  if (error instanceof ReactscanError) {
    return error;
  }

  const err = error as Error;
  const message = err?.message || String(error);

  if (
    message.includes("ENOENT") ||
    message.includes("EACCES") ||
    message.includes("EPERM") ||
    message.includes("file") ||
    message.includes("directory")
  ) {
    return new ReactscanError(message, ErrorType.FILESYSTEM, err);
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ECONNREFUSED") ||
    message.includes("timeout")
  ) {
    return new ReactscanError(message, ErrorType.NETWORK, err);
  }

  if (message.includes("JSON") || message.includes("parse") || message.includes("SyntaxError")) {
    return new ReactscanError(message, ErrorType.PARSE, err);
  }

  if (message.includes("config")) {
    return new ReactscanError(message, ErrorType.CONFIG, err);
  }

  return new ReactscanError(message, ErrorType.UNKNOWN, err);
};

export const handleError = (error: unknown, debug = false): string => {
  const classified = classifyError(error);

  let prefix = "";
  switch (classified.type) {
    case ErrorType.NETWORK:
      prefix = "[Network Error]";
      break;
    case ErrorType.FILESYSTEM:
      prefix = "[Filesystem Error]";
      break;
    case ErrorType.PARSE:
      prefix = "[Parse Error]";
      break;
    case ErrorType.CONFIG:
      prefix = "[Config Error]";
      break;
    default:
      prefix = "[Error]";
  }

  const message = `${prefix} ${classified.message}`;

  if (debug && classified.originalError?.stack) {
    logger.debug(`Stack trace:\n${classified.originalError.stack}`);
  }

  return message;
};

export const safeAsync = async <T>(
  fn: () => Promise<T>,
  fallback: T,
  debug = false
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (debug) {
      const errorMsg = handleError(error, debug);
      logger.debug(errorMsg);
    }
    return fallback;
  }
};
