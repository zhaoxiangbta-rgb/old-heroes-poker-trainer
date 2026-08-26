// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanServiceClient, LanStatus } from "../lan/types";
import { LanMobileAccess } from "./LanMobileAccess";

const stopped: LanStatus = { running: false, port: 8765, bootstrapUrl: null, fallbackUrls: [], activeSessions: 0, mdnsAvailable: false };
const running: LanStatus = { running: true, port: 8765, bootstrapUrl: "http://192.168.1.8:8765/mobile/", fallbackUrls: ["http://192.168.1.8:8765/mobile/"], activeSessions: 0, mdnsAvailable: false };

describe("LAN mobile access settings", () => {
  afterEach(cleanup);
  it("starts service and renders a reusable QR for the fixed local URL", async () => {
    const client: LanServiceClient = { status: vi.fn().mockResolvedValue(stopped), start: vi.fn().mockResolvedValue(running), stop: vi.fn(), rotate: vi.fn().mockResolvedValue(running) };
    render(<LanMobileAccess client={client} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "开启手机访问" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "开启手机访问" }));
    expect(await screen.findByAltText("手机访问二维码")).toBeVisible();
    expect(screen.getByText("这是家庭局域网固定地址，可重复打开。")).toBeVisible();
    expect(screen.getByText("http://192.168.1.8:8765/mobile/")).toBeVisible();
  });

  it("does not invent a URL in browser preview", async () => {
    render(<LanMobileAccess />);
    expect(screen.getByText("桌面安装版中可用")).toBeVisible();
    expect(screen.queryByAltText("手机访问二维码")).not.toBeInTheDocument();
  });
});
