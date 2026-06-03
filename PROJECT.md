# Micat 项目文档

## 目标

Micat 是一个轻量级 Codex 项目记忆层，目标是在长对话、项目长期推进和上下文压缩之后，仍然能保留关键规则、执行偏好和策略经验。

系统只捕获高价值对话事件：

- 用户消息：作为规则、偏好、纠错、策略提示的权威来源
- 助手最终回复：作为任务完成后的执行总结证据

系统不捕获 Codex 的工作过程日志、工具调用、token 统计、过程进展消息和中间执行细节。

## 可行性结论

当前本机 Codex 环境可以支持 Micat 的 MVP。

已验证环境：

- Codex CLI 版本：`codex-cli 0.131.0-alpha.9`
- `~/.codex/config.toml` 已启用原生 hooks
- 本机 `features.memories` 当前为 experimental 且未启用
- 本机 `features.plugin_hooks` 当前为 under development 且未启用
- 可用原生 hook 事件包括：`UserPromptSubmit`、`PreCompact`、`PostCompact`、`SessionStart`、`Stop`
- 本地 transcript 文件位于：`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

## Codex 原生机制调研

Codex 现在已经有三套相关机制：Memories、Hooks、Plugins。

### Codex Memories

官方 Memories 的定位是让 Codex 把早期 thread 里的有用上下文带到未来工作中。它能记住稳定偏好、重复 workflow、技术栈、项目约定和已知坑。

但它不是 Micat 要解决问题的完整替代：

- Memories 默认关闭，本机当前未启用。
- Memories 是 Codex 控制的后台机制，不是一个用户可完全定义抽取提示词的侧车抽取器。
- 官方文档建议必须强制遵守的团队规则仍然放在 `AGENTS.md` 或项目文档里，Memories 只是本地 recall 层。
- Memories 会跳过活跃或短会话，等 thread 空闲足够久才后台生成，因此不适合承担“本轮长对话 compact 前后规则必须延续”的职责。
- Memories 有 `extract_model` 和 `consolidation_model` 配置，可以换模型，但没有暴露“只从 user message 抽取项目执行规则”的完整可控工作流。

因此结论是：Codex Memories 可以作为补充，但不能替代 Micat。Micat 的核心差异不是“存储记忆”，而是可控地从用户消息里抽取执行规则，并在 compact 后确定性注入。

### Codex Hooks

Hooks 是 Micat 的核心接入点。

官方支持把脚本插入 Codex agent loop，用例里明确包括：

- 把 conversation 发到自定义日志或分析系统
- 扫描用户 prompt
- 自动总结 conversation 创建持久记忆
- 在 turn 停止时运行验证
- 根据目录定制 prompting

和 Micat 直接相关的 hook 行为：

- `UserPromptSubmit` 会在用户 prompt 发送前运行，stdin 包含 `prompt` 字段，stdout 文本或 `additionalContext` 会进入 developer context。
- `Stop` 会在一个 turn 停止时运行，适合读取 transcript，捕获最新 `final_answer`。
- `PreCompact` 会在 compact 前运行，但 stdout 文本会被忽略，只适合阻止或做状态落盘。
- `PostCompact` 会在 compact 后运行，但 stdout 文本同样会被忽略，不能直接用于注入上下文。
- `SessionStart` 的 `source` 包含 `startup`、`resume`、`clear`、`compact`，并且支持把 stdout 或 `additionalContext` 注入 developer context。

因此 compact 后注入的正确入口不是 `PostCompact`，而是 `SessionStart` + `matcher: "compact"`。

### Codex Plugins

Codex Plugins 可以打包 skills、MCP servers、apps 和 lifecycle hooks。插件 hook 使用和普通 hook 相同的事件 schema，并且能拿到 `PLUGIN_ROOT` 和 `PLUGIN_DATA`。

Micat 的产品目标形态是 Codex plugin：安装后由 Codex 自动触发 hooks，不需要用户每轮手动运行。

但本机当前 `plugin_hooks` 是 under development 且未启用，所以 v1 工程上采用双轨：

1. 代码按 Codex plugin 包结构设计。
2. 同一套 hook runner 也支持注册到 `~/.codex/hooks.json`，用于当前环境先跑通捕获、抽取、注入链路。
3. plugin hooks 可用后，切换到 plugin-bundled hooks，不改变核心代码。

## v1 架构设计

### v1 范围

第一版只解决最痛的问题：当前 Codex session 在多次 compact 后不丢失用户说过的重要规则。

v1 明确不做：

- 自动长期项目记忆
- 自动修改 `AGENTS.md`、`CODEX.md` 或 skills
- 跨项目共享规则
- 自动判断哪些 session 规则应该永久化
- 复杂向量库或通用 memory database

长期项目记忆后续通过手动命令扩展，例如 `micat remember-session`，由用户确认后再晋升。

### 核心组件

Micat v1 由四个组件组成：

```text
Codex native hooks
  -> micat hook runner
  -> micat session store
  -> micat sidecar extractor
  -> Codex additionalContext injection
```

组件职责：

- `hook runner`：很薄，只负责接收 Codex hook stdin、识别 session、记录事件、触发或等待压缩任务。
- `session store`：按 `session_id` 存储当前 session 的用户消息、助手最终回复、滚动摘要和注入内容。
- `sidecar extractor`：调用用户配置的小模型，根据用户自定义 prompt 做滚动压缩和规则抽取。
- `injector`：在下一轮 prompt、resume、compact 后，把当前 session 的 active rules 注入 Codex developer context。

### 模型配置

Micat 不绑定模型供应商，只要求 OpenAI-compatible 接口。

推荐配置形态：

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
```

原则：

- key 优先从环境变量读取，不建议明文写入配置。
- 第一版只支持一个模型。
- 用户自己维护核心 prompt，Micat 只定义输入输出协议和校验。

### Session 绑定

Micat 以 Codex hook payload 里的 `session_id` 为主键。

每个 session 一个独立目录：

```text
~/.codex/micat/sessions/<session_id>/
  meta.json
  rounds.jsonl
  pending.jsonl
  micat_context.md
  active_rules.md
  active_rules.json
  cursors.json
  jobs.jsonl
  errors.jsonl
```

`meta.json` 保存：

- `session_id`
- `cwd`
- `transcript_path`
- `created_at`
- `last_seen_at`
- `last_compact_at`
- `rounds_completed`
- `last_rollup_round`

项目路径只作为元信息保存，v1 不用它做隔离判断。这样一个 workspace 里有多个项目也不会互相污染，因为隔离边界是 session。

### 一轮对话的定义

Micat 的最小处理单位是 round：

```text
round = 用户输入 + 助手 final_answer
```

只记录：

- `UserPromptSubmit.prompt`
- transcript 里的 `agent_message` 且 `phase == "final_answer"`

明确忽略：

- commentary
- tool call
- tool output
- token event
- 中间 work 日志

### 两种摘要

Micat v1 维护两个滚动结果。

#### 1. `micat_context`

这是给 Micat 自己看的上下文摘要，不注入 Codex。

用途是避免小模型只看最近几轮时误判用户规则。它保留：

- 当前 session 的任务背景
- 用户目标
- 项目上下文
- 关键术语
- 已发生的重要决策
- 最近对话里影响规则判断的背景

它不要求短到能注入 Codex，只要求足够帮助下一次规则抽取。

#### 2. `active_rules`

这是要注入 Codex 的规则摘要。

它只保留：

- 用户明确表达的执行规则
- 用户纠正过的 Codex 行为
- 当前 session 后续必须遵守的偏好
- 会因为 compact 丢失而导致返工的约束

它必须短、强约束、可执行，不能写成普通对话总结。

### 滚动压缩机制

正常情况下，Micat 每 `N` 轮完整对话做一次滚动压缩。默认建议 `N = 5`。

输入给小模型的内容不是完整 transcript，而是：

```text
上一版 micat_context
上一版 active_rules
最近 N 轮 rounds
用户自定义 rollup prompt
```

输出必须包含两个结果：

```json
{
  "micat_context": "更新后的 Micat 自用上下文摘要",
  "active_rules_patch": [
    {
      "type": "execution_rule",
      "rule": "后续遇到 compact 相关问题时，优先检查 SessionStart(source=compact) 注入。",
      "evidence": "用户原文或轮次引用",
      "confidence": 0.86
    }
  ]
}
```

v1 只做增量更新：

- 新规则追加
- 相似规则合并
- 明显重复规则去重
- 不自动删除旧规则
- 不自动永久化到项目规则

过时规则处理留到后续版本。

### Compact 前后行为

compact 是 Micat v1 的关键路径。

#### PreCompact

`PreCompact` 触发时忽略轮数限制，强制处理所有未压缩 round：

```text
PreCompact
  -> 找到当前 session 未处理 rounds
  -> 调用 sidecar 做一次强制 rollup
  -> 写入 micat_context 和 active_rules
  -> 记录 compact checkpoint
```

推荐策略：

- 默认等待 sidecar 完成，设置超时。
- 如果模型失败或超时，不阻止 Codex compact。
- 失败时保留最后一次成功的 `active_rules`，并把未处理用户消息写入 `pending.jsonl`。

#### SessionStart(source=compact)

`PostCompact` 不能直接注入上下文，因为 Codex 会忽略它的 stdout。

compact 后真正负责注入的是：

```text
SessionStart matcher = "compact"
```

它读取当前 session 的 `active_rules.md`，返回：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Micat session rules..."
  }
}
```

这段 `additionalContext` 会作为 developer context 进入 compact 后的新上下文。

### 普通对话中的注入

只在 compact 后注入还不够，因为规则可能在当前 session 中途被抽取出来。

因此 `UserPromptSubmit` 也应该注入当前 `active_rules`：

```text
UserPromptSubmit
  -> 捕获用户 prompt
  -> 写入 pending turn
  -> 读取 active_rules
  -> 返回 additionalContext
```

这样下一轮开始时，Codex 就能看到 Micat 已整理出的 session rules。

### Sidecar 运行方式

v1 推荐 sidecar 由 Micat 自动按需拉起，不要求用户手动常驻打开。hook runner 必须能在 sidecar 不存在或启动失败时降级。

推荐行为：

- `SessionStart(startup|resume|compact)`：检查 sidecar，不存在则尝试启动。
- 正常 `Stop`：只入队，不阻塞 Codex。
- 满 `N` 轮：sidecar 后台滚动压缩。
- `PreCompact`：同步等待一次压缩，带超时。
- `SessionStart(source=compact)`：只读取已有 `active_rules`，不调用模型。

这样可以保证普通对话不被小模型拖慢，同时 compact 前尽量完成最后一次整理。

### 数据流

```text
UserPromptSubmit
  -> append pending user prompt
  -> inject active_rules

Stop
  -> read transcript_path
  -> extract latest final_answer
  -> complete round
  -> if completed rounds since last rollup >= N: enqueue rollup

sidecar rollup
  -> read previous micat_context
  -> read previous active_rules
  -> read unprocessed rounds
  -> call configured model with user prompt
  -> update micat_context
  -> merge active_rules_patch into active_rules
  -> advance cursor

PreCompact
  -> force rollup all pending rounds
  -> checkpoint

SessionStart(source=compact)
  -> inject active_rules
```

### 第一版验收标准

v1 做到以下程度才算完成：

- 能从真实 `UserPromptSubmit` 捕获用户输入。
- 能从真实 transcript 捕获每轮 `final_answer`。
- 能按 `session_id` 独立写入 session store。
- 能每 `N` 轮生成一次 `micat_context` 和 `active_rules`。
- 能在 `PreCompact` 忽略轮数限制强制 rollup。
- 能在 `SessionStart(source=compact)` 注入 compact 后上下文。
- 能在 `UserPromptSubmit` 注入当前 active rules。
- 模型 URL、key、model、prompt 路径可配置。
- 模型失败时不破坏 Codex 正常对话，只保留 pending 状态和最后一次成功结果。

## 事件来源

### 用户消息

用户消息有两条可用路径。

MVP 推荐路径：直接使用 Codex 原生 `UserPromptSubmit` command hook。

证据：当前已安装的原生 hook 会从原始 Codex hook payload 里读取这些字段：

```text
payload.prompt
payload.user_prompt
payload.userPrompt
```

这说明只要把 Micat 的 command hook 直接注册到 `~/.codex/hooks.json`，就可以从 stdin 里收到用户输入。

备用路径：读取 session transcript JSONL。

transcript 中的用户消息记录形态如下：

```json
{
  "type": "event_msg",
  "payload": {
    "type": "user_message",
    "message": "..."
  }
}
```

这足够支持增量抽取。即使将来直接 hook payload 变化，Micat 也可以通过 transcript 兜底。

### 助手最终总结

助手最终总结的稳定来源是 transcript JSONL，而不是过程输出流。

transcript 能区分过程消息和最终回复：

```json
{
  "type": "event_msg",
  "payload": {
    "type": "agent_message",
    "phase": "commentary",
    "message": "..."
  }
}
```

```json
{
  "type": "event_msg",
  "payload": {
    "type": "agent_message",
    "phase": "final_answer",
    "message": "..."
  }
}
```

因此捕获规则是：

- 只保留 `payload.type == "agent_message"` 且 `payload.phase == "final_answer"` 的消息
- 忽略 `payload.phase == "commentary"` 的过程消息

`Stop` hook 应该读取当前 `transcript_path`，提取刚完成回合里的最新 `final_answer`。

## 关键边界

不能只依赖现有 OMX `.omx/hooks/*.mjs` 插件层捕获用户消息。

原因：OMX 原生 hook 在分发给二级插件之前，会主动删除 prompt 字段：

```text
delete sanitized.prompt
delete sanitized.input
delete sanitized.user_prompt
delete sanitized.userPrompt
delete sanitized.text
```

所以 Micat 的 MVP 不应该从纯 OMX 插件开始。

推荐 MVP 路线：

1. 代码按 Codex plugin 包结构实现。
2. 当前环境先用 native hook fallback 注册到 `~/.codex/hooks.json`。
3. `UserPromptSubmit` 捕获原始用户消息。
4. `Stop` 从 transcript 里捕获最新助手 `final_answer`。
5. `PreCompact` 强制 rollup。
6. `SessionStart(source=compact)` 和 `UserPromptSubmit` 注入 `active_rules`。

## 记忆流水线

```text
UserPromptSubmit
  -> 捕获原始用户消息
  -> 追加写入 ~/.codex/micat/sessions/<session_id>/pending-user.jsonl
  -> 读取 active_rules.md
  -> 返回 additionalContext

Stop
  -> 读取 transcript_path
  -> 提取最新 agent_message phase=final_answer
  -> 和 pending user prompt 合成 round
  -> 追加写入 ~/.codex/micat/sessions/<session_id>/rounds.jsonl
  -> 达到 N 轮后写入 rollup job

PreCompact
  -> 忽略 N 轮限制
  -> 强制 rollup 未处理 rounds
  -> 更新 micat_context.md 和 active_rules.md

SessionStart(source=compact)
  -> 读取 active_rules.md
  -> 把 session rules 注入回 Codex
```

## 记什么

用户消息是主要权威来源。

当用户消息包含以下内容时，应生成记忆候选：

- 长期项目规则
- 反复出现的执行偏好
- 对 Codex 行为的纠正
- skill 路由说明
- 项目特殊约束
- “以后遇到这种情况要这样做”一类规则
- 一旦遗忘就会导致返工或错误执行的要求

不应记住：

- 一次性任务细节
- 临时进展闲聊
- 工具输出
- 没有用户支持的模型推测
- 密钥、凭据、隐私等敏感信息
- 未被用户确认的助手过程判断

助手最终回复只作为执行证据，不作为规则权威。

## 工程结构

工程目录、插件打包方式、hook 入口、sidecar 运行方式以 `ARCHITECTURE.md` 为准。

当前定稿：

- Micat 是本机 Codex 自动触发的 session 记忆插件。
- 目标形态是 Codex plugin，兼容形态是 native hooks。
- 不做前端、不做 dashboard、不做本地 Web server。
- 源码目录按 plugin package、hook runner、session store、rollup、sidecar、LLM client 分层。
- 运行数据写入 `~/.codex/micat/sessions/<session_id>/`。

## MVP 完成标准

第一版可用的标准：

- 一次真实 `UserPromptSubmit` 事件只写入一条用户消息记录
- 一次真实 Codex 回合结束后只写入一条助手最终总结记录
- `commentary` 过程消息不会被当成总结捕获
- 工具调用和 token 事件会被忽略
- 抽取器能基于 cursor 只处理新增事件
- 召回器能注入一段短记忆块，不需要频繁改写 `AGENTS.md`

## 下一步

先实现一个最小 proof hook：把真实 `UserPromptSubmit` 的 stdin 原样写入临时 JSONL 文件，然后发一条真实 Codex prompt，确认本机 payload 是否包含预期的 prompt 字段。

之后实现 `Stop` hook 的 transcript 读取器，验证它只捕获最新的 `final_answer`。
