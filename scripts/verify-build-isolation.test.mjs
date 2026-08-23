import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const privatePaths = [
  "config/player-names.local.json",
  "src/config/playerNames.generated.ts",
  "release/local-private/example.txt",
];

test("private configuration, generated source and artifacts are ignored and untracked", () => {
  for (const path of privatePaths) {
    const ignored = execFileSync("git", ["check-ignore", path], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    assert.equal(ignored, path);
    assert.throws(() =>
      execFileSync("git", ["ls-files", "--error-unmatch", path], {
        cwd: root,
        stdio: "pipe",
      }),
    );
  }
});

test("package scripts make public generation the default and private generation explicit", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["prepare:names"], /prepare-player-names/);
  assert.match(pkg.scripts.prebuild, /prepare:names/);
  assert.match(pkg.scripts.pretest, /prepare:names/);
  assert.match(pkg.scripts.pretauri, /prepare:names/);
  assert.match(pkg.scripts["tauri:private"], /run-private-tauri-build/);
});

test("anonymous verification scans Git-tracked public inputs", () => {
  const source = readFileSync(
    new URL("./verify-anonymous-identities.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /git["'], \["ls-files"/);
  assert.doesNotMatch(source, /scan\(projectRoot/);
});
