import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop content security policy", () => {
  it("allows the locally generated QR data image", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
      app: { security: { csp: string } };
    };
    expect(config.app.security.csp).toContain("img-src 'self' data:");
  });

  it("opens at the complete poker workspace size", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as {
      app: { windows: Array<Record<string, unknown>> };
    };
    expect(config.app.windows[0]).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 760,
      resizable: true,
    });
  });
});
