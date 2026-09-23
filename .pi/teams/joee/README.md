# Joee Supervisor Harness

`joee` 是为本仓库定制的 pi supervisor harness，用于 Pulse Dodger 的代码修改、调试、测试、文档、构建和 CrazyGames 提交流程相关任务。

## 架构

- **模式**：Supervisor。
- **运行时**：`@baryonlabs/pi-agent-harness` 的 `subagent` extension。
- **核心流程**：plan → subagent → integrate → review → verify。
- **委派模式**：按任务选择 `single`、`parallel` 或 `chain`，所有项目级 agent 委派必须在 trust preflight 后使用 `agentScope: "both"`。

## 文件

```text
.pi/teams/joee/
├── README.md
├── manifest.json
├── routes.md
└── prompts/
    └── joee.md
```

## 使用

当前文件输出在项目内的 team 目录。若希望通过 slash prompt 直接调用，把 `prompts/joee.md` 注册到 pi prompt discovery，例如复制或链接到项目 `.pi/prompts/joee.md`，或在 pi 设置中显式加载该 prompt 文件。

调用方式：

```text
/joee <task>
```

示例：

```text
/joee add tests for spawn budget edge cases
/joee debug why portal upload bundle check fails
/joee update CrazyGames submission docs after build script changes
```

## 项目约束摘要

- 本地 dev server 只能通过 `npm run dev` / `npm run dev:stop` / `npm run dev:status` 管理。
- 端口固定 `127.0.0.1:8080`。
- 游戏层通过 `src/platform` 使用 CrazyGames SDK，不直接访问 `window.CrazyGames`。
- 代码改动完成前运行最小必要验证，常见命令：`npm run test`、`npm run typecheck`、`npm run check:boundaries`、`npm run build`。
- 不自动 commit、push、部署或上传 Portal。

## 演进记录

| 日期 | 变更 | 说明 |
|---|---|---|
| 2026-09-23 | 初始创建 | 建立项目级 Joee Supervisor harness |
