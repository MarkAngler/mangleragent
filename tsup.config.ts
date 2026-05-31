import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/index.ts"],
  outDir: "dist/server",
  format: ["esm"],
  platform: "node",
  target: "node20",
  clean: true,
  sourcemap: true,
  // Native addons and the SDK that ships a platform binary must resolve at
  // runtime from node_modules, not be inlined by esbuild.
  external: ["better-sqlite3", "@lydell/node-pty", "@anthropic-ai/claude-agent-sdk"],
});
