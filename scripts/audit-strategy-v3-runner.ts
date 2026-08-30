import { auditPreflopMatrix } from "../src/strategy/v3/preflopAudit";
import { compilePreflopMatrix } from "../src/strategy/v3/preflopCompiler";
import { PREFLOP_SOURCE_V3 } from "../src/strategy/v3/preflopSource";
import {
  auditPostflopStrategy,
  representativePostflopV3Fixtures,
} from "../src/strategy/v3/postflopAudit";

const report = auditPreflopMatrix(compilePreflopMatrix(PREFLOP_SOURCE_V3));

console.log(`V3 翻前策略审计：${report.nodeCount} 节点，${report.handCellCount} 个手牌单元`);
if (report.issues.length) {
  for (const issue of report.issues) {
    console.error(`[${issue.code}] ${issue.nodeId} ${issue.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log("审计通过：无缺失节点、缺失手牌、非法动作或范围方向异常。");
}

const postflop = auditPostflopStrategy(representativePostflopV3Fixtures());
console.log(`V3 翻后策略审计：${postflop.fixtureCount} 类代表局面`);
if (postflop.issues.length) {
  for (const issue of postflop.issues) {
    console.error(`[${issue.code}] ${issue.fixtureId} ${issue.detail}`);
  }
  process.exitCode = 1;
} else {
  console.log(`属性审计通过；独立参考已验证 ${postflop.independentlyVerified}，专家基线待外部验证 ${postflop.unverifiedExpertBaseline}。`);
}
