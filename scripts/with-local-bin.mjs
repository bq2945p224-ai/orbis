import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bins = [
  path.join(root, "node_modules", ".bin"),
  path.join(process.env.HOME ?? "", ".local", "bin"),
].filter((p) => p && existsSync(p));

process.env.PATH = `${bins.join(path.delimiter)}${path.delimiter}${process.env.PATH ?? ""}`;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/with-local-bin.mjs <command> [args...]");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
