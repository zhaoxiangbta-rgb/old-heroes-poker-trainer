import { useEffect, useState } from "react";
import type { PwaLifecycleHandle, PwaSnapshot } from "./pwaLifecycle";

function statusLabel(snapshot: PwaSnapshot) {
  if (!snapshot.online && snapshot.status === "offline-ready") return "当前离线运行";
  if (snapshot.status === "offline-ready") return "已可离线使用";
  if (snapshot.status === "update-ready") return "新版本已准备好";
  if (snapshot.status === "installing") return "正在准备离线版本";
  if (snapshot.status === "error") return "离线准备失败，当前版本仍可使用";
  return "当前是临时网页模式";
}

export function PwaStatusPanel({ lifecycle }: { lifecycle: PwaLifecycleHandle }) {
  const [snapshot, setSnapshot] = useState(lifecycle.snapshot());
  useEffect(() => lifecycle.subscribe(setSnapshot), [lifecycle]);
  const label = statusLabel(snapshot);
  return (
    <details className={`pwa-status pwa-${snapshot.status}`}>
      <summary><i aria-hidden="true" />{label}</summary>
      <div className="pwa-status-detail">
        <small>应用 {snapshot.appVersion} · 缓存 {snapshot.cacheVersion ?? "尚未建立"}</small>
        {snapshot.status === "unsupported" ? <p>请用 Safari 打开固定 HTTPS 地址，再选择“分享”→“添加到主屏幕”。</p> : null}
        {snapshot.status === "installing" ? <p>请保持联网，完整缓存成功后会显示“已可离线使用”。</p> : null}
        {snapshot.status === "error" ? <p>{snapshot.message ?? "资源下载失败"}</p> : null}
        <div className="pwa-status-actions">
          {snapshot.status === "update-ready" ? <button onClick={() => void lifecycle.activateUpdate()}>立即更新</button> : null}
          {snapshot.status === "error" ? <button onClick={() => void lifecycle.clearAppCache()}>清理应用缓存</button> : null}
        </div>
        <p className="pwa-storage-note">牌局只保存在本机。清除 Safari 网站数据或卸载前，请先导出 JSON 备份。</p>
      </div>
    </details>
  );
}
