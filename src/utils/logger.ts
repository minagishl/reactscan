import chalk from "chalk";

export const logger = {
  info: (message: string) => console.log(chalk.cyan(message)),
  warn: (message: string) => console.warn(chalk.yellow(message)),
  error: (message: string) => console.error(chalk.red(message)),
  success: (message: string) => console.log(chalk.green(message)),
  heading: (message: string) => console.log(chalk.bold(message)),
};

export const format = {
  label: (label: string) => chalk.gray(`[${label}]`),
  key: (key: string) => chalk.whiteBright(key),
  value: (value: string) => chalk.cyan(value),
  success: (value: string) => chalk.green(value),
  danger: (value: string) => chalk.red(value),
  warning: (value: string) => chalk.yellow(value),
};
