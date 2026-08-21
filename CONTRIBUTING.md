# 参与贡献

欢迎通过 GitHub Issue 提交规则错误、交互问题和功能建议，也欢迎提交 Pull Request。

提交代码前请运行：

```bash
npm ci
npm test -- --run
npm run lint
npm run build
```

涉及德州扑克规则、结算、胜率或 EV 的修改，请同时补充可复现测试。规则引擎是唯一事实源，不以单手输赢判断策略正确性。请勿在 Issue、日志、测试数据或提交中加入 API Key 与其他敏感信息。
