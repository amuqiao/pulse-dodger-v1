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
