import { config } from "dotenv";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

config({ quiet: true });

const dataDir = process.env.MANGLED_DATA_DIR ?? path.join(os.homedir(), ".mangled-agents");
fs.mkdirSync(dataDir, { recursive: true });

// Both the Anthropic SDK and the Agent SDK read ANTHROPIC_API_KEY; accept the
// project's CLAUDE_API_KEY as an alias so a single key in .env powers both.
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
if (anthropicApiKey) process.env.ANTHROPIC_API_KEY = anthropicApiKey;

export const env = {
  dataDir,
  dbPath: path.join(dataDir, "data.db"),
  runsDir: path.join(dataDir, "runs"),
  anthropicApiKey,
  honchoApiKey: process.env.HONCHO_API_KEY ?? process.env.HONCHO_DEV_API_KEY,
  databricksHost: process.env.DATABRICKS_HOST,
  databricksProfile: process.env.DATABRICKS_CONFIG_PROFILE,
  port: Number(process.env.PORT ?? 4173),
  isDev: process.env.MANGLED_DEV === "1",
};

fs.mkdirSync(env.runsDir, { recursive: true });
