import { APP_VERSION } from "../appVersion";

export type PwaStatus = "unsupported" | "installing" | "offline-ready" | "update-ready" | "error";

export type PwaSnapshot = {
  status: PwaStatus;
  online: boolean;
  appVersion: string;
  cacheVersion?: string;
  message?: string;
};

type WorkerLike = { postMessage(message: unknown): void };
type RegistrationLike = {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: string, listener: EventListener): void;
};
type ServiceWorkerLike = {
  controller: WorkerLike | null;
  register(url: string, options?: RegistrationOptions): Promise<RegistrationLike>;
  ready: Promise<RegistrationLike>;
  addEventListener(type: string, listener: EventListener): void;
};

export type PwaLifecycleEnvironment = {
  serviceWorker?: ServiceWorkerLike;
  online: () => boolean;
  secure: boolean;
  reload: () => void;
  addWindowListener?: (type: "online" | "offline", listener: () => void) => void;
};

export type PwaLifecycleHandle = {
  snapshot(): PwaSnapshot;
  subscribe(listener: (value: PwaSnapshot) => void): () => void;
  register(): Promise<void>;
  activateUpdate(): Promise<void>;
  clearAppCache(): Promise<void>;
};

function browserEnvironment(): PwaLifecycleEnvironment {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  return {
    serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    online: () => navigator.onLine,
    secure: window.isSecureContext || local,
    reload: () => location.reload(),
    addWindowListener: (type, listener) => window.addEventListener(type, listener),
  };
}

export function createPwaLifecycle(environment: PwaLifecycleEnvironment): PwaLifecycleHandle {
  let current: PwaSnapshot = {
    status: environment.serviceWorker && environment.secure ? "installing" : "unsupported",
    online: environment.online(),
    appVersion: APP_VERSION,
  };
  let registration: RegistrationLike | undefined;
  const listeners = new Set<(value: PwaSnapshot) => void>();
  const emit = (next: Partial<PwaSnapshot>) => {
    current = { ...current, ...next };
    listeners.forEach((listener) => listener(current));
  };
  const observeInstallingWorker = (worker: WorkerLike | null) => {
    const stateful = worker as WorkerLike & { addEventListener?: (type: string, listener: EventListener) => void; state?: string };
    stateful?.addEventListener?.("statechange", (() => {
      if (stateful.state === "installed" && registration?.waiting) emit({ status: "update-ready" });
    }) as EventListener);
  };

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
    async register() {
      if (!environment.serviceWorker || !environment.secure) {
        emit({ status: "unsupported" });
        return;
      }
      emit({ status: "installing", online: environment.online() });
      try {
        environment.serviceWorker.addEventListener("message", ((event: MessageEvent) => {
          if (event.data?.type === "PWA_CACHE_READY") {
            emit({ status: "offline-ready", cacheVersion: String(event.data.version), message: undefined });
          }
          if (event.data?.type === "PWA_CACHE_ERROR") {
            emit({ status: "error", message: "离线准备失败，当前版本仍可使用" });
          }
        }) as EventListener);
        environment.serviceWorker.addEventListener("controllerchange", (() => environment.reload()) as EventListener);
        environment.addWindowListener?.("online", () => emit({ online: true }));
        environment.addWindowListener?.("offline", () => emit({ online: false }));
        const workerUrl = new URL("./service-worker.js", document.baseURI).toString();
        registration = await environment.serviceWorker.register(workerUrl, { scope: "./" });
        environment.serviceWorker.controller?.postMessage({ type: "PWA_QUERY_STATUS" });
        registration.addEventListener("updatefound", (() => observeInstallingWorker(registration?.installing ?? null)) as EventListener);
        if (registration.waiting) emit({ status: "update-ready" });
        else observeInstallingWorker(registration.installing);
      } catch (error) {
        emit({ status: "error", message: error instanceof Error ? error.message : "离线准备失败" });
      }
    },
    async activateUpdate() {
      registration ??= await environment.serviceWorker?.ready;
      registration?.waiting?.postMessage({ type: "PWA_ACTIVATE_UPDATE" });
    },
    async clearAppCache() {
      environment.serviceWorker?.controller?.postMessage({ type: "PWA_CLEAR_CACHE" });
    },
  };
}

export function registerPwaLifecycle() {
  const lifecycle = createPwaLifecycle(browserEnvironment());
  void lifecycle.register();
  return lifecycle;
}
