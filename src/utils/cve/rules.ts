import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { CVERule } from "../../types/cve.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RULES_DIR = join(__dirname, "../../../rules");

let cachedRules: CVERule[] | null = null;

export function loadRules(): CVERule[] {
  if (cachedRules) {
    return cachedRules;
  }

  const rules: CVERule[] = [];

  if (!existsSync(RULES_DIR)) {
    console.error(`Rules directory not found: ${RULES_DIR}`);
    return rules;
  }

  try {
    const files = readdirSync(RULES_DIR);

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = join(RULES_DIR, file);
      const content = readFileSync(filePath, "utf-8");
      const rule = JSON.parse(content) as CVERule;

      if (!rule.id || !rule.packages || !Array.isArray(rule.packages)) {
        console.error(`Invalid rule file: ${file}`);
        continue;
      }

      rules.push(rule);
    }
  } catch (error) {
    console.error("Failed to load rules:", error);
  }

  cachedRules = rules;
  return rules;
}

export function getRule(cveId: string): CVERule | undefined {
  const rules = loadRules();
  return rules.find((rule) => rule.id === cveId);
}

export function getAllCVEIds(): string[] {
  const rules = loadRules();
  return rules.map((rule) => rule.id);
}

export function clearRulesCache(): void {
  cachedRules = null;
}
