#!/usr/bin/env bun
// Coverage check for the wiki copy in docs/wiki: every file of the wiki
// repository at the given commit is either present in the copy (under the
// path scripts/wiki-copy.ts writes it to) or listed in docs/wiki/README.md
// under "## Not copied" as `path` with a reason; and every page in the copy
// (README.md aside) comes from a file at that commit, so no stale page stays
// behind. The manifest must also pin the same commit.
//
// Usage: bun scripts/wiki-coverage.ts <wiki checkout> <commit> [<copy dir>]
// Exit code 1 on any gap.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

const [wikiDir, commit, outArg] = process.argv.slice(2);
if (!wikiDir || !commit) {
  console.error("usage: bun scripts/wiki-coverage.ts <wiki checkout> <commit> [<copy dir>]");
  process.exit(2);
}
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = resolve(outArg ?? join(repoRoot, "docs", "wiki"));
const git = (...args: string[]) => execFileSync("git", ["-C", wikiDir, ...args], { encoding: "utf8" });

const full = git("rev-parse", commit).trim();
const sourceFiles = git("ls-tree", "-r", "--name-only", commit).split("\n").filter(Boolean);
const outPath = (src: string) => (src.startsWith("wiki/") ? src.slice("wiki/".length) : src);

const manifest = readFileSync(join(outDir, "README.md"), "utf8");
const section = manifest.split(/^## /m).find((s) => s.startsWith("Not copied"));
if (!section) {
  console.error('docs/wiki/README.md has no "## Not copied" section');
  process.exit(1);
}
// One table row per excluded file: | `path` | reason |. A row whose path ends
// with "/" or "*.txt" excludes every source file it matches.
const excluded = new Map<string, string>();
for (const m of section.matchAll(/^\| `([^`]+)` \| (.+?) \|$/gm)) excluded.set(m[1], m[2].trim());
const excludedBy = (src: string) => {
  for (const [pat, reason] of excluded) {
    if (pat === src) return reason;
    if (pat.endsWith("/") && src.startsWith(pat)) return reason;
    if (pat.startsWith("*.") && src.endsWith(pat.slice(1)) && !src.includes("/")) return reason;
  }
  return undefined;
};

const copied = new Set(
  execFileSync("find", [outDir, "-type", "f"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => posix.normalize(relative(outDir, f))),
);

const problems: string[] = [];
let present = 0;
let excludedCount = 0;
for (const src of sourceFiles) {
  const reason = excludedBy(src);
  if (copied.has(outPath(src))) {
    present++;
    if (reason) problems.push(`${src}: copied and also listed as not copied (${reason})`);
  } else if (reason) {
    excludedCount++;
    if (!reason.trim()) problems.push(`${src}: listed as not copied without a reason`);
  } else problems.push(`${src}: missing from the copy and not listed under "Not copied"`);
}
const sourceOut = new Set(sourceFiles.map(outPath));
for (const f of copied) {
  if (f === "README.md") continue;
  if (!sourceOut.has(f)) problems.push(`${f}: in the copy but not in the wiki at ${commit}`);
}
if (!manifest.includes(full)) problems.push(`docs/wiki/README.md does not pin commit ${full}`);

console.log(`wiki ${full}: ${sourceFiles.length} files; ${present} copied, ${excludedCount} excluded with a reason; copy holds ${copied.size} files`);
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("coverage ok");
