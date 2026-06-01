import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./env";
import { configRepo } from "./db/config";

// Optional Databricks foundation-model provider for Mangler. Host and CLI profile
// are set in Settings (env vars are fallbacks). OAuth is delegated to the Databricks
// CLI: `databricks auth token` returns a fresh U2M access token, refreshing as needed.
const execFileAsync = promisify(execFile);
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export function databricksHost(): string | undefined {
  return configRepo.get("databricks_host") ?? env.databricksHost;
}

export function databricksProfile(): string {
  return configRepo.get("databricks_profile") ?? env.databricksProfile ?? "DEFAULT";
}

export function databricksConfigured(): boolean {
  return Boolean(databricksHost());
}

/** Base URL for the workspace's OpenAI-compatible AI Gateway chat endpoint. */
export function databricksBaseUrl(): string {
  const host = databricksHost();
  if (!host) throw new Error("Databricks host is not configured.");
  const origin = host.startsWith("http") ? host.replace(/\/+$/, "") : `https://${host.replace(/\/+$/, "")}`;
  return `${origin}/ai-gateway/mlflow/v1`;
}

interface CachedToken {
  profile: string;
  token: string;
  expiresAt: number;
}
let cached: CachedToken | null = null;

/** Fetch a Databricks OAuth access token via the CLI, cached in-memory until near expiry. */
export async function getDatabricksToken(): Promise<string> {
  const profile = databricksProfile();
  if (cached && cached.profile === profile && Date.now() < cached.expiresAt) return cached.token;

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("databricks", ["auth", "token", "-p", profile, "-o", "json"]));
  } catch (err) {
    const detail = (err as { stderr?: string }).stderr || (err as Error).message;
    throw new Error(`Databricks auth failed (profile "${profile}"). Run \`databricks auth login -p ${profile}\`. ${detail.trim()}`, { cause: err });
  }

  const parsed = JSON.parse(stdout) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token) throw new Error("Databricks CLI returned no access_token.");
  const ttlMs = (parsed.expires_in ?? 3600) * 1000;
  cached = { profile, token: parsed.access_token, expiresAt: Date.now() + ttlMs - TOKEN_REFRESH_BUFFER_MS };
  return parsed.access_token;
}
