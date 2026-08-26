import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile Safari build entry", () => {
  it("uses a classic bundled script instead of an ES module", () => {
    const html = readFileSync("mobile/index.html", "utf8");
    expect(html).toContain('<script defer src="/mobile-app.js"></script>');
    expect(html).not.toContain('type="module"');
  });
});
