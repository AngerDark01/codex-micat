# Micat 工程架构设计

## 定位

Micat 是一个 **本机 Codex 自动触发的 session 记忆插件**。

它的核心链路不依赖前端，不要求用户每轮手动运行。安装完成后，Codex 本机 session 触发 hooks，Micat 自动捕获、整理、压缩和注入上下文。为了可观测和调试，Micat 额外提供 `micat serve` 本机管理台。

v1 只支持本机本地使用：

- 支持本机 Codex CLI/TUI。
- 支持本机 Codex Desktop/App，前提是它走本机 Codex hooks/config/plugin 体系。
- 不支持远程/cloud session。
- 不做跨设备同步。
- 不调用 Desktop 私有接口。
- 管理台只监听 `127.0.0.1`，用于本机 trace、prompt 编辑和手动 rollup。

## 技术选型

v1 使用 **TypeScript + Node.js ESM**。

理由：

- Codex hook 调用的是本地命令，Node 很适合作为轻量 hook runner。
- Node 18+ 自带 `fetch`，调用 OpenAI-compatible 模型接口不需要重依赖。
- TypeScript 能约束 hook payload、session 状态、LLM JSON 输出，减少后续维护风险。
- Codex plugin 打包 hooks、脚本、配置时，Node/TS 的分发成本低。
- 本机已有 Codex / oh-my-codex hook 生态大量使用 Node，兼容性好。

暂时不选：

- Python：依赖环境和虚拟环境更容易在 hook 场景出问题。
- Go/Rust：适合未来做单文件二进制，但 v1 重点是快速验证 hook 机制和提示词质量。

## 运行模式

Micat 的目标形态是 **Codex plugin first，native hook fallback**。

### 目标形态：Codex Plugin

插件安装后，Codex 加载 Micat 的 `hooks/hooks.json`。每个 session 的事件由 Codex 自动触发：

```text
Codex SessionStart
  -> Micat hook
  -> 初始化 session store
  -> 注入已有 active_rules
  -> 按需启动本机 sidecar

Codex UserPromptSubmit
  -> Micat hook
  -> 捕获用户消息
  -> 注入当前 active_rules

Codex Stop
  -> Micat hook
  -> 捕获 assistant final_answer
  -> 合成 round
  -> 达到 N 轮后执行一次 scheduled rollup

Codex PreCompact
  -> Micat hook
  -> 忽略 N 轮限制，强制 rollup

Codex SessionStart(source=compact)
  -> Micat hook
  -> compact 后重新注入 active_rules
```

### 兼容形态：Native Hooks

当前本机 `features.plugin_hooks` 仍是 under development。为了先跑通 v1，Micat 同时提供 `micat install-native-hooks`，把同一套 hook runner 注册到 `~/.codex/hooks.json`，并把 Codex 要求的 unmanaged hook 信任哈希写入 `~/.codex/config.toml` 的 `hooks.state`。

两种形态只差安装方式，不差核心代码：

```text
Codex plugin hooks
  -> dist/src/bin/micat.mjs hook

~/.codex/hooks.json native hooks
  + ~/.codex/config.toml hooks.state trusted_hash
  -> dist/src/bin/micat.mjs hook
```

## 仓库目录

目录按“插件包 + 自动 hook runner + 本机 sidecar”设计：

```text
Micat/
  .codex-plugin/
    plugin.json

  hooks/
    hooks.json

  src/
    bin/
      micat.ts

    hook/
      dispatch.ts
      handlers/
        session-start.ts
        user-prompt-submit.ts
        stop.ts
        pre-compact.ts

    session/
      resolver.ts
      store.ts
      round-builder.ts
      transcript-reader.ts
      injector.ts

    rollup/
      planner.ts
      runner.ts
      prompt-input.ts
      rule-merge.ts
      output-schema.ts

    sidecar/
      autostart.ts
      daemon.ts
      queue.ts
      worker.ts
      health.ts

    llm/
      openai-compatible.ts
      prompt-loader.ts

    config/
      load-config.ts
      defaults.ts

    fs/
      atomic-write.ts
      file-lock.ts
      jsonl.ts
      paths.ts

    doctor/
      doctor.ts

    web/
      server.ts
      static.ts

    types/
      codex-hook.ts
      micat-state.ts
      rollup.ts

  prompts/
    rollup.default.md

  templates/
    config.default.toml
    native-hooks.snippet.json

  tests/
    fixtures/
      hook-payloads/
      transcripts/
    unit/
    integration/

  package.json
  tsconfig.json
  README.md
  PROJECT.md
  ARCHITECTURE.md
```

构建输出：

```text
Micat/
  dist/
    bin/
      micat.mjs
    hook/
    session/
    rollup/
    sidecar/
    llm/
    config/
    fs/
```

Codex hooks 永远调用构建后的入口：

```text
node "${PLUGIN_ROOT}/dist/src/bin/micat.mjs" hook
```

native hook 安装时使用绝对路径：

```text
node /absolute/path/to/Micat/dist/src/bin/micat.mjs hook
```

## 插件文件

`.codex-plugin/plugin.json`：

```json
{
  "name": "micat",
  "version": "0.1.0",
  "description": "Session-level memory rollup and context injection for local Codex.",
  "hooks": "./hooks/hooks.json"
}
```

`hooks/hooks.json`：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/src/bin/micat.mjs\" hook"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/src/bin/micat.mjs\" hook"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/src/bin/micat.mjs\" hook"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${PLUGIN_ROOT}/dist/src/bin/micat.mjs\" hook",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

native hooks 使用同一份事件结构，只把 command 替换为 Micat 的绝对路径。

## 运行时目录

运行数据全部写到 Codex home，不写进源码仓库：

```text
~/.codex/micat/
  config.toml
  prompts/
    rollup.md

  sessions/
    <session_id>/
      meta.json
      pending-user.jsonl
      rounds.jsonl
      micat_context.md
      active_rules.md
      active_rules.json
      cursors.json
      jobs.jsonl
      errors.jsonl
      lock

  sidecar/
    sidecar.pid
    sidecar.sock
    sidecar.log
```

v1 的隔离边界是 `session_id`。`cwd`、`transcript_path`、项目路径只写入 `meta.json`，不参与跨 session 合并。

## 配置

默认配置文件：

```text
~/.codex/micat/config.toml
```

建议格式：

```toml
[model]
base_url = "http://localhost:11434/v1"
api_key_env = "MICAT_API_KEY"
model = "qwen-coder-small"
timeout_ms = 20000

[rollup]
rounds = 5
max_input_chars = 30000
max_injected_chars = 8000
precompact_timeout_ms = 30000

[prompts]
rollup = "~/.codex/micat/prompts/rollup.md"

[storage]
root = "~/.codex/micat"
```

API key 只从环境变量读取，不建议明文写入配置。

## Hook 行为

### SessionStart

触发时机：

- `startup`
- `resume`
- `compact`

职责：

- 初始化当前 `session_id` 的 session store。
- 写入或更新 `meta.json`。
- 按需启动本机 sidecar。
- 读取 `active_rules.md`。
- 返回 `additionalContext` 注入 Codex。

注意：compact 后注入靠 `SessionStart(source=compact)`，不是 `PostCompact`。`PostCompact` 不适合作为注入点。

### UserPromptSubmit

职责：

- 读取 hook payload 里的 `prompt`。
- 追加写入 `pending-user.jsonl`。
- 读取当前 `active_rules.md`。
- 返回 `additionalContext`。

不做：

- 不调用模型。
- 不读取完整 transcript。
- 不等待 rollup。

### Stop

职责：

- 读取 `transcript_path`。
- 找到最新 `agent_message phase=final_answer`。
- 和 pending user prompt 合成完整 round。
- 追加写入 `rounds.jsonl`。
- 如果未处理 round 数达到配置的 `N`，写入 `jobs.jsonl`。

不做：

- 默认不等待模型。
- 不捕获 commentary、tool call、tool output。

### PreCompact

职责：

- 忽略 `N` 轮限制。
- 强制处理当前 session 所有未 rollup 的 rounds。
- hook 进程内按 `rollup.rounds` 分批 drain。
- 失败或超时时不阻止 Codex compact，继续使用最后一次成功的 `active_rules`。

## Sidecar

sidecar 是后续扩展点，当前仍是 no-op。现阶段 scheduled / manual / precompact rollup 都由 hook 或 CLI 进程内执行。

职责：

- 监听 session jobs。
- 调用用户配置的小模型。
- 维护 `micat_context.md`。
- 维护 `active_rules.md` 和 `active_rules.json`。
- 记录错误。

迁移策略：

- 当前：`Stop` 达到阈值后同步执行一批 rollup；`PreCompact` 同步 drain 全部积压。
- 后续：如果 Stop 同步等待影响体验，再把 scheduled rollup 移到 sidecar。

## Rollup 输入输出

每次 rollup 给模型的输入：

```text
用户自定义 rollup prompt
上一版 micat_context
上一版 active_rules
最近未处理 rounds
rollup_reason: scheduled | precompact | manual
```

模型输出必须是 JSON：

```json
{
  "micat_context": "给 Micat 自己看的滚动上下文摘要",
  "active_rules_patch": [
    {
      "type": "execution_rule",
      "rule": "短、明确、可执行的 session 规则",
      "evidence": "用户原文或 round id",
      "confidence": 0.8
    }
  ]
}
```

v1 合并规则：

- `micat_context` 用新输出替换。
- `active_rules_patch` 进入确定性合并。
- 明显重复规则去重。
- 相似规则合并。
- 不自动删除旧规则。
- 不自动写入长期项目记忆。

## CLI

CLI 只是安装和诊断工具，不是日常使用入口。

保留最少命令：

```text
micat doctor
micat install-native-hooks
micat uninstall-native-hooks
micat inspect-session <session_id>
micat rollup --session <session_id> --force
micat serve
```

`micat serve` 提供本机管理台，用于查看 session、rounds、traces、rules、context、errors，编辑 prompt，并手动触发 rollup。

## 并发与可靠性

- 每个 session 目录一个 `lock`。
- 所有 JSON/Markdown 写入使用临时文件加 rename。
- JSONL 追加必须保证单行完整。
- rollup 成功后才推进 `cursors.json`。
- 模型失败不影响 Codex 正常对话。
- hook runner 失败时优先静默降级并写入 `errors.jsonl`。
- `PreCompact` 有超时，不能无限阻塞 Codex compact。

## 第一阶段实现顺序

1. 建 TypeScript/Node 项目骨架。
2. 实现 `dist/src/bin/micat.mjs hook`。
3. 实现 `SessionStart`、`UserPromptSubmit`、`Stop`、`PreCompact` 分发。
4. 实现 session store 和文件锁。
5. 实现 transcript reader，只读取 `final_answer`。
6. 实现 round builder。
7. 实现 OpenAI-compatible LLM client。
8. 实现 manual rollup。
9. 实现 `UserPromptSubmit` 和 `SessionStart(source=compact)` 注入。
10. 实现 `PreCompact` 强制 rollup。
11. 实现 sidecar 自动启动和 job worker。
12. 实现 `micat doctor`。
13. 实现 native hook 安装。
14. 最后补 Codex plugin 打包验证。

## v1 完成标准

- 安装后，本机 Codex session 会自动触发 Micat。
- 能捕获真实 `UserPromptSubmit.prompt`。
- 能从真实 transcript 捕获 assistant `final_answer`。
- 每个 `session_id` 独立存储。
- 每 `N` 轮自动 rollup。
- `PreCompact` 会忽略轮数限制强制 rollup。
- compact 后能通过 `SessionStart(source=compact)` 注入 `active_rules`。
- 模型 URL、key env、model、prompt 路径可配置。
- 管理台可选；核心 hook 链路无需每轮手动运行。
- 模型失败不破坏 Codex 正常使用。
