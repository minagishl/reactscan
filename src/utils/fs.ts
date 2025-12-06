import { promises as fs } from "fs";
import path from "path";

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

export const findFilesWithString = async (
  rootDir: string,
  needle: string,
  extensions: string[] = [".js", ".jsx", ".ts", ".tsx"],
  ignore: string[] = []
): Promise<string[]> => {
  const matches: string[] = [];
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (ignore.some((pattern) => fullPath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (!extensions.some((ext) => entry.name.endsWith(ext))) {
        continue;
      }

      try {
        const fileContent = await fs.readFile(fullPath, "utf8");
        if (fileContent.includes(needle)) {
          matches.push(fullPath);
        }
      } catch {
        continue;
      }
    }
  }

  return matches;
};
