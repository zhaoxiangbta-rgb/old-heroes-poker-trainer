# Local Qwen Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional local-Qwen coaching layer that becomes the primary user-facing live explanation and post-hand review when enabled, while preserving the existing local engine as the sole source of poker facts and the complete fallback path.

**Architecture:** Tauri owns the OpenAI-compatible HTTP transport and optional Keychain credential. TypeScript builds versioned fact packs from existing local solver/review results, validates model JSON against those facts, and exposes guarded asynchronous hooks to the current live panel and completed-hand review. The model never receives authority over cards, legal actions, bot actions, EV, settlement, or scoring.

**Tech Stack:** Tauri 2, Rust, `ureq`, React 19, TypeScript, Vitest, SQLite, macOS Keychain, OpenAI-compatible `/v1/chat/completions`.

## Global Constraints

- The local rules and Solver remain the only source of cards, legal actions, opponent actions, EV, equity, ranges, scoring, and settlement.
- AI is optional and disabled by default for existing installations.
- `Qwen3.5-9B-Q8` at `http://192.168.120.86:8081/v1/chat/completions` is the verified first target.
- API Key is optional; when present it remains in Keychain and never enters SQLite, logs, exports, or model fact packs.
- Live AI requests must never block action controls and expire after four seconds.
- Post-hand AI requests may take up to thirty seconds and run only after local deep review facts are ready.
- Invalid, stale, conflicting, unavailable, or timed-out AI output is discarded as a whole and the existing local UI remains usable.
- Existing unrelated changes in the 2026-08-26 mobile UI plan/spec files are preserved and excluded from commits.

---

### Task 1: OpenAI-Compatible Native Transport

**Files:**
- Modify: `src-tauri/src/ai.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/storage.rs`
- Modify: `src/data/types.ts`
- Modify: `src/data/nativeRepository.ts`
- Modify: `src/data/memoryRepository.ts`
- Test: `src-tauri/src/ai.rs`
- Test: `src/data/repository.test.ts`

**Interfaces:**
- Produces: `normalize_chat_completions_url(base: &str) -> Result<String, String>`.
- Produces: `ModelSettings { base_url, model, enabled }` with a backward-compatible default for `enabled`.
- Produces: `AiGenerationRequest { kind: "live" | "review", facts: serde_json::Value }`.
- Produces: `AiGenerationResult { content, model, elapsed_ms }`.
- Produces: `DesktopRepository.generateAiExplanation(request): Promise<AiGenerationResult>`.

- [ ] **Step 1: Write failing Rust tests** for root URL normalization, complete endpoint preservation, optional authorization, disabled settings, and response-content extraction.
- [ ] **Step 2: Run `cargo test ai::tests storage::tests`** and verify failures are caused by the missing transport behavior.
- [ ] **Step 3: Implement the minimum native transport** using a fixed system prompt selected by request kind, JSON fact payload, optional `Authorization`, four/thirty-second timeout, and response content extraction.
- [ ] **Step 4: Add the `generate_ai_explanation` Tauri command** that loads model settings from SQLite and the optional credential from Keychain.
- [ ] **Step 5: Write failing TypeScript repository tests** for the new settings field and generation method.
- [ ] **Step 6: Implement repository bindings and preview fallback**, then run the focused Rust and TypeScript tests until green.
- [ ] **Step 7: Commit transport changes** with `feat: add guarded local model transport`.

### Task 2: Versioned Facts and Model-Output Guard

**Files:**
- Create: `src/ai/types.ts`
- Create: `src/ai/liveFacts.ts`
- Create: `src/ai/reviewFacts.ts`
- Create: `src/ai/parseModelOutput.ts`
- Test: `src/ai/liveFacts.test.ts`
- Test: `src/ai/reviewFacts.test.ts`
- Test: `src/ai/parseModelOutput.test.ts`

**Interfaces:**
- Produces: `buildAiLiveFacts(game, insight): AiLiveFactPackV1`.
- Produces: `buildAiReviewFacts(game, review): AiReviewFactPackV1`.
- Produces: `parseAiLiveOutput(raw, facts): AiLiveExplanation`.
- Produces: `parseAiReviewOutput(raw, facts): AiHandReview`.
- Both fact packs expose `allowedNumbers`, `recommendation`, and `stateHash`; model output cannot replace these fields.

- [ ] **Step 1: Write failing fact-pack tests** for `J2 + A44` private contribution, `99 + 932` trips, button position, local bet fraction, opponent bucket probabilities, and recommendation preservation.
- [ ] **Step 2: Run the focused tests** and verify the builders do not exist.
- [ ] **Step 3: Implement minimal versioned fact builders** using existing evaluator, insight, range, and deep-review outputs; precompute all display ratios locally.
- [ ] **Step 4: Write failing parser tests** for clean JSON, fenced JSON, malformed JSON, invented numeric claims, changed recommendation, exact hidden cards, oversized text, and stale state hash.
- [ ] **Step 5: Implement strict parsers** that validate shape, length, recommendation identity, state hash, and numeric-token allowlists; reject the full output on any conflict.
- [ ] **Step 6: Run all AI fact/parser tests** and existing evaluator/insight/review tests.
- [ ] **Step 7: Commit fact and guard changes** with `feat: add auditable AI coaching facts`.

### Task 3: Live Asynchronous AI Coach

**Files:**
- Create: `src/ai/useAiLiveCoach.ts`
- Create: `src/components/AiLiveCoach.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/PreActionInsights.tsx`
- Modify: `src/styles/desktop.css`
- Test: `src/ai/useAiLiveCoach.test.tsx`
- Test: `src/components/PreActionInsights.test.tsx`
- Test: `src/App.interaction.test.tsx`

**Interfaces:**
- Consumes: `DesktopRepository.generateAiExplanation`, `buildAiLiveFacts`, and `parseAiLiveOutput`.
- Produces: `AiLiveCoachState = idle | loading | ready | unavailable | rejected` keyed by local state hash.
- Produces: `AiLiveCoach` UI that becomes the primary prose explanation only when `ready`.

- [ ] **Step 1: Write failing hook tests** proving disabled AI makes no request, controls remain available during loading, duplicate state hashes make one request, stale responses are ignored, and failure preserves local insight.
- [ ] **Step 2: Run the hook tests** and verify missing behavior failures.
- [ ] **Step 3: Implement the hook** with cancellation identity, four-second deadline, per-state cache, and silent local fallback.
- [ ] **Step 4: Write failing component tests** for loading status, successful AI explanation, local fact strip, and rejected-output fallback.
- [ ] **Step 5: Implement the live coach component** so local current hand/ranges/recommendation remain visible and AI supplies the primary explanatory prose.
- [ ] **Step 6: Integrate into `App.tsx` without changing action controls**, then run focused interaction tests.
- [ ] **Step 7: Commit live-coach integration** with `feat: add asynchronous live AI coach`.

### Task 4: Completed-Hand AI Review

**Files:**
- Create: `src/ai/useAiHandReview.ts`
- Modify: `src/review/types.ts`
- Modify: `src/game/game.ts`
- Modify: `src/components/DeepHandReview.tsx`
- Modify: `src/App.tsx`
- Modify: `src/data/exportDocument.ts`
- Test: `src/ai/useAiHandReview.test.tsx`
- Test: `src/components/DeepHandReview.test.tsx`
- Test: `src/data/repository.test.ts`
- Test: `src/data/exportDocument.test.ts`

**Interfaces:**
- Consumes: completed local `DeepHandReview` facts.
- Produces: persisted `AiHandReview { version, model, factsVersion, stateHash, summary, streets, turningPoint, keyLesson }`.
- Produces: `aiReviewStatus = not-started | calculating | completed | failed` without storing credentials or raw HTTP payloads.

- [ ] **Step 1: Write failing hook tests** proving one request per completed hand, no request before local facts, thirty-second timeout, retry after explicit user action, stale-result rejection, and fallback to local review.
- [ ] **Step 2: Run hook tests** and verify the expected failures.
- [ ] **Step 3: Implement the review hook and persisted types** with state-hash ownership and guarded parsing.
- [ ] **Step 4: Write failing view tests** proving a valid AI review replaces repetitive local prose while local numeric evidence remains available, and a failed AI review shows the local review.
- [ ] **Step 5: Implement the review presentation** with one summary, only streets that had decisions, one turning point, and one actionable lesson.
- [ ] **Step 6: Verify persistence/export contains reviewed prose and model metadata but no key, authorization header, request, or raw response.**
- [ ] **Step 7: Commit review integration** with `feat: add guarded AI whole-hand review`.

### Task 5: Settings and Connection Experience

**Files:**
- Modify: `src/components/SettingsPage.tsx`
- Modify: `src/components/SettingsPage.test.tsx`
- Modify: `src/data/memoryRepository.ts`
- Modify: `src-tauri/src/storage.rs`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ModelSettings.enabled` and optional Keychain status.
- Produces: explicit AI enable switch, full-endpoint/root-URL help, optional-key copy, and verified-model status.

- [ ] **Step 1: Write failing settings tests** for enable/disable, the verified Qwen defaults, optional API Key, save callbacks, and connection success without a key.
- [ ] **Step 2: Run tests** and verify the current mandatory-key UI/transport fails them.
- [ ] **Step 3: Implement settings controls and copy** while keeping mobile model settings hidden until a native/mobile transport exists.
- [ ] **Step 4: Add README instructions** for the verified endpoint, LAN binding, fallback behavior, and fact authority.
- [ ] **Step 5: Run focused UI, storage, and security tests.**
- [ ] **Step 6: Commit settings changes** with `feat: expose optional local AI coaching`.

### Task 6: Real-Service Contract and Regression Verification

**Files:**
- Create: `scripts/verify-local-ai.mjs`
- Modify: `package.json`
- Test: `scripts/verify-local-ai.mjs` against `192.168.120.86:8081`.

**Interfaces:**
- Produces: `npm run verify:local-ai`, a non-secret opt-in real-service contract check.

- [ ] **Step 1: Write the verifier contract** to test model identity, JSON mode, trips recognition, public-pair/private-air distinction, exact recommendation preservation, and whole-hand review structure.
- [ ] **Step 2: Run the verifier against the real endpoint** and capture latency and any rejected answer without recording raw private credentials.
- [ ] **Step 3: Adjust only fact schemas/guards, not poker recommendations**, until the real endpoint passes the contract.
- [ ] **Step 4: Run `npm test`, `npm run lint`, `npm run test:performance`, Rust tests, mobile-bundle verification, desktop-data verification, and the 10,000-hand V4 audit.**
- [ ] **Step 5: Commit the contract verifier** with `test: verify local Qwen coaching contract`.

### Task 7: Version, Package, and Publish

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `README.md`
- Produce: `release/public/Old-Heroes-Poker-Trainer-v1.6.0-macOS-Apple-Silicon.dmg`
- Produce: `release/public/Old-Heroes-Poker-Trainer-v1.6.0-Mobile-PWA.zip`
- Modify: `release/public/SHA256SUMS.txt`

**Interfaces:**
- Produces: version `1.6.0`, keeping AI optional and desktop-only while the mobile PWA remains fully local.

- [ ] **Step 1: Bump every application version to 1.6.0** and update release notes.
- [ ] **Step 2: Run the complete verification suite again from the versioned source.**
- [ ] **Step 3: Build the Tauri application and mobile PWA**, verify code signature, DMG checksum, ZIP integrity, bundle privacy, and SHA-256 manifest.
- [ ] **Step 4: Commit the release** with `release: ship optional local AI coaching`.
- [ ] **Step 5: Push the public project branch and `v1.6.0` tag** without committing the user's unrelated UI documents.

