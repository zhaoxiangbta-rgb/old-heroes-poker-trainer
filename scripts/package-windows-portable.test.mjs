import assert from "node:assert/strict";
import { test } from "node:test";
import { portableExecutableName, validateArchiveEntries } from "./package-windows-portable.mjs";

test("uses an ASCII-only executable name inside the Windows archive", () => {
  assert.equal(portableExecutableName, "Old-Heroes-Poker-Trainer.exe");
  assert.match(portableExecutableName, /^[\x20-\x7e]+$/);
});

test("rejects mojibake or non-ASCII archive entry names", () => {
  assert.doesNotThrow(() => validateArchiveEntries(["Old-Heroes-Poker-Trainer.exe"]));
  assert.throws(() => validateArchiveEntries(["�??�?��??�??�?.exe"]), /乱码/);
  assert.throws(() => validateArchiveEntries(["老英雄牌局.exe"]), /ASCII/);
});
