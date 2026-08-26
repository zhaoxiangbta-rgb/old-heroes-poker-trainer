import { useEffect, useState } from "react";
import App from "../App";
import { createIndexedDbRepository } from "../data/indexedDbRepository";
import type { DesktopRepository } from "../data/types";
import { PwaStatusPanel } from "./PwaStatusPanel";
import { registerPwaLifecycle, type PwaLifecycleHandle } from "./pwaLifecycle";

export function MobileApp({ repository, pwaLifecycle }: { repository?: DesktopRepository; pwaLifecycle?: PwaLifecycleHandle }) {
  const [lifecycle] = useState(() => pwaLifecycle ?? registerPwaLifecycle());
  useEffect(() => {
    document.documentElement.classList.add("mobile-client");
    const url = new URL(window.location.href);
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return () => document.documentElement.classList.remove("mobile-client");
  }, []);
  return <><PwaStatusPanel lifecycle={lifecycle} /><App mobile repository={repository ?? createIndexedDbRepository()} /></>;
}
