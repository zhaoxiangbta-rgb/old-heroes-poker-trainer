# Version, Window, and Mobile Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1.1.5 with visible version identification, a desktop window that opens large enough for the full table, and compressed mobile delivery that remains stable on iPhone.

**Architecture:** Vite injects one shared compile-time version constant into desktop and mobile bundles. Existing `Header` and `SettingsPage` render that value without asynchronous native calls. Tauri config owns startup sizing, while the Rust LAN server negotiates gzip for large assets.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Tauri 2, Rust, flate2, Playwright WebKit.

## Global Constraints

- Top bar displays `v1.1.5` on desktop and mobile.
- Settings displays product, version, and desktop-local build identity.
- Default window is 1440×900; minimum is 1100×760; resizing remains enabled.
- Mobile remains offline-capable and does not fetch a second main application script.
- gzip is negotiated only when the request advertises support; uncompressed fallback remains valid.

---

### Task 1: Shared visible application version

**Files:**
- Create: `src/appVersion.ts`
- Modify: `vite.config.ts`
- Modify: `vite.mobile.config.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/SettingsPage.tsx`
- Test: `src/App.interaction.test.tsx`
- Test: `src/components/SettingsPage.test.tsx`

**Interfaces:**
- Produces: `APP_VERSION: string` and `APP_VERSION_LABEL: string`.
- Consumes: Vite compile-time `__APP_VERSION__` from `package.json`.

- [ ] Add failing component assertions for `v1.1.5` in the header and `老英雄牌局 v1.1.5 · 桌面本地版` in settings.
- [ ] Run the two component test files and confirm the version assertions fail.
- [ ] Add the shared version constant, inject it in both Vite configs, and render it in `Header` and `SettingsPage`.
- [ ] Run the two component test files and confirm they pass.

### Task 2: Desktop startup sizing

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Test: `src/config/tauriSecurity.test.ts`

**Interfaces:**
- Produces: Tauri window configuration with `width=1440`, `height=900`, `minWidth=1100`, `minHeight=760`, `resizable=true`.

- [ ] Add a failing config assertion for the five startup window properties.
- [ ] Run `src/config/tauriSecurity.test.ts` and confirm it fails on the old 1280×800 values.
- [ ] Update the Tauri window configuration to the specified values.
- [ ] Run the config test and confirm it passes.

### Task 3: Stable compressed mobile transfer and release

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/src/lan/server.rs`
- Modify: `src-tauri/src/lan/mod.rs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `docs/verification/mobile-lan-iphone14promax.md`

**Interfaces:**
- Consumes: HTTP `Accept-Encoding` request header.
- Produces: gzip response with `Content-Encoding: gzip`, `Vary: Accept-Encoding`, accurate compressed `Content-Length`, and an unchanged plain response fallback.

- [ ] Preserve the already-observed red-green Rust regression proving `/mobile/` compresses below 150KB.
- [ ] Bump all application-owned versions to 1.1.5 and update verification documentation.
- [ ] Run all Vitest tests, ESLint, production build, all Rust tests, and both WebKit LAN tests.
- [ ] Build and sign the macOS app and DMG, copy it to `release/macos/Old-Heroes-Poker-Trainer-v1.1.5-macOS-Apple-Silicon.dmg`, and record SHA-256.
- [ ] Run anonymous identity, mobile bundle, diff, and clean-worktree verification; commit the implementation.
