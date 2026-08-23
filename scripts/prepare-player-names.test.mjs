import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prepareNames } from "./prepare-player-names.mjs";

const IDS = Array.from({ length: 6 }, (_, index) => `friend-0${index + 1}`);

function fixture(overrides = {}) {
  return Object.fromEntries(
    IDS.map((id, index) => [id, overrides[id] ?? `本地名称${index + 1}`]),
  );
}

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "poker-player-names-"));
  return {
    inputPath: join(directory, "names.json"),
    outputPath: join(directory, "names.generated.ts"),
  };
}

test("public mode writes an empty override without reading a private file", async () => {
  const target = paths();
  writeFileSync(target.inputPath, "not valid json", "utf8");
  await prepareNames({ mode: "public", ...target, quiet: true });
  assert.match(
    readFileSync(target.outputPath, "utf8"),
    /Object\.freeze\(\{\}\)/,
  );
});

test("private mode writes exactly six validated names", async () => {
  const target = paths();
  writeFileSync(target.inputPath, JSON.stringify(fixture()), "utf8");
  await prepareNames({ mode: "private", ...target, quiet: true });
  const output = readFileSync(target.outputPath, "utf8");
  for (const id of IDS) assert.match(output, new RegExp(`"${id}"`));
});

for (const [label, mutate, expected] of [
  ["missing ID", (value) => delete value["friend-06"], /exactly friend-01 through friend-06/],
  ["extra ID", (value) => { value["friend-07"] = "多余"; }, /exactly friend-01 through friend-06/],
  ["duplicate name", (value) => { value["friend-02"] = value["friend-01"]; }, /unique/],
  ["blank name", (value) => { value["friend-02"] = "  "; }, /must not be blank/],
  ["reserved name", (value) => { value["friend-02"] = "你"; }, /reserved/],
  ["long name", (value) => { value["friend-02"] = "一二三四五六七八九十甲乙丙"; }, /12 Unicode/],
]) {
  test(`private mode rejects ${label}`, async () => {
    const target = paths();
    const value = fixture();
    mutate(value);
    writeFileSync(target.inputPath, JSON.stringify(value), "utf8");
    await assert.rejects(
      prepareNames({ mode: "private", ...target, quiet: true }),
      expected,
    );
  });
}
