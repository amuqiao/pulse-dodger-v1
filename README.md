# Phaser CrazyGames Template

一个面向海外 H5 平台的 **Phaser 3 + TypeScript + Vite + CrazyGames HTML5 SDK v3** 脚手架。

它借鉴了两类项目：

- `template-vite-ts`：保留 Vite、TypeScript、Phaser 场景链和相对路径构建。
- `pulse-dodger`：保留 CrazyGames `PlatformAdapter`、提交包检查、Portal 上传目录、QA 文档和纯规则测试。

它不包含某一款游戏的具体玩法资产，默认 demo 只用于证明工程链路能跑通。替换模板玩法、模板 UI 文案、商店素材和元数据前，不要提交到公开审核。

## First Principles

```text
模板真正要复用的不是玩法
而是开发到上架的稳定骨架：

browser bootstrap
-> platform adapter
-> Phaser scenes
-> pure game rules
-> build checks
-> portal upload folder
-> submission checklist
```

## Prerequisites

```bash
node -v   # >= 24.12.0
npm -v    # >= 11 and < 12
```

This project has `engine-strict=true`; unsupported Node/npm versions fail during install.

## Commands

```bash
npm ci
npm run dev
npm run build
npm run portal:upload
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server on `http://localhost:8080`. |
| `npm run preview` | Preview the production build on `http://localhost:8081`. |
| `npm run test` | Run pure TypeScript and script tests with Node. |
| `npm run check:boundaries` | Enforce architecture boundaries. |
| `npm run build` | Boundary check, tests, typecheck, production build. |
| `npm run check:size` | Check CrazyGames file count, total size, conservative initial download, relative paths, external URLs. |
| `npm run portal:upload` | Build a Basic Launch upload folder with ads disabled. |
| `npm run portal:upload:full` | Build a Full Launch upload folder with CrazyGames ads enabled. Use only after real ad UX is implemented and tested. |
| `npm run archive:offline` | Build and create an offline zip archive under `submissions/archives/`. |
| `npm run package` | Alias for `npm run archive:offline`; do not upload this zip to the Portal unless the Portal explicitly asks for an archive. |

## Use This Template For A New Game

Keep this repository as the reusable template. Create every real game in its own repository:

```text
phaser-crazygames-template
= reusable engineering template

pulse-dodger-v1
= one real game copied from the template
```

For an empty GitHub repository such as `git@github.com:amuqiao/pulse-dodger-v1.git`, run:

```bash
cd /Users/admin/Code/Game

git clone git@github.com:amuqiao/pulse-dodger-v1.git

rsync -av \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='submissions' \
  phaser-crazygames-template/ \
  pulse-dodger-v1/

cd pulse-dodger-v1

npm pkg set name="pulse-dodger-v1" description="Pulse Dodger v1"
npm install --package-lock-only
npm ci
npm run build
npm run portal:upload
```

Then make the first game-specific changes in the copied game repository:

```text
package.json              package name and description
src/game/theme.ts         game title, English copy, colors
src/game/keys.ts          storage keys, unique per game
src/game/core/RunState.ts pure gameplay rules
src/game/scenes/PlayScene.ts actual Phaser gameplay
materials/metadata.md     CrazyGames submission metadata
materials/screenshots/    final screenshots
materials/covers/         final covers
materials/videos/         preview videos
```

Upload the files inside `submissions/portal-upload/` to CrazyGames. Do not upload `submissions/archives/*.zip` unless the Portal explicitly asks for an archive.

## Directory Map

```text
src/main.ts              Browser bootstrap: platform init, input guards, loading overlay.
src/dom/                 DOM outside the Phaser canvas.
src/platform/            CrazyGames/Web adapters. Game code never touches window.CrazyGames.
src/game/main.ts         Phaser config and scene order.
src/game/core/           Pure rules. No Phaser, no browser, no SDK.
src/game/scenes/         Phaser scene orchestration.
src/game/ui/             Reusable Phaser UI helpers.
src/game/effects/        Audio/feel helpers.
scripts/                 Build, package, upload-folder and boundary checks.
docs/                    QA and submission runbooks.
materials/metadata.md    Store metadata draft. Replace all TODO fields before submission.
materials/screenshots/   Final gameplay screenshots for Portal upload.
materials/covers/        Final landscape, portrait, and square covers.
materials/videos/        Final landscape and portrait preview videos.
style.css                Page shell styles outside the Phaser canvas.
```

## CrazyGames Mode

Basic Launch upload:

```bash
npm run portal:upload
```

```text
npm run portal:upload
-> sets VITE_ENABLE_CRAZYGAMES_ADS=false internally
-> ad capabilities are false
-> requestAd and banner calls are not triggered
```

Full Launch / ads verification upload:

```bash
npm run portal:upload:full
```

Only use the Full Launch command after you have implemented and tested the real ad UX: visible trigger points, gameplay pause during ads, no-effect buttons removed in Basic Launch, `adError` recovery, AdBlock behavior, and audio resume. The `portal:upload:full` script sets `VITE_ENABLE_CRAZYGAMES_ADS=true` internally so it works across macOS, Linux, and Windows. `npm run portal:upload` sets `VITE_ENABLE_CRAZYGAMES_ADS=false` internally and rebuilds with ads disabled.

The template loads CrazyGames SDK v3 in `index.html`. The adapter only accepts SDK environments `local` and `crazygames`. For phone LAN testing with an address like `http://192.168.x.x:8080`, append `?useLocalSdk=true`; otherwise the SDK may report `disabled` and the template will stop with a clear error.

The default demo persists one progress record containing `bestScore` and `runsPlayed` through the platform adapter, and bootstrap performs a storage self-check. If you submit this flow to CrazyGames, select `Save progress: Yes, using the Data Module from the CrazyGames SDK`. If your real game does not save progress, remove `platform().save/load` usage and `assertScorePersistenceAvailable()` first, then select `No`.

## How To Create A New Game From This Template

1. Rename package and storage keys.
2. Replace `THEME.text` with your game title and English copy.
3. Replace the template menu copy in `MenuScene`.
4. Replace `RunState` with your game rules while keeping it pure TypeScript.
5. Replace `PlayScene` with your own Phaser objects and input flow.
6. Keep `src/platform/` unless the target platform changes.
7. Update `materials/metadata.md` and final assets under `materials/`.
8. Run `npm run portal:upload` for Basic Launch, or `npm run portal:upload:full` only for Full Launch ad verification.
9. Upload files inside `submissions/portal-upload/` to CrazyGames.

## Submission Docs

- `docs/architecture.md`: why the layers exist.
- `docs/qa-checklist.md`: checks before upload.
- `docs/crazygames-submit-checklist.md`: Developer Portal flow.
- `docs/asset-license.csv`: asset license record.
- `docs/submission-log.csv`: submission trace log.

## Boundary

This is a starter template, not a monetization guarantee. CrazyGames Basic Launch, QA, public visibility, Full Launch, traffic, and revenue remain platform decisions.
