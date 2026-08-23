import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const paths = [
  "config/player-names.local.json",
  "src/config/playerNames.generated.ts",
  "release/local-private/example.txt",
];
const failures = [];

for (const path of paths) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", path], { cwd: root });
  } catch {
    failures.push(`${path}: is not ignored`);
  }
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", path], {
      cwd: root,
      stdio: "ignore",
    });
    failures.push(`${path}: is tracked`);
  } catch {
    // Expected: private inputs and outputs must not be tracked.
  }
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
for (const hook of ["prebuild", "pretest", "pretauri"]) {
  if (!String(pkg.scripts?.[hook] ?? "").includes("prepare:names"))
    failures.push(`package.json: ${hook} does not prepare public names`);
}
if (!String(pkg.scripts?.["tauri:private"] ?? "").includes("run-private-tauri-build"))
  failures.push("package.json: private Tauri command is missing");

if (failures.length) {
  console.error(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
console.log("build isolation contract: PASS");
