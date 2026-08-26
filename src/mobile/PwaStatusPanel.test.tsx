// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PwaLifecycleHandle, PwaSnapshot } from "./pwaLifecycle";
import { PwaStatusPanel } from "./PwaStatusPanel";

function fakeLifecycle(initial: PwaSnapshot) {
  let snapshot = initial;
  let listener: ((next: PwaSnapshot) => void) | undefined;
  const lifecycle: PwaLifecycleHandle = {
    snapshot: () => snapshot,
    subscribe(next) { listener = next; next(snapshot); return () => { listener = undefined; }; },
    register: vi.fn(async () => undefined),
    activateUpdate: vi.fn(async () => undefined),
    clearAppCache: vi.fn(async () => undefined),
  };
  return { lifecycle, emit(next: PwaSnapshot) { snapshot = next; listener?.(next); } };
}

describe("mobile PWA status", () => {
  afterEach(cleanup);

  it("shows that the installed app is ready for offline use", () => {
    const fake = fakeLifecycle({ status: "offline-ready", online: true, appVersion: "1.1.7", cacheVersion: "1.1.7" });
    render(<PwaStatusPanel lifecycle={fake.lifecycle} />);
    expect(screen.getByText("已可离线使用")).toBeVisible();
    fireEvent.click(screen.getByText("已可离线使用"));
    expect(screen.getByText(/应用 1\.1\.7 · 缓存 1\.1\.7/)).toBeVisible();
  });

  it("does not activate an update until the user asks", () => {
    const fake = fakeLifecycle({ status: "offline-ready", online: true, appVersion: "1.1.7", cacheVersion: "1.1.7" });
    render(<PwaStatusPanel lifecycle={fake.lifecycle} />);
    act(() => fake.emit({ status: "update-ready", online: true, appVersion: "1.1.7", cacheVersion: "1.1.8" }));
    expect(fake.lifecycle.activateUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("新版本已准备好"));
    fireEvent.click(screen.getByRole("button", { name: "立即更新" }));
    expect(fake.lifecycle.activateUpdate).toHaveBeenCalledOnce();
  });

  it("distinguishes an offline run from an unsupported LAN page", () => {
    const fake = fakeLifecycle({ status: "offline-ready", online: false, appVersion: "1.1.7", cacheVersion: "1.1.7" });
    const view = render(<PwaStatusPanel lifecycle={fake.lifecycle} />);
    expect(screen.getByText("当前离线运行")).toBeVisible();
    view.unmount();

    const unsupported = fakeLifecycle({ status: "unsupported", online: true, appVersion: "1.1.7" });
    render(<PwaStatusPanel lifecycle={unsupported.lifecycle} />);
    expect(screen.getByText("当前是临时网页模式")).toBeVisible();
    fireEvent.click(screen.getByText("当前是临时网页模式"));
    expect(screen.getByText(/Safari.*添加到主屏幕/)).toBeVisible();
  });

  it("offers recovery without claiming the cache is ready", () => {
    const fake = fakeLifecycle({ status: "error", online: true, appVersion: "1.1.7", message: "下载失败" });
    render(<PwaStatusPanel lifecycle={fake.lifecycle} />);
    expect(screen.getByText("离线准备失败，当前版本仍可使用")).toBeVisible();
    expect(screen.queryByText("已可离线使用")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("离线准备失败，当前版本仍可使用"));
    fireEvent.click(screen.getByRole("button", { name: "清理应用缓存" }));
    expect(fake.lifecycle.clearAppCache).toHaveBeenCalledOnce();
  });
});
