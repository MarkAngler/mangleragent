import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { projectsRepo } from "./db/projects";
import type { DefEntry, DefFile, DefKind } from "../shared/types";

// Claude-Code-compatible markdown definitions on disk:
//   agents -> .claude/agents/<name>.md
//   skills -> .claude/skills/<name>/SKILL.md
//   rules  -> .claude/rules/<name>.md
// Scope is "global" (the data dir), "mangler" (the Mangler chat agent's own
// definitions in the data dir), or a projectId (the project folder).

// The scope under which the Mangler chat agent's own rules and skills live.
export const MANGLER_SCOPE = "mangler";

function baseDir(scope: string): string {
  if (scope === "global") return path.join(env.dataDir, ".claude");
  if (scope === MANGLER_SCOPE) return path.join(env.dataDir, ".claude-mangler");
  const project = projectsRepo.get(scope);
  if (!project) throw new Error("project not found");
  return path.join(project.path, ".claude");
}

function dirFor(scope: string, kind: DefKind): string {
  return path.join(baseDir(scope), kind === "agent" ? "agents" : kind === "rule" ? "rules" : "skills");
}

function fileFor(scope: string, kind: DefKind, name: string): string {
  return kind === "skill" ? path.join(dirFor(scope, kind), name, "SKILL.md") : path.join(dirFor(scope, kind), `${name}.md`);
}

// Directory holding one skill in a scope; GitHub sync writes skill assets here.
export function skillDir(scope: string, name: string): string {
  return path.join(dirFor(scope, "skill"), name);
}

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function describe(filePath: string): string {
  try {
    return parseFrontmatter(fs.readFileSync(filePath, "utf8")).description ?? "";
  } catch {
    return "";
  }
}

export function listDefs(scope: string, kind: DefKind): DefEntry[] {
  const dir = dirFor(scope, kind);
  if (!fs.existsSync(dir)) return [];
  const entries: DefEntry[] = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (kind === "skill") {
      if (!dirent.isDirectory()) continue;
      const file = path.join(dir, dirent.name, "SKILL.md");
      if (fs.existsSync(file)) entries.push({ kind, name: dirent.name, description: describe(file), path: file });
    } else {
      if (!dirent.isFile() || !dirent.name.endsWith(".md")) continue;
      const name = dirent.name.replace(/\.md$/, "");
      const file = path.join(dir, dirent.name);
      entries.push({ kind, name, description: describe(file), path: file });
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function readDef(scope: string, kind: DefKind, name: string): DefFile | undefined {
  const file = fileFor(scope, kind, name);
  if (!fs.existsSync(file)) return undefined;
  return { kind, name, path: file, content: fs.readFileSync(file, "utf8") };
}

function template(kind: DefKind, name: string): string {
  if (kind === "agent")
    return `---\nname: ${name}\ndescription: What this agent specializes in and when to use it.\n---\n\nYou are ${name}. Describe the agent's role, expertise, and how it should approach tasks.\n`;
  if (kind === "skill")
    return `---\nname: ${name}\ndescription: When this skill should be used.\n---\n\n# ${name}\n\nStep-by-step instructions for this skill.\n`;
  return `# ${name}\n\nA guideline the agent must follow.\n`;
}

export function createDef(scope: string, kind: DefKind, name: string): DefFile {
  const file = fileFor(scope, kind, name);
  if (fs.existsSync(file)) throw new Error("a definition with this name already exists");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const content = template(kind, name);
  fs.writeFileSync(file, content, "utf8");
  return { kind, name, path: file, content };
}

export function saveDef(scope: string, kind: DefKind, name: string, content: string): DefFile {
  const file = fileFor(scope, kind, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
  return { kind, name, path: file, content };
}

export function copyDef(fromScope: string, toScope: string, kind: DefKind, name: string, overwrite: boolean): "copied" | "exists" {
  const src = fileFor(fromScope, kind, name);
  if (!fs.existsSync(src)) throw new Error("source definition not found");
  const dest = fileFor(toScope, kind, name);
  if (fs.existsSync(dest) && !overwrite) return "exists";
  if (kind === "skill") {
    fs.rmSync(path.dirname(dest), { recursive: true, force: true });
    fs.cpSync(path.dirname(src), path.dirname(dest), { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return "copied";
}

export function removeDef(scope: string, kind: DefKind, name: string): boolean {
  const file = fileFor(scope, kind, name);
  if (!fs.existsSync(file)) return false;
  if (kind === "skill") fs.rmSync(path.dirname(file), { recursive: true, force: true });
  else fs.rmSync(file);
  return true;
}
