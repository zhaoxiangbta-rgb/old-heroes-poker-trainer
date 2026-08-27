import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const portableExecutableName = "Old-Heroes-Poker-Trainer.exe";

export function validateArchiveEntries(entries) {
  for (const entry of entries) {
    if (entry.includes("�")) throw new Error(`压缩包文件名出现乱码：${entry}`);
    if (!/^[\x20-\x7e]+$/.test(entry)) throw new Error(`Windows 免安装包仅允许 ASCII 文件名：${entry}`);
  }
}

export function packageWindowsPortable({ source, output }) {
  const sourcePath = resolve(source);
  const outputPath = resolve(output);
  const staging = mkdtempSync(join(tmpdir(), "old-heroes-windows-"));
  const stagedExecutable = join(staging, portableExecutableName);
  mkdirSync(dirname(outputPath), { recursive: true });
  try {
    copyFileSync(sourcePath, stagedExecutable);
    try { unlinkSync(outputPath); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    execFileSync("zip", ["-j", "-9", outputPath, stagedExecutable], { stdio: "inherit" });
    const entries = execFileSync("unzip", ["-Z1", outputPath], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    validateArchiveEntries(entries);
    if (entries.length !== 1 || entries[0] !== portableExecutableName) {
      throw new Error(`压缩包入口不正确：${entries.join(", ")}`);
    }
    return outputPath;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
  const source = process.argv[2] ?? join(projectRoot, "src-tauri/target/x86_64-pc-windows-msvc/release/poker-decision-trainer.exe");
  const output = process.argv[3] ?? join(projectRoot, `release/windows-portable/Old-Heroes-Poker-Trainer-v${pkg.version}-Windows-x64-Portable.zip`);
  const archive = packageWindowsPortable({ source, output });
  console.log(`Windows 免安装包已生成：${basename(archive)}`);
}
