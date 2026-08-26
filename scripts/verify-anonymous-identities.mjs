import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();
const projectPrefix = relative(repositoryRoot, projectRoot);
const workspaceDocs = resolve(projectRoot, "../docs");
const docsPrefix = existsSync(workspaceDocs)
  ? relative(repositoryRoot, workspaceDocs)
  : undefined;
const blocked = [
  "QmVsbGE=",
  "5ZOI6Zif",
  "5YCq5bCR",
  "6Zu25ZOl",
  "UeWkp+eItw==",
  "6JGj56eY",
  "ZnJpZW5kLWJlbGxh",
  "ZnJpZW5kLWhh",
  "ZnJpZW5kLW5p",
  "ZnJpZW5kLWxpbmc=",
  "ZnJpZW5kLXE=",
  "ZnJpZW5kLWRvbmc=",
].map((value) => Buffer.from(value, "base64").toString("utf8"));
const ignoredDirectories = new Set([
  ".git",
  ".cargo-local",
  ".rustup-local",
  ".superpowers",
  "dist",
  "node_modules",
  "release",
  "target",
]);
const failures = [];

function scan(path, labelRoot) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    if (ignoredDirectories.has(basename(path))) return;
    for (const name of readdirSync(path)) scan(join(path, name), labelRoot);
    return;
  }
  const label = relative(labelRoot, path);
  if (label.endsWith("scripts/verify-anonymous-identities.mjs") || label.endsWith("scripts/verify-mobile-bundle.mjs")) return;
  for (const value of blocked) {
    if (label.includes(value)) failures.push(`${label}: 文件名包含禁用身份`);
  }
  const bytes = readFileSync(path);
  if (bytes.includes(0)) return;
  const text = bytes.toString("utf8");
  for (const value of blocked) {
    if (text.includes(value)) failures.push(`${label}: 内容包含禁用身份`);
  }
}

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).split("\0").filter(Boolean);
for (const label of tracked) {
  const inProject = !projectPrefix || label === projectPrefix || label.startsWith(`${projectPrefix}/`);
  const inDocs = docsPrefix && (label === docsPrefix || label.startsWith(`${docsPrefix}/`));
  if (!inProject && !inDocs) continue;
  const path = resolve(repositoryRoot, label);
  if (existsSync(path) && statSync(path).isFile()) scan(path, repositoryRoot);
}
for (const directory of ["release/macos", "release/windows-portable"]) {
  const path = resolve(projectRoot, directory);
  if (existsSync(path)) scan(path, projectRoot);
}

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("anonymous identity contract: PASS");
