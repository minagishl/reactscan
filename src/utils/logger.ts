import chalk from "chalk";

export type LogLevel = "error" | "warn" | "info" | "debug";

let currentLevel: LogLevel = "info";

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const shouldLog = (level: LogLevel) => levelPriority[level] <= levelPriority[currentLevel];

const formatPrefix = (level: LogLevel) => {
  if (level === "error") return chalk.red("[error]");
  if (level === "warn") return chalk.yellow("[warn]");
  if (level === "debug") return chalk.gray("[debug]");
  return chalk.cyan("[info]");
};

export const setLogLevel = (level: LogLevel) => {
  currentLevel = level;
};

export const logger = {
  info: (message: string) => {
    if (!shouldLog("info")) return;
    console.log(`${formatPrefix("info")} ${chalk.cyan(message)}`);
  },
  warn: (message: string) => {
    if (!shouldLog("warn")) return;
    console.warn(`${formatPrefix("warn")} ${chalk.yellow(message)}`);
  },
  error: (message: string) => {
    if (!shouldLog("error")) return;
    console.error(`${formatPrefix("error")} ${chalk.red(message)}`);
  },
  debug: (message: string) => {
    if (!shouldLog("debug")) return;
    console.log(`${formatPrefix("debug")} ${chalk.gray(message)}`);
  },
  success: (message: string) => {
    if (!shouldLog("info")) return;
    console.log(`${chalk.green("[ok]")} ${chalk.green(message)}`);
  },
  heading: (message: string) => {
    if (!shouldLog("info")) return;
    console.log(chalk.bold(message));
  },
};

export const format = {
  label: (label: string) => chalk.gray(`[${label}]`),
  key: (key: string) => chalk.whiteBright(key),
  value: (value: string) => chalk.cyan(value),
  success: (value: string) => chalk.green(value),
  danger: (value: string) => chalk.red(value),
  warning: (value: string) => chalk.yellow(value),
};
