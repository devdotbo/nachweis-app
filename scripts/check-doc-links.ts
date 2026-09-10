#!/usr/bin/env bun
// Checks that every relative markdown link under the given files or
// directories resolves to a file or directory in the repository.
//
// Usage: bun scripts/check-doc-links.ts [<path> ...]   (default: docs README.md DISCLOSURE.md)
// Exit code 1 when a link is broken. Links to http(s), mailto and bare
// anchors are skipped; a title after the target and a #fragment are ignored.

import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const targets = process.argv.slice(2);
const roots = (targets.length ? targets : ["docs", "README.md", "DISCLOSURE.md"]).map((t) => resolve(repoRoot, t));

const files: string[] = [];
for (const r of roots) {
  if (statSync(r).isDirectory()) {
    files.push(
      ...execFileSync("find", [r, "-name", "*.md", "-type", "f"], { encoding: "utf8" }).split("\n").filter(Boolean),
    );
  } else files.push(r);
}

const LINK = /\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
let checked = 0;
const broken: string[] = [];
for (const f of files.sort()) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LINK)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      checked++;
      const file = target.split("#")[0];
      const abs = resolve(dirname(f), decodeURIComponent(file));
      try {
        statSync(abs);
      } catch {
        broken.push(`${relative(repoRoot, f)}:${i + 1}: ${target}`);
      }
    }
  });
}
console.log(`${files.length} files, ${checked} relative links checked, ${broken.length} broken`);
if (broken.length) {
  console.log(broken.join("\n"));
  process.exit(1);
}
