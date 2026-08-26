import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { LanServiceClient, LanStatus } from "../lan/types";

const STOPPED: LanStatus = { running: false, port: 8765, bootstrapUrl: null, fallbackUrls: [], activeSessions: 0, mdnsAvailable: false };

export function LanMobileAccess({ client }: { client?: LanServiceClient }) {
  const [status, setStatus] = useState<LanStatus>(STOPPED);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!client) { setBusy(false); return; }
    let active = true;
    const refresh = () => client.status().then((next) => active && setStatus(next)).catch(() => active && setNotice("无法读取手机访问状态"));
    void refresh().finally(() => active && setBusy(false));
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [client]);

  useEffect(() => {
    if (!status.bootstrapUrl) { setQr(""); return; }
    void QRCode.toDataURL(status.bootstrapUrl, { width: 260, margin: 1, color: { dark: "#07110d", light: "#f4efe2" } })
      .then(setQr)
      .catch(() => setNotice("二维码生成失败，请先复制下方固定地址"));
  }, [status.bootstrapUrl]);

  async function run(operation: () => Promise<LanStatus | void>) {
    setBusy(true); setNotice("");
    try { const next = await operation(); setStatus(next ?? STOPPED); }
    catch { setNotice("操作失败，请检查端口、防火墙和局域网连接"); }
    finally { setBusy(false); }
  }

  if (!client) return <section className="panel lan-mobile-card"><p className="eyebrow">手机访问</p><h2>桌面安装版中可用</h2><p>安装版可在同一 Wi‑Fi 下生成扫码链接。</p></section>;

  return <section className="panel lan-mobile-card">
    <div className="lan-mobile-head"><div><p className="eyebrow">同一 Wi‑Fi · 手机独立训练</p><h2>手机访问</h2></div><span className={status.running ? "lan-live" : "lan-off"}>{status.running ? "已开启" : "未开启"}</span></div>
    {!status.running ? <button className="primary" disabled={busy} onClick={() => void run(() => client.start())}>{busy ? "正在读取…" : "开启手机访问"}</button> : <div className="lan-mobile-running">
      {qr ? <img src={qr} alt="手机访问二维码" /> : <div className="qr-loading">正在生成二维码…</div>}
      <div className="lan-mobile-details"><b>用 iPhone 相机扫码</b><code>{status.bootstrapUrl}</code><span>这是家庭局域网固定地址，可重复打开。</span>{!status.mdnsAvailable ? <small>请只在可信 Wi-Fi 中开启；同一 Wi-Fi 的其他设备也可访问。电脑 IP 变化后地址会变化。</small> : null}
      <div className="settings-actions"><button disabled={busy} onClick={() => status.bootstrapUrl && navigator.clipboard?.writeText(status.bootstrapUrl)}>复制固定地址</button><button className="danger" disabled={busy} onClick={() => void run(() => client.stop())}>关闭访问</button></div></div>
    </div>}
    {notice ? <p role="status" className="settings-notice">{notice}</p> : null}
  </section>;
}
