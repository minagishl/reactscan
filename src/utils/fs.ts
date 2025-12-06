import { promises as fs } from "fs";
import path from "path";
import { globby } from "globby";

export type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const readJsonFile = async <T = unknown>(filePath: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

export const readPackageJson = async (cwd: string): Promise<PackageJson | null> => {
  const pkgPath = path.join(cwd, "package.json");
  return readJsonFile<PackageJson>(pkgPath);
};

export const ensureDir = async (dirPath: string): Promise<void> => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    throw new Error(`Failed to create directory: ${dirPath}`);
  }
};

export const writeFileSafe = async (filePath: string, content: string): Promise<void> => {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, content, "utf8");
};

const DEFAULT_LARGE_DIRS = [
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/out/**",
  "**/.git/**",
];

export const findFilesWithString = async (
  rootDir: string,
  needle: string,
  extensions: string[] = [".js", ".jsx", ".ts", ".tsx"],
  ignore: string[] = [],
  ignoreLargeDirs = true
): Promise<string[]> => {
  const patterns = extensions.map((ext) => `**/*${ext}`);
  const ignorePatterns = [...ignore, ...(ignoreLargeDirs ? DEFAULT_LARGE_DIRS : [])];

  try {
    const files = await globby(patterns, {
      cwd: rootDir,
      absolute: true,
      ignore: ignorePatterns,
      gitignore: true,
    });

    const matches: string[] = [];
    await Promise.all(
      files.map(async (file: string) => {
        try {
          const content = await fs.readFile(file, "utf8");
          if (content.includes(needle)) {
            matches.push(file);
          }
        } catch {
          // Skip files that can't be read
        }
      })
    );

    return matches;
  } catch {
    return [];
  }
};

export const findFiles = async (
  rootDir: string,
  extensions: string[] = [".js", ".jsx", ".ts", ".tsx"],
  ignore: string[] = [],
  ignoreLargeDirs = true
): Promise<string[]> => {
  const patterns = extensions.map((ext) => `**/*${ext}`);
  const ignorePatterns = [...ignore, ...(ignoreLargeDirs ? DEFAULT_LARGE_DIRS : [])];

  try {
    return await globby(patterns, {
      cwd: rootDir,
      absolute: true,
      ignore: ignorePatterns,
      gitignore: true,
    });
  } catch {
    return [];
  }
};
