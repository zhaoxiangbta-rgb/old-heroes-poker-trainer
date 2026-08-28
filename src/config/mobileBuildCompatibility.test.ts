import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const { JSDOM } = createRequire(import.meta.url)("jsdom");

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

  it("explains that the source mobile file is not the runnable phone app", async () => {
    const html = readFileSync("mobile/index.html", "utf8");
    const page = new JSDOM(html, {
      runScripts: "dangerously",
      url: "file:///project/mobile/index.html",
    });

    page.window.document.dispatchEvent(new page.window.Event("DOMContentLoaded"));
    await Promise.resolve();

    const message = page.window.document.querySelector("[data-mobile-boot]")?.textContent;
    expect(message).toContain("请从电脑端");
    expect(message).toContain("手机访问");
    page.window.close();
  });
});
