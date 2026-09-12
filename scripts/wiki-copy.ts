#!/usr/bin/env bun
// Copies the spec, plan, review and handoff pages of the private project wiki
// and its raw/ planning artifacts and research memos into docs/wiki, redacts
// secret locations and identifiers, and rewrites links so that every relative
// link resolves inside this repository.
//
// Usage: bun scripts/wiki-copy.ts [<wiki checkout>] <commit> [<out dir>]
//
// The wiki checkout defaults to $WIKI_DIR, else ../nachweis next to this
// repository. The absolute-path redactions below are built from that checkout's
// parent directory (where the sibling repositories live) and from the home
// directory of the user running the script, so the builder's machine layout is
// not spelled out in this file.
//
// Pages are read with `git show <commit>:<path>` so the copy is committed
// content, never a working tree. The wiki root pages (AGENTS.md, CLAUDE.md,
// index.md, log.md) and wiki/** sit side by side in the output, raw/** keeps
// its raw/ prefix. Not copied: the session transcripts (*.txt, never
// published) and llm-wiki.md (third-party pattern text). Every exclusion is
// listed in docs/wiki/README.md and checked by scripts/wiki-coverage.ts.
// Redaction counts are printed per page so the manifest can list them.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const isDir = (p: string | undefined) => {
  try {
    return !!p && statSync(p).isDirectory();
  } catch {
    return false;
  }
};
// The first argument is the wiki checkout when it names a directory; otherwise
// the checkout comes from WIKI_DIR or the default location next to this repository.
const wikiDir = resolve(isDir(args[0]) ? args.shift()! : process.env.WIKI_DIR ?? join(repoRoot, "..", "nachweis"));
const [commit, outArg] = args;
if (!commit || !isDir(wikiDir)) {
  console.error("usage: [WIKI_DIR=<wiki checkout>] bun scripts/wiki-copy.ts [<wiki checkout>] <commit> [<out dir>]");
  if (!isDir(wikiDir)) console.error(`wiki checkout not found: ${wikiDir}`);
  process.exit(2);
}
const outDir = resolve(outArg ?? join(repoRoot, "docs", "wiki"));

// Locations the wiki text refers to by absolute path, derived from the machine
// that runs the copy (the wiki and the public repositories sit side by side).
const HOME = homedir();
const REPOS = dirname(wikiDir); // directory holding nachweis, nachweis-app, nachweis-site, ...
const GIT = dirname(REPOS); // directory holding ethglobal/ and eudi-wallet-hackathon/
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (prefix: string, rest = "") => new RegExp(esc(prefix) + rest, "g");
const TAIL = /[^\s)`,;"]*/.source; // rest of a path token
const END = /(?![a-z0-9/-])/.source; // the path ends here (not a longer sibling name)

const git = (...args: string[]) =>
  execFileSync("git", ["-C", wikiDir, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const NOT_COPIED = new Set(["llm-wiki.md"]);
const allFiles = git("ls-tree", "-r", "--name-only", commit).split("\n").filter(Boolean);
const pages = allFiles.filter((p) => p.endsWith(".md") && !NOT_COPIED.has(p));
// Source path -> path inside the output directory (wiki/ prefix dropped).
const outPath = (src: string) => (src.startsWith("wiki/") ? src.slice("wiki/".length) : src);
const copied = new Set(pages.map(outPath));

// ---------------------------------------------------------------- redaction
type Rule = { name: string; re: RegExp; to: string };
const privyIds = [
  "cmttciu77003c0bjv4xvdmupe", // app Attestat
  "cml5ghboz00w4l40dbffvvhf6", // another project's app
  "m1x3z2i6n7fdtus1apxa84ww", // quorum, standing order
  "wu05awh7962linl4pcvzpw47", // quorum, payout desk
  "xmyxk0g9u7zuii9qe16gfoz3", // quorum, backoffice
  "la2flr5op0mzcbimjzcmgq1y", // policy, payout desk
  "qa7rgjwdbvy03ewug8oaq9k1", // policy, backoffice
  "mnwmkbxiog3yxusc99mnlpb8", // wallet, payout desk
  "jabcvi80nv2dx5tkes25lo62", // wallet, backoffice
];

const securityNotes: Rule[] = [
  {
    name: "security note",
    re: /; the private key was rendered once in the browser teammate's own tool output \(noted in evaluation\.md 11a, builder may rotate\)/g,
    to: "; [security note withheld]",
  },
  {
    name: "security note",
    re: /the dashboard never reveals secrets, so a new secret was generated; the first generated secret was partially rendered in the teammate's own tool output and was deleted in the dashboard and replaced by a second one that was never displayed; /g,
    to: "[security note withheld]; ",
  },
  {
    name: "security note",
    re: / Builder note: two unused secrets may remain listed in the app's API keys; delete them in the morning\./g,
    to: "",
  },
  {
    name: "security note",
    re: /^- Security notes for the builder: .*$/gm,
    to: "- Security notes for the builder: [security note withheld].",
  },
  {
    name: "security note",
    re: /^- Dashboard key cleanup: .*$/gm,
    to: "- Dashboard key cleanup: [security note withheld].",
  },
  {
    name: "security note",
    re: / Security note for the builder: the private key was rendered once .*?update the env file\)\./g,
    to: " [security note withheld]",
  },
];

// Exported session transcripts: the file name alone identifies a chat export
// that is not published, with or without a directory in front of it.
const transcripts: Rule[] = [
  { name: "transcript name", re: /[^\s)`,;"]*\d{4}-\d{2}-\d{2}-\d{6}-[A-Za-z0-9.-]*\.txt/g, to: "[session transcript, not published]" },
];

const secretPaths: Rule[] = [
  { name: "secrets path", re: rx(`${HOME}/.config/attestat/`, TAIL), to: "[local secrets path, withheld]" },
  { name: "secrets path", re: rx(`${HOME}/.config/attestat`), to: "[local secrets path, withheld]" },
  { name: "secrets path", re: rx(`${GIT}/eudi-wallet-hackathon/secrets/rp.key`), to: "[local secrets path, withheld]" },
  { name: "secrets path", re: /ethonline2026\/\.env/g, to: "[local secrets path, withheld]" },
];

const ids: Rule[] = privyIds.map((id) => ({ name: "id", re: new RegExp(id, "g"), to: "[id withheld]" }));

// Absolute paths. Public repositories keep a repository-relative form; every
// other path under the home directory is withheld. Worktrees of a public
// repository (<name>-wt-<suffix>) count as the repository.
const WT = /(?:-wt-[a-z0-9-]+)?/.source;
const paths: Rule[] = [
  { name: "path", re: rx(`${REPOS}/nachweis-app`, `${WT}/`), to: "nachweis-app/" },
  { name: "path", re: rx(`${REPOS}/nachweis-app`, WT + END), to: "nachweis-app" },
  { name: "path", re: rx(`${REPOS}/nachweis-site`, `${WT}/`), to: "nachweis-site/" },
  { name: "path", re: rx(`${REPOS}/nachweis-site`, WT + END), to: "nachweis-site" },
  { name: "path", re: rx(`${REPOS}/nachweis-verifier-relay/`), to: "klartext-verifier (branch nachweis-relay)/" },
  { name: "path", re: rx(`${REPOS}/nachweis-verifier-relay`, END), to: "klartext-verifier (branch nachweis-relay, local checkout)" },
  { name: "path", re: rx(`${GIT}/eudi-wallet-hackathon/verifier/`), to: "klartext-verifier/" },
  { name: "path", re: rx(`${GIT}/eudi-wallet-hackathon/verifier`, END), to: "klartext-verifier (local checkout)" },
  { name: "path", re: rx(`${wikiDir}/`), to: "" },
  { name: "path", re: rx(wikiDir, END), to: "the wiki repository" },
  { name: "path", re: rx(`${HOME}/.nargo/bin/nargo`), to: "nargo (local install)" },
  { name: "path", re: rx(`${HOME}/.bb/bb`), to: "bb (local install)" },
  { name: "path", re: rx(`${REPOS}/ethonline2026/`, TAIL), to: "[event wiki, local, withheld]" },
  { name: "path", re: rx(`${REPOS}/ethonline2026`, END), to: "[event wiki, local, withheld]" },
  { name: "path", re: rx(HOME, TAIL), to: "[local path, withheld]" },
  // Any other macOS home directory, should a page quote one (a placeholder like `/Users/...` is left alone).
  { name: "path", re: new RegExp(`/Users/[A-Za-z][A-Za-z0-9_-]*(?:/${TAIL})?`, "g"), to: "[local path, withheld]" },
  { name: "path", re: /\/var\/folders\/[^\s)`,;"]*/g, to: "[temporary directory, withheld]" },
  { name: "path", re: /(?:\/private)?\/tmp\/claude-501\/[^\s)`,;"]*/g, to: "[temporary directory, withheld]" },
];

const rules = [...transcripts, ...securityNotes, ...secretPaths, ...ids, ...paths];

function redact(text: string, counts: Record<string, number>) {
  for (const r of rules) {
    text = text.replace(r.re, () => {
      counts[r.name] = (counts[r.name] ?? 0) + 1;
      return r.to;
    });
  }
  return text;
}

// -------------------------------------------------------------------- links
// After path redaction a link target is one of: a wiki-relative path
// (wiki/x.md, x.md, raw/x.md, a transcript .txt), a repository-relative path of
// a public repository (nachweis-app/..., nachweis-site/..., klartext-verifier/...),
// a withheld marker, an http(s) url or an anchor.
const LINK = /\[([^\]\n]*)\]\((\[[^\]\n]*\]|[^)\s]+)(\s+"[^"]*")?\)/g;

function rewriteLinks(text: string, srcPage: string, counts: Record<string, number>) {
  const srcDir = posix.dirname(srcPage); // directory in the wiki
  const dstDir = posix.dirname(outPath(srcPage)); // directory in the copy
  return text.replace(LINK, (whole, rawLabel: string, rawTarget: string, title?: string) => {
    if (/^(https?:|mailto:|#)/.test(rawTarget)) return whole;
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
    // Links are rewritten before the page text is redacted, so the target is
    // redacted here on its own (the label is redacted with the page later).
    const target = redact(rawTarget, {});
    const label = redact(rawLabel, {});
    const m = /^(.*?)(?::(\d+(?:-\d+)?))?$/.exec(target)!;
    let file = m[1];
    const line = m[2];
    const lineNote = line ? ` (line ${line})` : "";
    const plain = (note: string) => `${label}${note}`;

    if (file.endsWith(".txt") || file.startsWith("[session transcript")) {
      bump("link transcript");
      return plain(" (session transcript, not published)");
    }
    if (file.startsWith("[")) {
      bump("link withheld");
      return label === file ? file : `${label} ${file}`;
    }
    if (file.startsWith("nachweis-app/")) {
      const rel = file.slice("nachweis-app/".length);
      if (existsSync(join(repoRoot, rel))) {
        bump("link to repo");
        const relFromCopy = posix.relative(posix.join("docs/wiki", dstDir), rel);
        return `[${label}](${relFromCopy}${line ? ` "line ${line}"` : ""})`;
      }
      bump("link not in repo");
      return plain(` (nachweis-app ${rel}${lineNote}, not in this repository)`);
    }
    if (file.startsWith("nachweis-site/")) {
      bump("link other repo");
      return plain(` (${file}${lineNote})`);
    }
    if (file.startsWith("klartext-verifier")) {
      bump("link other repo");
      return plain(` (${file}${lineNote})`);
    }
    // Wiki-relative. A link written by hand is relative to the page; a link
    // that was an absolute path before redaction is relative to the wiki
    // root. Try the page-relative reading first, then the root-relative one.
    const known = new Set(allFiles);
    const pageRel = posix.normalize(posix.join(srcDir, file));
    const wikiPath = known.has(pageRel.split("#")[0]) || !known.has(file.split("#")[0]) ? pageRel : file;
    if (wikiPath.endsWith(".txt") || NOT_COPIED.has(wikiPath)) {
      bump(wikiPath.endsWith(".txt") ? "link transcript" : "link not copied");
      return plain(wikiPath.endsWith(".txt") ? " (session transcript, not published)" : " (not copied)");
    }
    const [wikiFile, anchor] = wikiPath.split("#");
    if (!copied.has(outPath(wikiFile))) {
      bump("link not copied");
      return plain(" (not copied)");
    }
    bump("link to page");
    let rel = posix.relative(dstDir, outPath(wikiFile));
    if (anchor) rel += `#${anchor}`;
    return `[${label}](${rel}${line ? ` "line ${line}"` : title ?? ""})`;
  });
}

// --------------------------------------------------------------------- main
const keep = new Set(["README.md"]); // written by hand, not part of the wiki
if (existsSync(outDir)) {
  for (const entry of execFileSync("find", [outDir, "-name", "*.md", "-type", "f"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)) {
    const rel = posix.relative(outDir, entry);
    if (!keep.has(rel) && !copied.has(rel)) rmSync(entry);
  }
}

const report: string[] = [];
for (const src of pages) {
  const raw = git("show", `${commit}:${src}`);
  const counts: Record<string, number> = {};
  let text = rewriteLinks(raw, src, counts);
  text = redact(text, counts);
  const dst = join(outDir, outPath(src));
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, text);
  const summary = Object.entries(counts)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  report.push(`${outPath(src)}: ${summary || "no change"}`);
}
console.log(`commit ${git("rev-parse", commit).trim()}`);
console.log(`${pages.length} pages copied to ${outDir}`);
console.log(report.join("\n"));
