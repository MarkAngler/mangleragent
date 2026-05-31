#!/usr/bin/env node
const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if ((arg === "--port" || arg === "-p") && args[i + 1]) process.env.PORT = args[++i];
  else if (arg.startsWith("--port=")) process.env.PORT = arg.slice("--port=".length);
  else if (arg === "--no-open") process.env.MANGLED_NO_OPEN = "1";
}

import("../dist/server/index.js");
