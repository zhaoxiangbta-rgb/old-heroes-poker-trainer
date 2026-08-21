import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceDocs = resolve(projectRoot, "../docs");
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

scan(projectRoot, projectRoot);
if (existsSync(workspaceDocs)) scan(workspaceDocs, resolve(projectRoot, ".."));

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("anonymous identity contract: PASS");
