// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../data/memoryRepository";
import { MobileApp } from "./MobileApp";
import { APP_VERSION_LABEL } from "../appVersion";
import type { PwaLifecycleHandle } from "./pwaLifecycle";

const pwaLifecycle: PwaLifecycleHandle = {
  snapshot: () => ({ status: "offline-ready", online: true, appVersion: "1.1.6", cacheVersion: "1.1.6" }),
  subscribe(listener) { listener(this.snapshot()); return () => undefined; },
  register: vi.fn(async () => undefined),
  activateUpdate: vi.fn(async () => undefined),
  clearAppCache: vi.fn(async () => undefined),
};

describe("mobile app shell", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("exposes mobile navigation and a real poker action surface", async () => {
    render(<MobileApp repository={createMemoryRepository()} pwaLifecycle={pwaLifecycle} />);
    expect(document.documentElement).toHaveClass("mobile-client");
    expect(screen.getByRole("navigation", { name: "移动导航" })).toBeVisible();
    expect(screen.getByText(APP_VERSION_LABEL)).toBeVisible();
    await waitFor(() => expect(screen.getAllByText(/轮到你行动|群友行动中|发底牌中/).length).toBeGreaterThan(0));
    expect(screen.getByRole("region", { name: "行动选择" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "本街投入到" })).toBeVisible();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("已可离线使用")).toBeVisible();
  });

  it("does not expose model or API key controls", () => {
    render(<MobileApp repository={createMemoryRepository()} />);
    expect(screen.queryByText("OpenAI-compatible 模型")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("API Key")).not.toBeInTheDocument();
  });

  it("still boots when Safari blocks localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    render(<MobileApp repository={createMemoryRepository()} />);
    expect(screen.getByRole("navigation", { name: "移动导航" })).toBeVisible();
  });
});
