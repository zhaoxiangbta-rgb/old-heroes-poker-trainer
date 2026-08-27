import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile Safari build entry", () => {
  it("uses a classic bundled script instead of an ES module", () => {
    const html = readFileSync("mobile/index.html", "utf8");
    expect(html).toContain('<script defer src="/mobile-app.js"></script>');
    expect(html).not.toContain('type="module"');
  });

  it("redirects handheld browsers from the desktop root to the mobile entry", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain("data-mobile-entry-redirect");
    expect(html).toContain('new URL("./mobile/", window.location.href)');
    expect(html).toMatch(/iPhone\|iPad\|iPod\|Android/);
  });
});
