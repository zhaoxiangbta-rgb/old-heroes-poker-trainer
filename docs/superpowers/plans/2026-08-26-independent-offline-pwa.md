# 独立离线移动版 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有移动牌局发布为可从固定 HTTPS 地址安装、断网独立启动并在手机 IndexedDB 持久化的 PWA。

**Architecture:** 保留 `src/mobile` 及共享规则引擎作为唯一应用实现，新增一个小型 PWA 生命周期模块管理 Service Worker 状态和更新。移动构建继续产出兼容 Safari 14 的单页应用，同时生成 Manifest、版本化 Service Worker 和品牌图标；GitHub Pages 只托管匿名静态产物。

**Tech Stack:** React 19、TypeScript 5.8、Vite 7、Service Worker、Web App Manifest、IndexedDB、Vitest、Playwright WebKit、GitHub Actions/Pages

## Global Constraints

- iPhone 14 Pro Max 竖屏是主要验收尺寸，同时兼容主流安卓浏览器。
- 首次访问和版本更新需要联网；成功加载一次后，电脑关闭且手机断网仍可启动和训练。
- 不新增账号、后端、云同步、API Key 或原生签名流程。
- 本地规则引擎仍是唯一事实源；移动端复用 `src/game`、`src/engine`、`src/policy` 和 `src/training`。
- PWA、日志、缓存和发布物不得包含私人姓名、密钥或本地配置。
- 更新不得在牌局中途强制刷新，也不得清除 IndexedDB。

---

### Task 1: 可测试的 PWA 生命周期状态机

**Files:**
- Create: `src/mobile/pwaLifecycle.ts`
- Create: `src/mobile/pwaLifecycle.test.ts`
- Modify: `src/vite-env.d.ts`

**Interfaces:**
- Consumes: 浏览器 `navigator.serviceWorker`、`navigator.onLine` 和 `window` 在线事件。
- Produces: `registerPwaLifecycle(): PwaLifecycleHandle`、`subscribe(listener): () => void`、`activateUpdate(): Promise<void>`；状态类型 `PwaStatus = "unsupported" | "installing" | "offline-ready" | "update-ready" | "error"`。

- [ ] **Step 1: 写失败测试**

```ts
it("only reports offline-ready after the worker confirms precache", async () => {
  const lifecycle = createPwaLifecycle(fakeServiceWorkerContainer());
  const states: PwaStatus[] = [];
  lifecycle.subscribe((snapshot) => states.push(snapshot.status));
  await lifecycle.register();
  fakeControllerMessage({ type: "PWA_CACHE_READY", version: "1.1.7" });
  expect(states).toEqual(["installing", "offline-ready"]);
});

it("keeps the current page until activateUpdate is called", async () => {
  fakeRegistration.waiting = fakeWorker;
  await lifecycle.register();
  expect(lifecycle.snapshot().status).toBe("update-ready");
  expect(fakeWorker.postMessage).not.toHaveBeenCalled();
  await lifecycle.activateUpdate();
  expect(fakeWorker.postMessage).toHaveBeenCalledWith({ type: "PWA_ACTIVATE_UPDATE" });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/mobile/pwaLifecycle.test.ts`

Expected: FAIL，因为 `pwaLifecycle.ts` 尚不存在。

- [ ] **Step 3: 实现最小生命周期模块**

```ts
export type PwaStatus = "unsupported" | "installing" | "offline-ready" | "update-ready" | "error";
export type PwaSnapshot = { status: PwaStatus; online: boolean; appVersion: string; cacheVersion?: string; message?: string };
export type PwaLifecycleHandle = {
  snapshot(): PwaSnapshot;
  subscribe(listener: (value: PwaSnapshot) => void): () => void;
  register(): Promise<void>;
  activateUpdate(): Promise<void>;
  clearAppCache(): Promise<void>;
};
```

实现要求：注册 URL 使用 `new URL("./service-worker.js", document.baseURI)`；仅在 HTTPS 或 localhost 注册；监听 `updatefound`、`controllerchange`、worker message、online/offline；等待中的 worker 只有收到用户触发的 `PWA_ACTIVATE_UPDATE` 才调用 `skipWaiting`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npx vitest run src/mobile/pwaLifecycle.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/mobile/pwaLifecycle.ts src/mobile/pwaLifecycle.test.ts src/vite-env.d.ts
git commit -m "feat: add mobile PWA lifecycle"
```

### Task 2: Manifest、版本化离线缓存与恢复行为

**Files:**
- Create: `mobile/manifest.webmanifest`
- Create: `mobile/service-worker.template.js`
- Create: `mobile/recovery.html`
- Create: `scripts/build-pwa-assets.mjs`
- Create: `scripts/build-pwa-assets.test.mjs`
- Create: `public/pwa/icon-192.png`
- Create: `public/pwa/icon-512.png`
- Create: `public/pwa/apple-touch-icon.png`
- Modify: `mobile/index.html`
- Modify: `vite.mobile.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `package.json.version`、移动端构建后的 `dist/mobile/index.html` 和品牌图标。
- Produces: `dist/mobile/manifest.webmanifest`、`dist/mobile/service-worker.js`、恢复页和三种 PWA 图标；Service Worker 消息 `PWA_CACHE_READY`、`PWA_ACTIVATE_UPDATE`、`PWA_CLEAR_CACHE`。

- [ ] **Step 1: 写失败测试**

```js
test("generated worker has a versioned cache and real precache files", async () => {
  await buildPwaAssets({ distDir, version: "9.8.7" });
  const worker = await readFile(join(distDir, "service-worker.js"), "utf8");
  assert.match(worker, /old-heroes-pwa-9\.8\.7-/);
  for (const url of extractPrecacheUrls(worker)) {
    await access(join(distDir, url.replace(/^\.\//, "")));
  }
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/build-pwa-assets.test.mjs`

Expected: FAIL，因为构建脚本尚不存在。

- [ ] **Step 3: 实现静态资源生成**

`manifest.webmanifest` 固定包含：

```json
{
  "name": "老英雄牌局",
  "short_name": "老英雄",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#030907",
  "theme_color": "#07110d",
  "lang": "zh-CN"
}
```

构建脚本读取实际产物并生成预缓存清单及内容哈希。Worker 的安装阶段使用临时缓存，所有资源成功后再标记为 ready；导航请求 cache-first 并以 `./index.html` 为离线回退；激活阶段只删除 `old-heroes-pwa-` 前缀的旧缓存；清缓存消息只删除同前缀缓存，不触碰 IndexedDB。

在 `mobile/index.html` 加入相对路径 Manifest、`apple-touch-icon`、`apple-mobile-web-app-capable`、中文启动状态和 `noscript` 恢复提示。把 `npm run build:pwa-assets` 接到移动构建之后。

- [ ] **Step 4: 运行资源测试和真实构建**

Run: `node --test scripts/build-pwa-assets.test.mjs && npm run build`

Expected: PASS；`dist/mobile` 包含 HTML、Manifest、Worker、恢复页和图标。

- [ ] **Step 5: 提交**

```bash
git add mobile public/pwa scripts/build-pwa-assets.mjs scripts/build-pwa-assets.test.mjs vite.mobile.config.ts package.json package-lock.json
git commit -m "feat: build installable offline PWA assets"
```

### Task 3: 中文离线、安装、更新与存储状态界面

**Files:**
- Create: `src/mobile/PwaStatusPanel.tsx`
- Create: `src/mobile/PwaStatusPanel.test.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Modify: `src/mobile/MobileApp.test.tsx`
- Modify: `src/mobile/mobile.css`

**Interfaces:**
- Consumes: Task 1 的 `PwaLifecycleHandle` 和已有 `DesktopRepository`。
- Produces: 常驻轻量状态条及设置入口中的详情卡；按钮文案“立即更新”“重试离线准备”“清理应用缓存”。

- [ ] **Step 1: 写失败组件测试**

```tsx
it("shows offline readiness and asks before activating an update", async () => {
  render(<MobileApp repository={createMemoryRepository()} pwaLifecycle={fakeLifecycle("offline-ready")} />);
  expect(screen.getByText("已可离线使用")).toBeVisible();
  fakeLifecycle.emit({ status: "update-ready", online: true, appVersion: "1.1.7", cacheVersion: "1.1.8" });
  await user.click(screen.getByRole("button", { name: "立即更新" }));
  expect(fakeLifecycle.activateUpdate).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/mobile/PwaStatusPanel.test.tsx src/mobile/MobileApp.test.tsx`

Expected: FAIL，因为组件和注入接口尚不存在。

- [ ] **Step 3: 实现状态界面并移除桌面心跳依赖**

`MobileApp` 新签名：

```ts
export function MobileApp({
  repository,
  pwaLifecycle,
}: {
  repository?: DesktopRepository;
  pwaLifecycle?: PwaLifecycleHandle;
})
```

删除独立 PWA 对 `/_lan/health` 的周期性依赖；局域网模式只通过页面来源识别并展示非阻塞说明。状态文案分别为“正在准备离线版本”“已可离线使用”“当前离线运行”“新版本已准备好”“离线准备失败，当前版本仍可使用”。安装说明使用中文：Safari“分享”→“添加到主屏幕”。更新必须由用户点击按钮触发。

- [ ] **Step 4: 运行组件测试并确认通过**

Run: `npx vitest run src/mobile/PwaStatusPanel.test.tsx src/mobile/MobileApp.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/mobile/PwaStatusPanel.tsx src/mobile/PwaStatusPanel.test.tsx src/mobile/MobileApp.tsx src/mobile/MobileApp.test.tsx src/mobile/mobile.css
git commit -m "feat: show mobile offline and update status"
```

### Task 4: 生产环境离线启动与持久化验收

**Files:**
- Create: `tests/mobile-pwa.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/verify-mobile-bundle.mjs`
- Modify: `src/data/indexedDbRepository.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `dist/mobile` 和 Task 3 的可访问状态文案。
- Produces: `npm run test:pwa` 以及增强后的 `npm run verify:mobile-bundle`。

- [ ] **Step 1: 写失败的生产验收测试**

```ts
test("installed mobile app restarts offline with IndexedDB history", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("已可离线使用")).toBeVisible();
  await page.getByRole("button", { name: /跟注|过牌/ }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeVisible();
  await expect(page.getByText("当前离线运行")).toBeVisible();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run build && npx playwright test tests/mobile-pwa.spec.ts --project=webkit`

Expected: FAIL，直至 Worker 注册、缓存和状态 UI 串联完成。

- [ ] **Step 3: 加强发布物和持久化校验**

`verify-mobile-bundle.mjs` 必须检查：Manifest 字段、Worker 预缓存文件存在、HTML 不含局域网固定 IP、禁止姓名和密钥哨兵不存在、所有资源路径可从 GitHub Pages 子路径解析。IndexedDB 测试新增“重新创建仓库实例后仍能恢复牌局和设置”，并验证清应用缓存逻辑不调用 `indexedDB.deleteDatabase`。

- [ ] **Step 4: 运行 PWA、视觉和数据测试**

Run: `npm run build && npm run verify:mobile-bundle && npm run test:pwa && npm run test:mobile-visual && npx vitest run src/data/indexedDbRepository.test.ts`

Expected: 全部 PASS；WebKit 断网刷新后仍显示牌桌，iPhone 14 Pro Max 视口无横向溢出。

- [ ] **Step 5: 提交**

```bash
git add tests/mobile-pwa.spec.ts playwright.config.ts scripts/verify-mobile-bundle.mjs src/data/indexedDbRepository.test.ts package.json
git commit -m "test: verify independent offline mobile app"
```

### Task 5: GitHub Pages 固定地址发布与中文安装文档

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-26-independent-offline-pwa-design.md`

**Interfaces:**
- Consumes: 通过全部验证的 `dist/mobile` 匿名静态产物。
- Produces: GitHub Pages artifact 和 README 中的固定安装地址、iPhone/安卓安装步骤、备份警告。

- [ ] **Step 1: 写发布工作流静态检查**

在 `scripts/verify-mobile-bundle.mjs` 中加入工作流契约：发布目录必须精确为 `dist/mobile`，发布前必须运行 `npm ci`、`npm test`、`npm run build` 和 `npm run verify:mobile-bundle`。

- [ ] **Step 2: 运行检查并确认失败**

Run: `npm run build && npm run verify:mobile-bundle`

Expected: FAIL，因为 `.github/workflows/pages.yml` 尚不存在。

- [ ] **Step 3: 实现 Pages 工作流和中文说明**

工作流仅在默认分支通过验证后部署，使用 `actions/upload-pages-artifact` 上传 `dist/mobile`，再由 `actions/deploy-pages` 发布。README 写明：

```md
### iPhone 独立安装

1. 用 Safari 打开固定 HTTPS 地址。
2. 等待页面显示“已可离线使用”。
3. 点“分享”→“添加到主屏幕”。
4. 从主屏幕打开“老英雄牌局”；以后电脑关闭或断网也可训练。

手机数据只保存在当前浏览器。清除 Safari 网站数据或卸载应用前，请先在“历史牌局”导出 JSON 备份。
```

发布后把实际 Pages URL 写回 README 和设计文档，不保留示例地址。

- [ ] **Step 4: 执行完整回归**

Run: `npm test && npm run lint && npm run build && npm run verify:mobile-bundle && npm run test:pwa && npm run test:mobile-visual && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 前端、PWA、WebKit、匿名构建和 Rust 测试全部 PASS。

- [ ] **Step 5: 提交并发布**

```bash
git add .github/workflows/pages.yml README.md docs/superpowers/specs/2026-08-26-independent-offline-pwa-design.md scripts/verify-mobile-bundle.mjs
git commit -m "ci: publish offline PWA to GitHub Pages"
git push origin HEAD:<default-branch>
```

发布后在 iPhone Safari 实机完成：首次访问、添加主屏幕、飞行模式启动、完成一手牌、退出重开、历史恢复和 JSON 导出。若 GitHub Pages 尚未在仓库启用，先在仓库设置中选择 GitHub Actions 作为 Pages 来源，再重跑工作流。

