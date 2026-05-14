import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

let cache: string | null = null;

function resolvePromptPath(): string {
  const cwd = process.cwd();
  const fromApp = path.join(cwd, "src", "ai", "SystemPrompt.txt");
  const fromMonorepoRoot = path.join(cwd, "apps", "web", "src", "ai", "SystemPrompt.txt");
  if (existsSync(fromApp)) return fromApp;
  if (existsSync(fromMonorepoRoot)) return fromMonorepoRoot;
  return fromApp;
}

/** Server-only: reads the Scarlet Oracle constitution from disk (cached). */
export async function loadScarletOracleSystemPrompt(): Promise<string> {
  if (cache) return cache;
  const filePath = resolvePromptPath();
  cache = await fs.readFile(filePath, "utf8");
  return cache;
}
