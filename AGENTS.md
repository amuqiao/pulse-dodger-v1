# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-23

## OVERVIEW

Project: **Pulse Dodger**

Stack: **TypeScript** + **Phaser 3.90.0** + **Vite 6** + **Node.js test runner**，面向 **CrazyGames HTML5 SDK v3** 的 H5 躲避游戏。项目使用 `npm@11`、`node>=24.12.0`，并启用 `engine-strict`。

## STRUCTURE

```text
src/main.ts              浏览器启动入口：平台初始化、输入保护、加载遮罩
src/dom/                 Phaser canvas 外层 DOM
src/platform/            CrazyGames/Web 平台适配层；游戏代码不直接碰 SDK global
src/game/main.ts         Phaser 配置和 scene 顺序
src/game/core/           纯规则层：计分、充能、难度、广告节奏、生成预算
src/game/scenes/         Boot/Menu/Play/Result/Settings scenes 与转场
src/game/objects/        玩家、危险物、能量点、背景等 Phaser 对象
src/game/hud/            HUD、combo、充能环、时间线和教学提示
src/game/overlays/       暂停与复活流程
src/game/effects/        音效、粒子、震屏、hitstop 等表现层
src/game/ui/             Phaser UI 控件
scripts/                 构建、边界检查、打包和上传目录生成脚本
tests/                   Node test runner 单元测试
docs/                    架构、QA、CrazyGames 提交流程和素材授权文档
vite/                    dev/prod Vite 配置
materials/               商店元数据、截图、封面和视频素材
submissions/             Portal 上传产物目录
```

## COMMANDS

| Action | Command |
|--------|---------|
| Install | `npm ci` |
| Run dev server | `npm run dev` |
| Dev status | `npm run dev:status` |
| Stop dev server | `npm run dev:stop` |
| Test | `npm run test` |
| Typecheck | `npm run typecheck` |
| Boundary check | `npm run check:boundaries` |
| Build | `npm run build` |
| Size/package check | `npm run check:size` |
| Basic Launch upload folder | `npm run portal:upload` |
| Full Launch ads upload folder | `npm run portal:upload:full` |
| Offline archive | `npm run archive:offline` |

`npm run build` 顺序执行：`check:boundaries -> test -> tsc --noEmit -> vite build`。

## CODING STANDARDS

- **Language:** TypeScript 严格模式；`tsconfig.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`、`isolatedModules`、`moduleResolution: bundler`。
- **Imports:** 源码使用显式 `.ts` 相对导入风格；类型导入用 `import type`。
- **Architecture boundaries:** 以 `scripts/check-boundaries.mjs` 为准：
  - 只有 `src/game/**` 可 import `phaser`。
  - `src/game/core` 只导入 core 同级模块以及 `../tuning.ts` / `../viewport.ts`。
  - `src/game/effects` 不导入 `game/core`。
  - `src/platform` 不导入 `game`。
- **Platform boundary:** 游戏代码通过 `src/platform` 的 adapter 使用平台能力，不直接调用 `window.CrazyGames.SDK`。
- **Composition:** `src/game/composition.ts` 是生产依赖组装点；scene 层使用导出的 `scores`，不要自行 new platform repository。
- **Error handling:** 不要静默吞错或把异常数据当默认值；例如存档字段格式非法时应抛错，未存过才使用领域默认值。

## WHERE TO LOOK

- **Architecture:** `docs/architecture.md`、`scripts/check-boundaries.mjs`
- **Game bootstrap:** `src/main.ts`、`src/game/main.ts`
- **Pure game rules:** `src/game/core/`
- **Runtime scenes:** `src/game/scenes/`
- **Platform adapters:** `src/platform/`
- **Tests:** `tests/*.test.ts`、`tests/*.test.mjs`
- **CrazyGames submission:** `docs/crazygames-submit-checklist.md`、`docs/qa-checklist.md`、`scripts/prepare-portal-upload-*.mjs`
- **Harness:** `.pi/teams/joee/`

## NOTES

- 本地 dev server 必须通过 `scripts/run.sh` 包装命令管理；端口固定 `127.0.0.1:8080`，不得自动漂移到 8081。
- `.run/` 是本地运行态目录，不得提交。
- `npm run dev:raw` 只用于排查服务管理脚本本身，不作为日常启动入口。
- Basic Launch 使用 `VITE_ENABLE_CRAZYGAMES_ADS=false`；Full Launch / 广告验证使用 `VITE_ENABLE_CRAZYGAMES_ADS=true`。
- 真实上传、部署、commit、push 或历史改写必须由用户明确要求。

## Git 规则

- 提交必须保持单一意图，不混入无关改动；跨主题改动应拆分提交。
- 提交前确认改动范围、提交主题、入口文档或规则文件同步情况。
- 提交前完成最小必要验证；无法验证时说明原因和剩余风险。
- 提交信息默认使用中文；无仓库规范时优先使用 Conventional Commits，例如 `docs:`、`feat:`、`fix:`、`refactor:`、`chore:`。
- 提交信息优先写“改了什么”和对象，不写空泛标题。
- 只在用户明确要求时提交；非明确要求下不做 `amend`，不改写历史。

## 本地服务管理

### 核心原则

- 本项目本地服务必须通过 `scripts/run.sh` 统一管理，避免重复启动、端口漂移和遗留进程。
- 新增本地服务时，必须同步更新 `scripts/run.sh`、README 和本节命令表。
- 任务结束前必须确认无关 dev server 已关闭；需要保留服务时必须明确告知用户服务地址、PID 和关闭命令。
- `AGENTS.md` 只记录 agent 必须遵守的操作纪律；脚本实现细节、排障说明和完整使用说明放在 README 或 `scripts/` 内。

### 当前服务

| 服务 | 地址 | 运行态 |
| --- | --- | --- |
| `dev` | `http://127.0.0.1:8080` | `.run/dev.pid`、`.run/dev.log`、`.run/dev.port` |

开发服务端口固定为 `127.0.0.1:8080`；不得自动切到 8081 或其他端口，除非用户明确要求。

### 当前命令

| 场景 | 首选命令 | 等价脚本 |
| --- | --- | --- |
| 启动 `dev` | `npm run dev` | `./scripts/run.sh up dev` |
| 查看 `dev` 状态 | `npm run dev:status` | `./scripts/run.sh status dev` |
| 关闭 `dev` | `npm run dev:stop` | `./scripts/run.sh down dev` |
| 重启 `dev` | `npm run dev:restart` | `./scripts/run.sh restart dev` |
| 查看 `dev` 日志 | `npm run dev:logs` | `./scripts/run.sh logs dev` |

### 运行态目录

- `.run/` 是本项目运行态目录，不得提交。
- 运行态文件只记录本地进程状态、端口和日志，不承载业务配置。

### 禁止事项

- 不要直接后台运行 Vite、Node server 或其他本地服务。
- 不要绕过 `scripts/run.sh` 自行维护 PID、日志或端口。
- `npm run dev:raw` 只用于排查服务管理脚本本身，不作为日常启动入口。

## Harness: Joee Supervisor

**目标:** 为 Pulse Dodger 的代码、测试、文档、构建和 CrazyGames 提交流程任务提供项目级 Supervisor 编排入口。

**触发:** 需要多 agent / supervisor / harness 工作流时使用 `./.pi/teams/joee/prompts/joee.md`（注册后为 `/joee`）。单纯问答或小范围明确修改可直接处理。

**变更历史:**
| 日期 | 变更内容 | 对象 | 事由 |
|------|----------|------|------|
| 2026-09-23 | 初始配置 Joee Supervisor harness | `.pi/teams/joee/` | 用户要求构建 supervisor architecture harness |
