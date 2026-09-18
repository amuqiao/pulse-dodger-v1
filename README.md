# Phaser CrazyGames Template

一个面向海外 H5 平台的 **Phaser 3 + TypeScript + Vite + CrazyGames HTML5 SDK v3** 脚手架。

它借鉴了两类项目：

- `template-vite-ts`：保留 Vite、TypeScript、Phaser 场景链和相对路径构建。
- `pulse-dodger`：保留 CrazyGames `PlatformAdapter`、提交包检查、Portal 上传目录、QA 文档和纯规则测试。

它不包含某一款游戏的具体玩法资产，默认 demo 只用于证明工程链路能跑通。替换模板玩法、模板 UI 文案、商店素材和元数据前，不要提交到公开审核。

## 先理解这个脚手架

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

这个仓库适合当作“工程骨架”反复复制。具体游戏应该在新的游戏仓库里开发，不要直接在模板仓库里做真实上架项目。

## 环境要求

```bash
node -v   # >= 24.12.0
npm -v    # >= 11 and < 12
```

项目开启了 `engine-strict=true`。如果 Node.js 或 npm 版本不符合要求，`npm ci` 会直接失败，这是为了避免不同机器构建结果不一致。

## 常用命令

```bash
npm ci
npm run dev
npm run build
npm run preview
npm run portal:upload
npm run portal:upload:full
npm run check:size
```

推荐日常顺序：

```text
npm ci
-> npm run dev
-> npm run build
-> npm run preview
-> npm run portal:upload
-> upload submissions/portal-upload/ files to CrazyGames
```

| 命令 | 什么时候用 | 作用 |
| --- | --- | --- |
| `npm ci` | 第一次拉项目、换机器、依赖变更后 | 按 `package-lock.json` 安装依赖。 |
| `npm run dev` | 日常开发 | 启动 Vite 开发服务器，默认地址是 `http://localhost:8080`。 |
| `npm run build` | 提交前、上传前 | 依次运行边界检查、测试、TypeScript 类型检查和生产构建。 |
| `npm run preview` | 上传前人工验收 | 预览生产构建结果，默认地址是 `http://localhost:8081`。 |
| `npm run portal:upload` | CrazyGames Basic Launch 上传前 | 构建广告关闭版本，并生成 `submissions/portal-upload/`。 |
| `npm run portal:upload:full` | CrazyGames Full Launch 广告验证前 | 构建广告开启版本；只有真实广告 UX 已实现并测过后再用。 |
| `npm run check:size` | 想单独检查上传包风险时 | 检查文件数、总体积、初始下载体积、相对路径和外部 URL。 |
| `npm run test` | 修改纯规则或脚本后 | 运行 Node 测试。 |
| `npm run check:boundaries` | 修改目录依赖关系后 | 检查架构边界，例如 `src/game/core` 不能依赖 Phaser 或浏览器 API。 |
| `npm run archive:offline` | 需要本地离线归档时 | 构建并生成 `submissions/archives/` 下的 zip。 |
| `npm run package` | 同 `archive:offline` | 只是 `npm run archive:offline` 的别名。不要把这个 zip 上传到 Portal，除非 Portal 明确要求。 |

## 目录结构

```text
src/main.ts              浏览器启动入口：平台初始化、输入保护、加载遮罩。
src/dom/                 Phaser canvas 外层的 DOM。
src/platform/            CrazyGames/Web 平台适配层；游戏代码不直接碰 window.CrazyGames。
src/game/main.ts         Phaser 配置和场景顺序。
src/game/core/           纯游戏规则；不依赖 Phaser、浏览器和 SDK。
src/game/scenes/         Phaser 场景编排。
src/game/ui/             可复用的 Phaser UI 帮助函数。
src/game/effects/        音效和手感相关帮助函数。
scripts/                 构建、打包、上传目录生成和边界检查脚本。
docs/                    QA、提交和架构说明。
materials/metadata.md    商店元数据草稿；提交前替换所有 TODO。
materials/screenshots/   Portal 上传用的最终截图。
materials/covers/        横版、竖版、方形 cover。
materials/videos/        横版和竖版 preview video。
style.css                Phaser canvas 外层页面样式。
```

## CrazyGames 模式

Basic Launch 上传包：

```bash
npm run portal:upload
```

```text
npm run portal:upload
-> sets VITE_ENABLE_CRAZYGAMES_ADS=false internally
-> ad capabilities are false
-> requestAd and banner calls are not triggered
```

Full Launch / 广告验证上传包：

```bash
npm run portal:upload:full
```

只有在真实广告 UX 已经实现并测试后，才使用 Full Launch 命令。至少要确认：广告触发点可见、广告播放时游戏会暂停、Basic Launch 中没有无效广告按钮、`adError` 能恢复、AdBlock 场景可接受、广告后音频能恢复。

`portal:upload:full` 会在内部设置 `VITE_ENABLE_CRAZYGAMES_ADS=true`，可跨 macOS、Linux、Windows 使用。`portal:upload` 会在内部设置 `VITE_ENABLE_CRAZYGAMES_ADS=false`，并重新构建广告关闭版本。

模板会在 `index.html` 加载 CrazyGames SDK v3。平台适配层只接受 `local` 和 `crazygames` 两种 SDK environment。手机局域网测试时，如果地址类似 `http://192.168.x.x:8080`，需要追加 `?useLocalSdk=true`；否则 SDK 可能返回 `disabled`，模板会用明确错误停止。

默认 demo 会通过平台适配层保存一个 progress record，里面包含 `bestScore` 和 `runsPlayed`，启动时会做 storage self-check。提交这个默认流程到 CrazyGames 时，进度保存选项应选择 `Save progress: Yes, using the Data Module from the CrazyGames SDK`。如果你的真实游戏不需要保存进度，先移除 `platform().save/load` 和 `assertScorePersistenceAvailable()`，再选择 `No`。

## 提交相关文档

- `docs/architecture.md`: 分层设计说明。
- `docs/qa-checklist.md`: 上传前 QA 检查清单。
- `docs/crazygames-submit-checklist.md`: CrazyGames Developer Portal 提交流程。
- `docs/asset-license.csv`: 素材授权记录。
- `docs/submission-log.csv`: 提交记录。

## 边界

这是一个 starter template，不是变现保证。CrazyGames Basic Launch、QA、公开可见性、Full Launch、流量和收益，都由平台规则和平台分发决定。
