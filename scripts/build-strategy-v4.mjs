import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const packPath = "public/assets/strategy-v4/strategy-v4-reference.json";
const manifestPath = `${packPath}.manifest.json`;
const [bytes, manifestText, details] = await Promise.all([
  readFile(packPath),
  readFile(manifestPath, "utf8"),
  stat(packPath),
]);
const manifest = JSON.parse(manifestText);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== manifest.sha256) throw new Error("V4 Solver 策略包哈希不匹配");
if (bytes.byteLength !== manifest.byteLength) throw new Error("V4 Solver 策略包大小不匹配");
if (details.size > 500 * 1024 * 1024) throw new Error("V4 Solver 策略包超过 500 MB");
const pack = JSON.parse(bytes.toString("utf8"));
if (pack.schemaVersion !== 4 || pack.nodes.length !== manifest.nodeCount) {
  throw new Error("V4 Solver 策略包节点数不匹配");
}
if (!/^[0-9a-f]{64}$/.test(pack.source?.sourceHash ?? "")) {
  throw new Error("V4 Solver 策略包缺少原始求解输入哈希");
}
for (const node of pack.nodes) {
  if (!Array.isArray(node.opponentHandClasses) || !node.opponentHandClasses.length) {
    throw new Error(`V4 Solver 节点 ${node.id} 缺少求解对手范围`);
  }
  const frequency = node.actions.reduce((sum, action) => sum + action.frequency, 0);
  if (Math.abs(frequency - 1) > 1e-4) throw new Error(`V4 Solver 节点 ${node.id} 频率未归一`);
}
console.log(JSON.stringify({ strategyVersion: pack.strategyVersion, nodes: pack.nodes.length, bytes: details.size, sha256 }));
