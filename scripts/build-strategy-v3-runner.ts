import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileStrategyPacks } from "../src/strategy/v3/packCompiler";

const result = compileStrategyPacks();
const output = resolve("public/assets/strategy");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "strategy-v3-desktop.ohsp3"), result.desktop);
await writeFile(resolve(output, "strategy-v3-mobile.ohsp3"), result.mobile);
console.log(
  `V3 策略包已生成：桌面 ${(result.desktop.byteLength / 1024 / 1024).toFixed(2)} MB，` +
  `移动 ${(result.mobile.byteLength / 1024 / 1024).toFixed(2)} MB，` +
  `对照 ${result.diffReport.comparedHands} 个手牌单元。`,
);
