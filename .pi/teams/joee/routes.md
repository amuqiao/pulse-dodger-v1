# Joee Supervisor Routes

本文件是 `/joee` 的高频路由参考，不是完整 agent 清单。完整角色位于：

```text
~/.pi/agent/agents/*.md
```

## 项目上下文

- 项目：Pulse Dodger，Phaser 3 + TypeScript + Vite H5 游戏。
- 平台：CrazyGames HTML5 SDK v3，经 `src/platform` 适配，游戏层不直接访问 `window.CrazyGames`。
- 架构边界：以 `npm run check:boundaries` 和 `docs/architecture.md` 为准。
- 本地服务：必须通过 `npm run dev` / `npm run dev:stop` 等 `scripts/run.sh` 包装命令管理，端口固定 `127.0.0.1:8080`。

## 规划 / 探索

| 场景 | 首选 agents | 说明 |
|---|---|---|
| 代码入口、调用链、模块边界 | `code-mapper`, `context-manager` | read-only；要求给出文件路径和证据 |
| 架构边界、分层、依赖规则 | `architect-reviewer`, `code-mapper` | 重点核对 `src/game/core`, `src/platform`, Phaser 依赖边界 |
| 游戏规则、难度、计分、广告节奏 | `typescript-pro`, `javascript-pro`, `code-mapper` | 先读取测试和 `src/game/core/**` |
| CrazyGames / Portal / 提交文档 | `docs-researcher`, `search-specialist`, `build-engineer` | 外部行为核验时用 docs/search；本地脚本风险用 build-engineer |
| 任务拆分、跨模块计划 | `task-distributor`, `agent-organizer`, `workflow-orchestrator` | 仅在 substantial 任务使用；不要为了选 agent 递归委派 |

## 实现

| 场景 | 首选 agents | 说明 |
|---|---|---|
| TypeScript 规则层 / 单元测试 | `typescript-pro`, `javascript-pro` | 可输出 patch plan；边界清晰时才授权编辑 |
| Phaser 场景、对象、HUD、输入 | `frontend-developer`, `typescript-pro`, `javascript-pro` | 注意表现层不得污染纯规则层 |
| Vite / Node 脚本 / 打包 | `node-specialist`, `build-engineer`, `javascript-pro` | 修改脚本后优先跑 targeted script 或 build |
| 文档、QA 清单、提交材料 | `documentation-engineer`, `docs-researcher` | 文档真实性优先，避免写不存在的行为 |
| 重构、依赖边界、体积/性能 | `refactoring-specialist`, `performance-engineer`, `build-engineer` | 不做无关重构或依赖升级 |

## 审查 / 风险

Review 阶段默认使用 read-only agents；如果某 agent 的实际 `tools` 包含写权限，则 task 中仍要求只读并禁止改文件。

| 风险维度 | 首选 agents | 检查重点 |
|---|---|---|
| 综合代码质量 | `code-reviewer`, `reviewer` | bug、边界、可维护性 |
| 正确性 / 回归 | `debugger`, `error-detective`, `qa-expert` | 复现路径、测试覆盖、边界条件 |
| 架构边界 | `architect-reviewer`, `code-mapper` | Phaser/platform/core 依赖边界 |
| 构建 / 发布 | `build-engineer`, `deployment-engineer` | Vite build、上传包、文件体积、外部 URL |
| 性能 / 游戏体验 | `performance-engineer`, `frontend-developer` | 帧率风险、对象分配、输入响应 |
| UI/UX / 可访问性 | `ui-ux-tester`, `accessibility-tester`, `anti-ui-slop-reviewer` | HUD 可读性、移动端交互、视觉噪声 |
| 文档真实性 | `docs-researcher`, `content-quality-editor` | README/docs 与代码和脚本一致 |

## 委派规则

1. 先判断任务真实领域和产出类型，再匹配 agent；不要只按关键词路由。
2. 每个 subagent task 必须包含：角色、目标、项目根/目标 `cwd`、范围、允许修改路径、禁止事项、验证期望、输出格式。
3. read-only 探索和 review 可并行；`parallel` 每次最多 8 个 task，运行时最多 4 个并发。
4. 修改边界不清、潜在冲突无法判断，或需要保留单一落地点时，让 subagents 只产出 plan / patch 建议，由主 agent 收口。
5. 严禁多个 subagents 同时编辑同一文件；默认主 agent 负责最终 edit/write。
6. 派发给 subagent 的 task 开头必须写明：用户已授权本次 Joee Supervisor 委派，不要再次询问工作流选择。
7. 使用 `agentScope: "both"` 前完成 trust preflight；project agent discovery 基于主会话 `ctx.cwd` 最近的 `.pi/agents/`，不是 task `cwd`。
