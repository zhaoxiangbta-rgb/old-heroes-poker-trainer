// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPwaLifecycle, type PwaStatus } from "./pwaLifecycle";

type MessageListener = (event: MessageEvent) => void;

function serviceWorkerHarness() {
  let messageListener: MessageListener | undefined;
  let controllerChangeListener: (() => void) | undefined;
  const waiting = { postMessage: vi.fn() };
  const registration = {
    waiting: null as null | typeof waiting,
    installing: null,
    addEventListener: vi.fn(),
  };
  const container = {
    controller: null as null | { postMessage(message: unknown): void },
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "message") messageListener = listener as MessageListener;
      if (type === "controllerchange") controllerChangeListener = listener as () => void;
    }),
  };
  return {
    container,
    registration,
    waiting,
    message(data: unknown) { messageListener?.({ data } as MessageEvent); },
    controllerChanged() { controllerChangeListener?.(); },
  };
}

describe("PWA lifecycle", () => {
  it("only reports offline-ready after the worker confirms precache", async () => {
    const harness = serviceWorkerHarness();
    const lifecycle = createPwaLifecycle({
      serviceWorker: harness.container,
      online: () => true,
      secure: true,
      reload: vi.fn(),
    });
    const states: PwaStatus[] = [];
    lifecycle.subscribe((snapshot) => states.push(snapshot.status));

    await lifecycle.register();
    expect(states.at(-1)).toBe("installing");

    harness.message({ type: "PWA_CACHE_READY", version: "1.1.7" });
    expect(states.at(-1)).toBe("offline-ready");
    expect(lifecycle.snapshot().cacheVersion).toBe("1.1.7");
  });

  it("automatically activates an update that is already waiting", async () => {
    const harness = serviceWorkerHarness();
    harness.registration.waiting = harness.waiting;
    const reload = vi.fn();
    const lifecycle = createPwaLifecycle({
      serviceWorker: harness.container,
      online: () => true,
      secure: true,
      reload,
    });

    await lifecycle.register();
    expect(lifecycle.snapshot().status).toBe("update-ready");
    expect(harness.waiting.postMessage).toHaveBeenCalledWith({ type: "PWA_ACTIVATE_UPDATE" });
    harness.controllerChanged();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports unsupported without throwing on an insecure origin", async () => {
    const lifecycle = createPwaLifecycle({ online: () => true, secure: false, reload: vi.fn() });
    await lifecycle.register();
    expect(lifecycle.snapshot()).toMatchObject({ status: "unsupported", online: true });
  });

  it("asks the worker to clear only application caches", async () => {
    const harness = serviceWorkerHarness();
    const controller = { postMessage: vi.fn() };
    harness.container.controller = controller;
    const lifecycle = createPwaLifecycle({
      serviceWorker: harness.container,
      online: () => true,
      secure: true,
      reload: vi.fn(),
    });
    await lifecycle.clearAppCache();
    expect(controller.postMessage).toHaveBeenCalledWith({ type: "PWA_CLEAR_CACHE" });
  });

  it("asks an existing controller for its cache version after registration", async () => {
    const harness = serviceWorkerHarness();
    const controller = { postMessage: vi.fn() };
    harness.container.controller = controller;
    const lifecycle = createPwaLifecycle({ serviceWorker: harness.container, online: () => true, secure: true, reload: vi.fn() });
    await lifecycle.register();
    expect(controller.postMessage).toHaveBeenCalledWith({ type: "PWA_QUERY_STATUS" });
  });
});
