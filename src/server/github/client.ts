import { configRepo } from "../db/config";
import type { GithubTreeEntry } from "../../shared/types";

// Accepts "owner/repo", "https://github.com/owner/repo[.git]", and
// "https://github.com/owner/repo/tree/<branch>" (everything after /tree/ is the
// branch, which may itself contain slashes).
export function parseRepoUrl(input: string): { owner: string; repo: string; branch?: string } | undefined {
  const trimmed = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "");
  const match = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/);
  if (!match) return undefined;
  const [, owner, repo, branch] = match;
  return { owner, repo, ...(branch ? { branch } : {}) };
}

async function ghFetch(pathname: string): Promise<unknown> {
  const token = configRepo.get("github_token");
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => ({}))) as { message?: string }).message;
    throw new Error(`GitHub ${res.status}: ${message ?? res.statusText}`);
  }
  return res.json();
}

export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const data = (await ghFetch(`/repos/${owner}/${repo}`)) as { default_branch: string };
  return data.default_branch;
}

export async function getHeadSha(owner: string, repo: string, ref: string): Promise<string> {
  const data = (await ghFetch(`/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`)) as { sha: string };
  return data.sha;
}

function contentsUrl(owner: string, repo: string, dirPath: string, ref: string): string {
  const encoded = dirPath.split("/").map(encodeURIComponent).join("/");
  return `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
}

export async function listDir(owner: string, repo: string, dirPath: string, ref: string): Promise<GithubTreeEntry[]> {
  const data = (await ghFetch(contentsUrl(owner, repo, dirPath, ref))) as Array<{ name: string; path: string; type: string }>;
  if (!Array.isArray(data)) throw new Error("not a directory");
  return data
    .filter((entry) => entry.type === "file" || entry.type === "dir")
    .map((entry) => ({ name: entry.name, path: entry.path, type: entry.type as "file" | "dir" }));
}

export async function getFile(owner: string, repo: string, filePath: string, ref: string): Promise<Buffer> {
  const data = (await ghFetch(contentsUrl(owner, repo, filePath, ref))) as {
    content?: string;
    encoding?: string;
    download_url?: string;
  };
  if (data.content && data.encoding === "base64") return Buffer.from(data.content, "base64");
  // Files over 1MB come back with empty content; fetch the raw download URL instead.
  if (!data.download_url) throw new Error(`no content for ${filePath}`);
  const res = await fetch(data.download_url);
  if (!res.ok) throw new Error(`GitHub ${res.status}: download failed for ${filePath}`);
  return Buffer.from(await res.arrayBuffer());
}
