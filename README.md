# 老英雄牌局

离线 macOS / Windows 德州扑克决策训练应用。所有扑克事实由本地 TypeScript 规则引擎计算；模型连接是可选解释层，失败不影响训练。仅使用虚拟筹码。

欢迎通过 GitHub Issue 反馈规则错误、交互问题与功能建议，也欢迎提交 Pull Request。贡献方法见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发验证

```bash
npm install
npm test
npm run build
npm run tauri dev
```

## 打包

安装 Xcode Command Line Tools 与稳定版 Rust 后运行：

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/macos/老英雄牌局.app` 和 `src-tauri/target/release/bundle/dmg/`。应用包包含 Web 资源、Rust 运行时和 SQLite，不需要 Codex、Node、Python 或网络。未签名的本地构建首次启动时可在 Finder 中按住 Control 点击应用并选择“打开”。

可直接使用的安装包请到 GitHub Releases 下载：

- `Old-Heroes-Poker-Trainer-v1.0.0-macOS-Apple-Silicon.dmg`
- `Old-Heroes-Poker-Trainer-v1.0.0-Windows-x64-Portable.zip`

SHA-256：

- macOS：`612968f5fafa047616d663c66ad7019f03cdbd8aba066fbffa5f3bd1ec0c2545`
- Windows：`e4f11d340e3e1558dff5d181928ed4a9477254f51d6c1e2c133ca6dd4af7736a`

Windows 免安装版解压后双击 `老英雄牌局.exe`；Windows 10/11 通常已自带 WebView2 Runtime。两端均不需要 Codex、Node、Python 或网络。

## 操作

- 数字框表示“本街投入到”的总额，`½池`、`⅔池`、`底池`只填入金额，`ALL IN`直接提交最大合法投入。
- 点击动作后会立即显示简短回执并锁定按钮，对手随后逐个思考和行动。
- `Enter` 确认金额；可过牌时按空格过牌；`Esc` 两次确认弃牌。
- 位置采用中文主名并保留小号英文缩写；桌边筹码区持续显示每位玩家本街投入。
- 设置中可关闭本机合成音效；关闭状态保存在本地。
- 设置可选“标准均衡局”“普通朋友局”“宽松疯狂局”；从下一手生效，不改变当前手和历史重放。
- 设置中的六张牌友卡片可修改阿岚、北辰、墨川、青禾、老周和小满的名称，并分别调整入池宽度、主动进攻和诈唬频率；改动从下一手生效。
- 每手固定五位牌友入座，未入座牌友的筹码、买入和补码记录会按稳定身份继续保留；改名不会重置总账。
- 牌友习惯与牌局风格会叠加到本地混合策略；“专业”“入门”“运气好”等人物描述不会影响洗牌、发牌、胜率或结算。
- 设置可选经典深绿、午夜蓝、酒红和石墨黑四种牌桌主题，选择后立即生效并跨程序启动保留。
- 训练页牌桌与教学分析区之间可拖动调宽；也可聚焦分隔条后使用方向键，双击恢复默认宽度。
- 专项训练含九类固定入口，仍然打完整手，不在行动时提示答案。
- 弱点报告至少累计 5 个相关决策才形成正式结论，只按本地规则事实评价，不按单手输赢评价。

## 本地数据与安全

牌局数据位于 macOS 应用数据目录中的 `trainer.sqlite3`。API Key 只写入 macOS Keychain，服务名为 `com.decisionlab.pokertrainer`；SQLite、日志与 JSON 导出均不包含密钥。清空历史只删除牌局数据库记录，不读取或导出密钥。

- 完成的牌局、行动线、策略决策和结算跨程序启动保留。
- 每手以 v6 快照保存固定牌局风格、六位牌友设置、当手情绪、训练目标和英雄决策评分；SQLite v3 评估索引可从完整快照重建。
- “本次运行”的买入、补码和盈亏只存在内存中；完全退出程序再启动后，所有玩家以 200 筹码开始新会话。
- 历史牌局页可通过系统文件窗口导出、导入 v6 JSON；六位牌友设置随文件迁移但不含密钥，重复的 `种子:手数` 会跳过，无效或不兼容文件整批拒绝。
- 清空历史需要二次确认，只清除牌局；Base URL、模型名和 Keychain 密钥保留。
- 浏览器直接打开只用于开发预览，明确显示“开发预览 · 数据不持久”；桌面安装包才使用 SQLite 和 Keychain。

可选模型只负责解释结构化的本地规则事实。本地引擎的合法动作、胜率、EV、评分和结算始终优先；未配置密钥或连接失败时仍可完整训练。

## 完整验收

```bash
npm test -- --run
npm run lint
npm run build
CARGO_HOME="$PWD/.cargo-local" RUSTUP_HOME="$PWD/.rustup-local" "$PWD/.cargo-local/bin/cargo" test --manifest-path src-tauri/Cargo.toml
node scripts/verify-desktop-data.mjs
```
