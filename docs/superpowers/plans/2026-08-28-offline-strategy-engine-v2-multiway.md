# 离线策略引擎 V2 多人底池 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让三人及以上底池使用独立对手范围、真实联合权益、身后玩家风险、脏/共享补牌和主边池 EV，替代当前低置信度 legacy 安全层。

**Architecture:** `RangeLedgerSnapshot` 继续按座位保存独立组合权重；新增确定性的联合组合抽样器，先排除已知牌与对手间冲突，再计算英雄及各对手的多人权益。多人策略只在公开范围和规则合法动作上工作，按有效筹码与底池资格分别计算 EV，并以更高价值阈值、更低诈唬频率输出 `multiway-resolver-v1`。复杂度超预算时返回当前最佳范围结果，绝不偷看未摊牌底牌。

**Tech Stack:** TypeScript 5.8、Vitest、现有 evaluator/ranges/pots/StrategyEngine、Tauri/Rust 离线交付；不新增运行时依赖。

## Global Constraints

- 规则引擎继续独占合法动作、主池/边池、有效筹码和结算事实。
- 每位对手范围独立更新；联合枚举必须排除英雄牌、公共牌和不同对手间的重复牌。
- 多人结果标记低于单挑蓝图的置信度，不得称为精确 Solver 解。
- 顶对、弱两对和非坚果听牌在多人池必须降低价值阈值；纯诈唬频率必须低于相似单挑节点。
- 真实动作前底池、移动筹码、身后人数和每个边池可赢金额必须进入 EV。
- 运行时目标 250 ms；预算耗尽返回当前最佳合法结果并记录近似样本数。
- 公开桌面与移动包不得包含私有姓名、密钥、隐藏底牌或固定局域网地址。

---

### Task 1: 多人联合组合权益

**状态：完成**

**Files:**
- Create: `src/strategy/multiwayEquity.ts`
- Test: `src/strategy/multiwayEquity.test.ts`

**Interfaces:**
- Consumes: `estimateMultiwayEquity(hero, board, rangesBySeat, budget): MultiwayEquityResult`
- Produces: `{ heroEquity; opponentEquity; validJointSamples; rejectedConflicts; exact; elapsedMs }`

- [ ] **Step 1: 写失败测试**：三人河牌做精确联合枚举并与手工结果一致；任何联合样本不得共享底牌；固定输入结果完全一致；增加强对手范围后英雄权益不得上升。
- [ ] **Step 2: 运行红灯**：`npx vitest run src/strategy/multiwayEquity.test.ts`，预期模块不存在。
- [ ] **Step 3: 最小实现**：按座位排序范围，以累计权重分位产生确定性候选，递归排除冲突；河牌小范围全枚举，其他情况按预算限制联合样本和公共牌 runout。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，所有权益有限且总和为 1。
- [ ] **Step 5: 提交**：`git commit -m "feat: estimate joint multiway equity"`。

### Task 2: 脏补牌、共享补牌与反向隐含赔率

**状态：完成**

**Files:**
- Create: `src/strategy/multiwayOuts.ts`
- Test: `src/strategy/multiwayOuts.test.ts`

**Interfaces:**
- Consumes: `classifyMultiwayOuts(hero, board, rangesBySeat): MultiwayOutFacts`
- Produces: `{ clean; dirty; shared; counterfeit; reverseImpliedRisk }`

- [ ] **Step 1: 写失败测试**：低同花听牌面对更高同花范围的同花补牌为脏；共享顺子补牌不得算完整赢率；两对被公共牌配对反超标为 counterfeit。
- [ ] **Step 2: 运行红灯**：预期模块不存在。
- [ ] **Step 3: 最小实现**：逐张未知下一街牌比较英雄与每位范围代表组合，按独赢、平分、仍落后和被反超分类。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过并验证已知牌不进入补牌集合。
- [ ] **Step 5: 提交**：`git commit -m "feat: classify multiway clean and dirty outs"`。

### Task 3: 主池、边池和有效筹码 EV

**状态：完成**

**Files:**
- Create: `src/strategy/multiwayPots.ts`
- Test: `src/strategy/multiwayPots.test.ts`

**Interfaces:**
- Consumes: `multiwayPotExposure(state, actionTo): MultiwayPotExposure`
- Produces: 每个池的 `amount`、`eligibleSeats`、英雄可赢金额、额外投入和最大损失。

- [ ] **Step 1: 写失败测试**：短码全下只参与主池；深码加注只在边池增加风险；弃牌者贡献保留但无资格；不同有效筹码的 EV 只乘可赢池。
- [ ] **Step 2: 运行红灯**：预期模块不存在。
- [ ] **Step 3: 最小实现**：复用 `buildPots` 分层，加入候选行动后的贡献但不修改 `GameState`，返回英雄对每层的真实 exposure。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过并验证总池金额守恒。
- [ ] **Step 5: 提交**：`git commit -m "feat: model multiway side-pot exposure"`。

### Task 4: 多人范围策略与身后风险

**状态：完成**

**Files:**
- Create: `src/strategy/multiwayStrategy.ts`
- Test: `src/strategy/multiwayStrategy.test.ts`

**Interfaces:**
- Consumes: `resolveMultiwayStrategy(request, equity, outs, exposure): StrategyResult`
- Produces: `strategyVersion: multiway-resolver-v1`、`source: multiway-resolver`、低于单挑的 `confidence`

- [ ] **Step 1: 写失败测试**：多人顶对以控池/跟注为主；坚果保留价值加注；强听牌结合赔率继续；空气诈唬率低于同牌面单挑；身后玩家增加时边缘加注下降。
- [ ] **Step 2: 运行红灯**：预期模块不存在。
- [ ] **Step 3: 最小实现**：用多人权益、可赢池、补牌质量、身后继续概率和合法尺度计算 fold/check/call/raise EV 与频率；频率归一化并钳制合法范围。
- [ ] **Step 4: 运行绿灯**：同一命令全部通过，动作合法、EV 有限、频率和为 1。
- [ ] **Step 5: 提交**：`git commit -m "feat: add range-based multiway strategy"`。

### Task 5: 统一引擎、评分与重放接入

**状态：完成**

**Files:**
- Modify: `src/strategy/engine.ts`
- Modify: `src/strategy/engine.test.ts`
- Modify: `src/training/assessment.ts`
- Test: `src/training/assessment.test.ts`

**Interfaces:**
- Consumes: Task 1–4 多人事实
- Produces: 对手机器人、玩家评分和历史记录共用同一 `multiway-resolver-v1` 结果

- [ ] **Step 1: 写失败测试**：三人翻后不再返回 legacy；同一状态和种子完全重放；预算耗尽仍合法；旧版历史仍明确不评分。
- [ ] **Step 2: 运行红灯**：预期三人节点仍为 `safe-fallback`。
- [ ] **Step 3: 最小实现**：在单挑路由之后接多人 resolver，保存范围样本数、补牌风险、边池 exposure 和低置信度；异常时保留安全降级。
- [ ] **Step 4: 运行绿灯**：引擎、评分、游戏和持久化相关测试全部通过。
- [ ] **Step 5: 提交**：`git commit -m "feat: route multiway decisions through range resolver"`。

### Task 6: 实战回归与离线发布门禁

**状态：完成（前端、压力、移动包与 16 项 Rust 原生门禁全部通过）**

**Files:**
- Create: `src/strategy/multiwayRegression.test.ts`
- Modify: `src/strategy/stressGate.test.ts`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: 完整多人策略链
- Produces: 阶段四可玩、可测、可回退交付

- [ ] **Step 1: 写失败测试**：多人顶对不过度打光；强牌不是无条件慢打；合理保护下注非零；脏补牌降低继续率；身后玩家压低边缘加注。
- [ ] **Step 2: 运行红灯**：预期 legacy 或行为断言失败。
- [ ] **Step 3: 完成门禁**：压力测试拒绝多人翻后无原因降级，移动包要求 `multiway-resolver-v1`，README 说明精度边界。
- [ ] **Step 4: 全量验证**：运行前端全量、策略压力、Lint、桌面/移动构建与验证、Rust 离线测试。
- [ ] **Step 5: 恢复私有姓名并提交**：只提交阶段四文件，保留现有两份无关 UI 文档，`git commit -m "test: gate multiway strategy release"`。

## Phase Completion Review

- 多人权益联合样本不含重复牌，各对手范围独立且固定输入可重放。
- 主池/边池、有效筹码、脏/共享补牌和身后风险进入动作 EV。
- 多人策略置信度明确低于单挑蓝图，纯诈唬频率更低，不把顶对当成单挑坚果。
- 桌面与移动离线包使用同一策略版本；异常时仍合法降级且不计正式能力分。
