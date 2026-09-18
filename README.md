# Pulse Dodger

一款用 **Phaser 3 + TypeScript + Vite** 实现、接入 **CrazyGames HTML5 SDK v3** 的 H5 躲避小游戏。

当前仓库已经不是空脚手架：游戏主体参考 `pulse-dodger` 实现，保留了本仓库原有的构建、Portal 上传、体积检查和 QA 文档骨架。

## 先理解这个项目

玩家控制发光球移动，躲开红色碎片，收集蓝色能量点。充能满后点击或按 `Space` 释放冲击波清场；贴近碎片但不碰撞会触发 `graze` 奖励，连续收集能量点会提高 combo 倍率。

工程边界如下：

```text
browser bootstrap
-> platform adapter
-> Phaser scenes
-> objects / hud / overlays / effects
-> pure game rules
-> build checks
-> portal upload folder
```

`src/game/core` 是纯规则层，不依赖 Phaser、DOM 或 CrazyGames SDK；平台能力只通过 `src/platform` 暴露给游戏。

## 环境要求

```bash
node -v   # >= 24.12.0
npm -v    # >= 11 and < 12
```

项目开启了 `engine-strict=true`。如果 Node.js 或 npm 版本不符合要求，`npm ci` 会直接失败。

## 跑起来

```bash
npm ci
npm run dev
```

开发服务器默认地址是 `http://127.0.0.1:8080`。`npm run dev` 通过
`scripts/run.sh` 受管启动，PID、端口和日志写在 `.run/`：

```text
.run/dev.pid
.run/dev.port
.run/dev.log
```

关闭开发服务器：

```bash
npm run dev:stop
```

## 常用命令

| 命令 | 什么时候用 | 作用 |
| --- | --- | --- |
| `npm ci` | 第一次拉项目、换机器、依赖变更后 | 按 `package-lock.json` 安装依赖。 |
| `npm run dev` | 日常开发 | 受管启动 Vite 开发服务器，固定 `127.0.0.1:8080`，端口占用时直接失败。 |
| `npm run dev:status` | 不确定服务是否已启动时 | 查看 `.run/dev.pid`、`.run/dev.port` 和服务状态。 |
| `npm run dev:stop` | 停止本地游戏服务时 | 只停止 `.run/dev.pid` 记录的本项目 Vite 进程。 |
| `npm run dev:restart` | 本地服务状态不干净时 | 先停止再启动本项目 Vite 服务。 |
| `npm run dev:logs` | 启动失败或排查 HMR 时 | 跟随查看 `.run/dev.log`。 |
| `npm run dev:raw` | 排查脚本本身时 | 前台直接运行 Vite，同样固定 8080 且不自动换端口。 |
| `npm run test` | 修改规则、生成节奏或脚本后 | 运行 Node 测试。 |
| `npm run typecheck` | 改 TypeScript 后 | 只做类型检查，不产出文件。 |
| `npm run check:boundaries` | 修改目录依赖后 | 检查架构边界。 |
| `npm run build` | 提交前、上传前 | 依次运行边界检查、测试、类型检查和生产构建。 |
| `npm run preview` | 上传前人工验收 | 预览生产构建结果，默认地址是 `http://localhost:8081`。 |
| `npm run portal:upload` | CrazyGames Basic Launch 上传前 | 构建广告关闭版本，并生成 `submissions/portal-upload/`。 |
| `npm run portal:upload:full` | CrazyGames Full Launch 广告验证前 | 构建广告开启版本；只有真实广告 UX 已测过后再用。 |
| `npm run check:size` | 单独检查上传包风险时 | 检查文件数、体积、相对路径和外部 URL。 |
| `npm run archive:offline` | 需要本地离线归档时 | 构建并生成离线 zip。 |

## 目录结构

```text
src/main.ts              浏览器启动入口：平台初始化、输入保护、加载遮罩。
src/dom/                 Phaser canvas 外层的 DOM。
src/platform/            CrazyGames/Web 平台适配层；游戏代码不直接碰 window.CrazyGames。
src/game/main.ts         Phaser 配置和场景顺序。
src/game/core/           纯游戏规则：计分、充能、难度、广告节奏、对象池预算。
src/game/scenes/         Boot/Menu/Play/Result/Settings 场景与转场。
src/game/objects/        玩家控制、危险物、能量点、背景。
src/game/hud/            分数、combo、充能环、时间线、教学提示。
src/game/overlays/       暂停和复活流程。
src/game/effects/        音效、粒子、震屏、hitstop 等表现层。
src/game/ui/             Phaser UI 控件。
scripts/                 构建、打包、上传目录生成和边界检查脚本。
docs/                    QA、提交和架构说明。
materials/               商店元数据、截图、封面和视频素材。
style.css                Phaser canvas 外层页面样式。
```

## CrazyGames 模式

Basic Launch 上传包：

```bash
npm run portal:upload
```

该命令会设置 `VITE_ENABLE_CRAZYGAMES_ADS=false`，广告能力位为 false，不请求插屏、激励视频或 banner。

Full Launch / 广告验证上传包：

```bash
npm run portal:upload:full
```

该命令会设置 `VITE_ENABLE_CRAZYGAMES_ADS=true`。使用前至少确认：广告播放时游戏暂停并静音，`adError` 能恢复，激励视频只有 `adFinished` 后才复活，广告后音频能恢复。

## 验证门禁

`npm run build` 会依次执行：

```text
check:boundaries -> test -> tsc --noEmit -> vite build
```

边界检查覆盖：

```text
Only src/game/** may import phaser
game/core only imports game/core and tuning/viewport
game/effects must not import game/core
platform must not import game
```

## 提交相关文档

- [`docs/architecture.md`](./docs/architecture.md): 分层设计说明。
- [`docs/qa-checklist.md`](./docs/qa-checklist.md): 上传前 QA 检查清单。
- [`docs/crazygames-submit-checklist.md`](./docs/crazygames-submit-checklist.md): CrazyGames Developer Portal 提交流程。
- [`docs/asset-license.csv`](./docs/asset-license.csv): 素材授权记录。
- [`docs/submission-log.csv`](./docs/submission-log.csv): 提交记录。
