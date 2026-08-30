# Solver 支撑的离线策略 V4 设计规格

## 目标

把当前以启发式 EV 和动作软抽样为主的翻后策略，升级为适合初中级玩家训练的离线策略系统。开发阶段允许使用开源 Solver 生成与交叉验证标准单挑节点；正式桌面和移动应用只携带压缩策略包与本地解析器，不依赖 Solver、Python、Rust、Node、网络或大模型。

本版本优先保证“基本扑克判断可信”，再追求混合频率精度。明显被支配的空气跟注、无依据反加、无更差跟注范围的价值下注和每条街独立抽签必须在架构层消失，而不是按单手牌增加特判。

## 产品边界

- 默认六人现金局，盲注 1/2，起始 200，即 100 BB。
- 翻前继续使用完整 169 类手牌矩阵，并补齐节点来源和交叉校验。
- 单挑翻后使用 Solver 蓝图、组合级当前范围和固定预算本地解析。
- 多人翻后继续使用本地联合范围与权益模型，并采用更保守的理性门槛；不宣称多人 GTO。
- 标准策略是教学基线。朋友局和玩家画像只能在基线附近做有界偏移，不能复活被理性门槛淘汰的动作。
- 桌面完整策略数据不超过 500 MB；移动包从同一源数据量化生成。
- 大模型只可解释结构化事实，不参与牌型、范围、EV、动作和评分。

## 已确认的根因

当前系统存在四类结构问题：

1. 最佳五张牌型、公共牌贡献和底牌贡献曾被混为一个标签。
2. 所有合法动作经过 softmax 后都可能获得非零频率，严重负 EV 动作没有先被淘汰。
3. 朋友局的 `callBias` 会放大边缘乃至错误跟注，没有理性下限。
4. 每条街独立抽样，没有保存“为何继续”和“下一街如何处理”的计划。

因此空气牌可能连续支付满池和半池下注，也可能因为公共牌成对被描述成私人成牌。

## 总体数据流

```text
公开决策状态
  → PokerFactsV4（公共牌贡献、底牌贡献、相对牌力、真实听牌、阻断牌）
  → RangeStateV4（逐组合权重与行动线更新）
  → SolverBlueprintV4（标准节点与相邻节点）
  → CandidateEvaluatorV4（当街 EV + 后续街计划）
  → DominanceGateV4（淘汰明显不理性动作）
  → ProfileAdjustmentV4（朋友局/人物画像有限偏移）
  → 合法性校验与确定性抽样
  → CoachFactsV4（牌局中与复盘共用）
```

## 1. PokerFactsV4

每个翻后组合必须分别输出：

```ts
type PokerFactsV4 = {
  absoluteCategory: HandCategory;
  boardCategory: HandCategory | "none";
  privateContribution: "none" | "kicker" | "pair" | "two-pair" |
    "trips" | "straight" | "flush" | "full-house" | "quads" | "straight-flush";
  relativeClass: "nuts" | "near-nuts" | "strong-value" | "thin-value" |
    "showdown" | "draw" | "air";
  kickerBand: "none" | "weak" | "medium" | "strong" | "top";
  draws: DrawFactV4[];
  blockers: BlockerFactV4[];
  cleanOuts: Card[];
  dirtyOuts: Card[];
  counterfeitCards: Card[];
};
```

“公共牌一对、底牌未改善”不得再变成“你有普通一对”。后门听牌、真实一张补牌听牌和已经成牌必须分开。

## 2. RangeStateV4

- 每个存活座位维护逐组合权重，而不是只维护“强牌/普通牌/空气”总比例。
- 更新因子包括位置、翻前节点、街道、下注尺寸、前序行动、人数、SPR 和玩家画像。
- 更新后必须归一化并保存快照哈希。
- 范围分类只用于展示，EV 始终消费逐组合权重。
- 未摊牌暗牌不得作为范围输入；对手做决定时可以使用自己的底牌，这是该座位的私有事实。

## 3. SolverBlueprintV4

### 开发期 Solver

默认开发适配器面向 MIT 许可的 `amaster97/poker_solver`；同时保留通用 JSON 导入协议，避免绑定单一项目。Solver 只在 `tools/solver-v4/` 的生成流程中运行，不进入应用运行时。

### 首批蓝图覆盖

- 100 BB 单挑单加注底池：BTN 对 BB、CO 对 BB、SB 对 BB。
- 翻牌双方范围、33%/67%/100% 底池下注、2.5x/3x 加注和全下。
- 牌面族覆盖 A/K/Q/J 高干燥牌、低牌连接面、两同花、单色、顶牌成对、低牌成对和三张同点数。
- 转河保存牌面变化类别，而不是穷举所有原始牌面字符串。
- 3-bet 底池作为第二批节点；多人池不使用伪 Solver 结果。

### 包格式

```ts
type SolverNodeV4 = {
  nodeId: string;
  source: "solver" | "interpolated" | "expert";
  position: "IP" | "OOP";
  potType: "limped" | "srp" | "3bp";
  boardFamily: string;
  sprBucket: number;
  line: string;
  combos: Record<string, Array<{ action: string; frequency: number; ev: number }>>;
  exploitability?: number;
  sourceHash: string;
};
```

策略包必须保存 schema、生成器版本、Solver 名称和版本、配置哈希、节点数及 SHA-256。

## 4. DominanceGateV4

动作抽样前先执行硬门槛：

- 面对下注，若跟注 EV 明显低于弃牌且不在 Solver 容差内，跟注频率归零。
- 空气牌没有真实听牌、有效阻断或 Solver 支持时，反加频率归零。
- 价值下注若没有更差继续组合，不能标记为价值，也不能成为主要动作。
- 纯诈唬必须记录目标弃牌组合和所需弃牌率；目标不存在时淘汰。
- 后门听牌单独存在时，不能支持面对大下注继续或反加。
- 河牌空气跟注必须满足抓诈唬所需权益，并由对手诈唬组合权重支持。
- 画像调整只能在门槛保留的动作中重新加权。

容差以底池为单位：标准教学主动作只允许 `EV >= bestEV - 0.03 pot`；Solver 明确给出的小频率混合可以保留为“可接受混合”，但不得用作唯一推荐。

## 5. 跨街计划

每次非弃牌动作保存：

```ts
type StreetPlanV4 = {
  planId: string;
  reason: "value" | "thin-value" | "protection" | "semi-bluff" |
    "pure-bluff" | "bluff-catch" | "pot-control" | "induce";
  targetCombos: string[];
  foldTargets: string[];
  continueOn: Array<{ runoutClass: string; actions: string[] }>;
  abandonOn: string[];
  createdAtStreet: Street;
};
```

下一街决策先读取上一街计划，再根据新牌和对手行动更新。计划不是强制脚本，但如果策略反转，必须保存反转原因。空气牌不能在每条街重新获得一张独立的彩票。

## 6. 对手画像

- 标准均衡局直接使用标准策略容差内频率。
- 普通朋友局提高边缘成牌、合理抓诈唬和听牌的继续率，降低纯诈唬与河牌大额诈唬频率。
- 宽松疯狂局可以增加高方差动作，但仍受 DominanceGateV4 限制。
- 个人画像调整保存最大偏移、调整前后频率和中文原因。
- “松”不等于拿任何两张牌跟到底；“激进”不等于无限反加。

## 7. 教学解释

现场提示固定回答四件事：

1. 你的底牌实际贡献了什么，当前能赢哪些类型。
2. 对手根据行动线最可能有哪些组合。
3. 推荐动作的收益来自哪些更差继续牌或哪些更好弃牌。
4. 下一街哪些牌改善、恶化或推翻当前计划。

整手复盘按行动线讲述范围如何变化，不重复输出同一组概率。专业数据折叠保存，主要区禁止出现无法解释的“有效组合 213.9”式孤立字段。

## 8. 黄金牌例与验证

黄金牌例至少覆盖：

- `2♥3♥ / J-4-J` 面对下注：公共牌一对、底牌未改善，不得无依据反加。
- `J2 / A-9-7` 被过牌到：无成牌、无真实听牌、无阻断时不得连续三街强制诈唬。
- 空气牌面对满池后又面对半池：朋友局画像不得把严重负 EV 跟注恢复为主要动作。
- 顶两对在顺子完成牌上的价值衰减与对手继续范围。
- 强牌干燥面必须比较小尺寸、过牌诱导和大尺寸的更差继续范围。
- 河牌大加注在被动朋友局中显著收紧诈唬范围。

验证层级：

1. 牌型与组合事实单元测试。
2. 黄金牌例主要动作与解释断言。
3. Solver 节点主要动作、尺度和 EV 排序交叉校验。
4. 10,000 手随机合法性与理性属性扫描。
5. 桌面 P95 150 ms、移动 P95 250 ms。
6. 桌面/移动同源包差异门禁、离线构建与重放测试。

## 9. 失败与降级

- Solver 节点缺失时使用明确标记的专家基线或相邻节点插值。
- 任何插值结果仍必须经过 DominanceGateV4。
- 包校验失败时显示安全降级，不参与正式评分。
- 实时预算超时返回已校验的基础策略；精算可以后台继续。

## 10. 完成定义

V4 只有同时满足以下条件才可标记完成：

- 黄金牌例全部通过且无单手硬编码。
- 对手实际行动和玩家教学建议使用同一标准策略事实。
- 朋友局画像无法恢复被淘汰的明显负 EV 动作。
- Solver 导入节点可复现、可审计、可重新生成。
- 牌局中与复盘结论一致、自然中文可理解。
- 全量测试、策略审计、性能门、桌面/移动构建和离线运行通过。

