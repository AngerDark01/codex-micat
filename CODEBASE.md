# Micat Codebase

## 1. 项目概览

Micat 是本机 Codex 自动触发的 session 记忆插件。当前实现是 v1 可运行骨架：TypeScript + Node.js ESM，Node 版本要求 `>=20`，通过 Codex hook payload 捕获用户输入、从 transcript 抽取 assistant `final_answer`、按 `session_id` 写入本地状态、用 mock/OpenAI-compatible rollup 分批生成 `micat_context` 和 session active rules，并在 `UserPromptSubmit` / `SessionStart(source=compact)` 注入 active rules。

运行进程：

- Codex hook runner：`node dist/src/bin/micat.mjs hook`，短进程，由 Codex hook 自动触发。
- Sidecar：当前是 no-op autostart 占位，v1 骨架用 `PreCompact` 进程内 fallback 完成强制 rollup。

本地状态：

- 默认配置：`~/.codex/micat/config.toml`
- session 状态：`~/.codex/micat/sessions/<session_id>/`
- 真实模型密钥和 reasoning effort 默认通过 `micat config` 写入本机 toml；env var 作为兼容 fallback。
- 可选管理台：`micat serve`，默认 `http://127.0.0.1:17877`。

关键约束：

- 普通 `UserPromptSubmit` 不调用模型；`Stop` 在累计达到 `rollup.rounds` 轮后执行一次 scheduled rollup。
- `PreCompact` 可调用模型，但有超时，失败不阻塞 Codex compact。
- 每次 rollup 最多把 `rollup.rounds` 轮未压缩对话传给模型；更旧的对话通过 `previous_micat_context` 压缩传递。
- 每次 rollup 都写 `traces.jsonl`，用于管理台查看 LLM input/raw output/parsed output/errors。
- 用户 prompt 是规则权威，assistant final answer 只作为 round 上下文和证据。
- 管理台只监听本机，不做公网访问和多用户权限。

## 2. 目录结构图

```text
Micat/
  .codex-plugin/plugin.json          # Codex plugin manifest，声明 Micat hooks 入口
  hooks/hooks.json                   # plugin-bundled hook 配置，指向 dist/src/bin/micat.mjs hook
  prompts/rollup.default.md          # 默认规则抽取 prompt
  scripts/rename-bin.mjs             # build 后把 CLI 入口从 .js 改名为 .mjs
  templates/config.default.toml      # 默认本机配置模板，mock 模型可直接测试
  templates/native-hooks.snippet.json # native hook fallback 配置片段
  tests/hook-flow.test.ts            # 端到端 hook flow 测试
  tests/configure.test.ts            # config.toml 写入、权限和加载测试
  tests/llm-openai-compatible.test.ts # OpenAI-compatible 请求体字段测试
  tests/native-hooks.test.ts         # native hooks install/uninstall 测试
  tests/rollup-runner.test.ts        # rollup 分批和 trace 测试
  tests/web-server.test.ts           # 本地管理台 API 测试
  src/bin/micat.ts                   # CLI/hook 统一入口
  src/config/configure.ts            # 交互式配置向导和 toml 写入
  src/config/defaults.ts             # Micat 默认配置模型
  src/config/load-config.ts          # 简单 TOML 配置加载器
  src/doctor/doctor.ts               # 本机配置与存储可用性检查
  src/fs/atomic-write.ts             # 原子写文件/JSON
  src/fs/file-lock.ts                # session 级 lock 文件
  src/fs/jsonl.ts                    # JSONL 追加与读取
  src/fs/paths.ts                    # home/CODEX_HOME/时间路径工具
  src/hook/dispatch.ts               # hook_event_name 分发器
  src/hook/handlers/session-start.ts # SessionStart handler，初始化并注入规则
  src/hook/handlers/user-prompt-submit.ts # UserPromptSubmit handler，捕获 prompt 并注入规则
  src/hook/handlers/stop.ts          # Stop handler，抽 final_answer 并合成 round
  src/hook/handlers/pre-compact.ts   # PreCompact handler，强制 rollup
  src/llm/openai-compatible.ts       # OpenAI-compatible chat completions / mock rollup 客户端
  src/llm/prompt-loader.ts           # rollup prompt 加载
  src/native-hooks/install.ts        # native hooks 安装、卸载、检测和 Codex trust state 写入
  src/rollup/output-schema.ts        # LLM JSON 输出解析与校验
  src/rollup/planner.ts              # 判断是否达到 N 轮 rollup 阈值
  src/rollup/rule-merge.ts           # active rules 确定性合并
  src/rollup/runner.ts               # rollup 主流程
  src/session/injector.ts            # additionalContext 输出构造
  src/session/resolver.ts            # session_id 和 prompt 解析
  src/session/store.ts               # session 文件状态读写
  src/session/transcript-reader.ts   # transcript JSONL final_answer 读取
  src/sidecar/autostart.ts           # sidecar 自动启动占位
  src/types/codex-hook.ts            # Codex hook payload/output 类型
  src/types/micat-state.ts           # Micat session 状态类型
  src/types/rollup.ts                # rollup 输入输出类型
  src/web/server.ts                  # 127.0.0.1 管理台 HTTP server 和 API
  src/web/static.ts                  # 管理台 HTML/CSS/JS
  ARCHITECTURE.md                    # 工程架构设计
  PROJECT.md                         # 产品目标和机制设计
  CODEBASE.md                        # 当前代码结构和数据流说明
  ITERATION_LOG.md                   # codebase 同步记录
  README.md                          # 本机测试、native hooks 启用和运行数据说明
  package.json                       # npm 脚本和 TypeScript 依赖
  tsconfig.json                      # TypeScript NodeNext 配置
```

## 3. 架构全景

### C4 Level 1

```text
+--------------------+        local hooks         +-------------------+
| Local Codex session| -------------------------> | Micat hook runner |
+--------------------+                            +-------------------+
        ^                                                        |
        | additionalContext                                      | files
        |                                                        v
+--------------------+                            +---------------------------+
| Codex model context|                            | ~/.codex/micat/sessions/* |
+--------------------+                            +---------------------------+
                                                                 |
                                                                 | optional
                                                                 v
                                                       +----------------------+
                                                       | OpenAI-compatible LLM |
                                                       +----------------------+
```

### C4 Level 2

```text
+------------------+     +----------------+     +----------------+
| Codex hook stdin | --> | src/bin/micat  | --> | hook/dispatch  |
+------------------+     +----------------+     +----------------+
                                                   |      |      |
                                      +------------+      |      +------------+
                                      v                   v                   v
                             +---------------+   +----------------+   +----------------+
                             | session/store |   | transcript     |   | rollup/runner  |
                             +---------------+   +----------------+   +----------------+
                                      |                                      |
                                      v                                      v
                             +----------------+                     +---------------+
                             | local JSON/MD  |                     | active rules  |
                             +----------------+                     +---------------+
```

### C4 Level 3

```text
+----------+ JSON stdin  +--------------+ event switch +-------------------+
| micat.ts | ----------> | dispatchHook | -----------> | event handlers    |
+----------+             +--------------+              +-------------------+
                                                              |
                           +----------------------------------+-------------------+
                           v                                                      v
                  +----------------+                                    +----------------+
                  | SessionStore   |                                    | runRollup      |
                  +----------------+                                    +----------------+
                      |       |                                              |      |
                      v       v                                              v      v
              JSONL rounds  active_rules.md                           LLM client  rule merge
```

## 4. 模块与文件详解

### `src/bin/micat.ts`

职责：统一 CLI 入口。`hook` 子命令读取 stdin 的 Codex hook payload 并调用 `dispatchHook`；`config` 交互写配置；`init` 串起配置和 hook 安装；`doctor` 检查环境；`rollup` 手动触发某个 session 的 rollup；`sessions` / `rules` / `context` 查询 session 数据；`inspect-session` 输出 `meta.json`。

关键导出：无导出，作为 executable module 运行。

对外依赖：`config/configure`、`config/load-config`、`doctor/doctor`、`hook/dispatch`、`native-hooks/install`、`rollup/runner`、`session/store`。

注意事项：stdout 在 hook 模式下只能输出 Codex hook JSON，不能打印日志。

### `src/config/defaults.ts`

职责：定义 `MicatConfig` 和默认配置。默认模型是 `mock:`，便于无外部模型时跑测试；模型配置支持 `api_key`、`reasoning_effort` 直读，同时保留 env var fallback。

关键导出：`MicatConfig`、`defaultConfig()`。

对外依赖：`fs/paths`。

注意事项：默认 prompt 路径位于 `~/.codex/micat/prompts/rollup.md`，不存在时由 prompt loader 降级。

### `src/config/configure.ts`

职责：提供 `micat config` 使用的配置向导和 toml 写入能力。写入 `base_url`、`api_key`、`model`、`reasoning_effort`、rollup 和 storage 设置，并把配置文件权限设为 `0600`。

关键导出：`runConfigWizard()`、`writeConfigFile()`、`configInputFromLoaded()`、`renderConfigToml()`。

对外依赖：`config/load-config`、`fs/atomic-write`、`fs/paths`。

注意事项：reasoning effort 可以为空；合法非空值为 `none`、`minimal`、`low`、`medium`、`high`、`xhigh`。当 stdin 不是 TTY 时，向导按行读取输入，方便脚本测试。

### `src/config/load-config.ts`

职责：加载 `~/.codex/micat/config.toml`，使用最小 TOML parser 覆盖默认配置。

关键导出：`loadConfig(configPath?)`。

对外依赖：`config/defaults`、`fs/paths`。

注意事项：parser 只覆盖 v1 所需的简单 `[section] key = value`，不是完整 TOML 实现。

### `src/doctor/doctor.ts`

职责：检查配置能加载、storage root 可创建并可读写，输出 native hook 安装状态、信任状态、key 是否配置和 reasoning effort 解析状态。

关键导出：`runDoctor()`。

对外依赖：`config/load-config`、`llm/openai-compatible`、`native-hooks/install`。

注意事项：doctor 不输出真实 API key；`native_hooks.trusted` 来自 `~/.codex/config.toml` 的 `hooks.state` 检查。

### `src/fs/atomic-write.ts`

职责：用临时文件 + rename 原子写入文本和 JSON，避免写半截状态。

关键导出：`atomicWriteFile()`、`atomicWriteJson()`。

对外依赖：无内部依赖。

注意事项：同目录 rename 保证本地文件系统上的原子替换语义。

### `src/fs/file-lock.ts`

职责：提供 session 级 lock 文件，避免并发 hook 同时写同一 session。

关键导出：`withFileLock()`。

对外依赖：无内部依赖。

注意事项：锁等待最多 5 秒；进程异常退出可能留下 stale lock，当前未做 PID 存活检测。

### `src/fs/jsonl.ts`

职责：追加 JSONL 和读取 JSONL。

关键导出：`appendJsonl()`、`readJsonl<T>()`。

对外依赖：无内部依赖。

注意事项：读取时跳过空行，但遇到坏 JSON 会抛错。

### `src/fs/paths.ts`

职责：路径展开和时间工具。

关键导出：`expandHome()`、`codexHome()`、`defaultMicatRoot()`、`nowIso()`。

对外依赖：无内部依赖。

注意事项：`CODEX_HOME` 优先于默认 `~/.codex`。

### `src/hook/dispatch.ts`

职责：加载配置、解析 session、构造 `SessionStore`，根据 `hook_event_name` 分派到具体 handler。

关键导出：`dispatchHook()`。

对外依赖：`config/load-config`、`session/resolver`、`session/store`、hook handlers。

注意事项：捕获 handler 错误并写入 `errors.jsonl`，避免破坏 Codex 正常对话。

### `src/hook/handlers/session-start.ts`

职责：处理 `SessionStart`，更新 meta、按需启动 sidecar、读取 active rules 并返回 `additionalContext`。

关键导出：`handleSessionStart()`。

对外依赖：`sidecar/autostart`、`session/injector`、`session/store`。

注意事项：`source=compact` 是 compact 后注入关键入口。

### `src/hook/handlers/user-prompt-submit.ts`

职责：处理 `UserPromptSubmit`，捕获用户 prompt 到 `pending-user.jsonl`，并注入当前 active rules。

关键导出：`handleUserPromptSubmit()`。

对外依赖：`session/resolver`、`session/injector`、`session/store`。

注意事项：不调用模型，避免用户提交 prompt 时延迟。

### `src/hook/handlers/stop.ts`

职责：处理 `Stop`，读取 transcript 最新 final answer，与 pending user prompt 合成 round，并在达到阈值后执行一次 scheduled rollup。

关键导出：`handleStop()`。

对外依赖：`rollup/planner`、`rollup/runner`、`session/store`、`session/transcript-reader`。

注意事项：scheduled rollup 失败会写 `errors.jsonl`，不会阻断 Codex。

### `src/hook/handlers/pre-compact.ts`

职责：处理 `PreCompact`，忽略轮数限制并同步清空所有待 rollup 批次。

关键导出：`handlePreCompact()`。

对外依赖：`rollup/runner`、`session/store`。

注意事项：超时或失败写 `errors.jsonl`，返回 `continue: true`。

### `src/llm/openai-compatible.ts`

职责：调用 OpenAI-compatible `/chat/completions`；当 `base_url = "mock:"` 时返回确定性 mock rollup。真实请求体由 `buildChatCompletionRequestBody()` 构造，并优先按 toml 配置注入 `reasoning_effort`。

关键导出：`runChatCompletion()`、`buildChatCompletionRequestBody()`、`readReasoningEffort()`、`readApiKey()`。

对外依赖：rollup 类型。

注意事项：真实模型路径只取 `choices[0].message.content`；toml 和 env 都不设置 reasoning effort 时请求体不带 `reasoning_effort`。

### `src/llm/prompt-loader.ts`

职责：加载用户配置的 rollup prompt，不存在时返回内置简短 fallback prompt。

关键导出：`loadPrompt()`。

对外依赖：`fs/paths`。

注意事项：v1 不自动复制默认 prompt 到 `~/.codex/micat/prompts`。

### `src/native-hooks/install.ts`

职责：安全合并、卸载、检测 `~/.codex/hooks.json` 中的 Micat native hooks，并维护 `~/.codex/config.toml` 的 Micat hook trust state。保留既有 hook group，只添加或移除 Micat 自己的 hook group。

关键导出：`defaultHooksPath()`、`defaultCodexConfigPath()`、`buildNativeHookCommand()`、`installNativeHooks()`、`uninstallNativeHooks()`、`inspectNativeHooks()`。

对外依赖：`fs/atomic-write`、`fs/paths`。

注意事项：Micat hook group 通过 `statusMessage = "Micat session memory"`、命令精确匹配、或命令中包含 `micat.mjs hook` 识别。Codex 官方实现不会读取 `hooks.json` 顶层 `state`；unmanaged hook 需要在 `config.toml` 的 `hooks.state."<hooks.json>:event:group:handler"` 中写入匹配的 `trusted_hash`。

### `src/rollup/output-schema.ts`

职责：从模型输出中提取 JSON 并校验 `micat_context` 和 `active_rules_patch`。

关键导出：`parseRollupOutput()`。

对外依赖：rollup 类型。

注意事项：支持纯 JSON 或 fenced JSON code block。

### `src/rollup/planner.ts`

职责：判断未 rollup round 数量是否达到配置阈值。

关键导出：`shouldScheduleRollup()`。

对外依赖：`session/store`。

注意事项：只做判断，不执行模型调用。

### `src/rollup/rule-merge.ts`

职责：把 `active_rules_patch` 合并进已有 active rules。

关键导出：`mergeActiveRules()`。

对外依赖：`fs/paths`。

注意事项：用规则文本 normalize 后的 sha256 前缀作为 id；不删除旧规则。

### `src/rollup/runner.ts`

职责：rollup 主流程。每次读取最多 `rollup.rounds` 轮未压缩 rounds、旧 context、旧 rules，调用 LLM，解析输出，合并规则，写回状态并按批次推进 cursor。`runAllPendingRollups()` 会循环执行直到没有待处理 rounds。

关键导出：`runRollup()`、`runAllPendingRollups()`。

对外依赖：`llm/prompt-loader`、`llm/openai-compatible`、`rollup/output-schema`、`rollup/rule-merge`、`session/store`。

注意事项：函数内部加 session lock，调用方不要再包同一个 session lock。`micat_context.md` 给 Micat 下一批抽取使用，`active_rules.md` 才是注入 Codex 的内容。

### `src/session/injector.ts`

职责：把 `active_rules.md` 转成 Codex hook 的 `hookSpecificOutput.additionalContext`。

关键导出：`buildAdditionalContext()`。

对外依赖：Codex hook 类型。

注意事项：空规则不输出；超出 `max_injected_chars` 时截断。

### `src/session/resolver.ts`

职责：解析 hook payload 的 `session_id` 和 prompt 字段。

关键导出：`resolveSessionId()`、`resolvePrompt()`。

对外依赖：Codex hook 类型。

注意事项：缺 session id 时用 cwd + transcript path 生成 fallback id。

### `src/session/store.ts`

职责：session 文件状态读写核心。负责 meta、pending prompt、rounds、cursors、active rules、errors、jobs、traces。

关键导出：`SessionStore`、`renderActiveRulesMarkdown()`。

对外依赖：`fs/atomic-write`、`fs/file-lock`、`fs/jsonl`、`fs/paths`。

注意事项：`completeRound()` 会消费一个 pending user prompt；`runRollup()` 依赖 `cursors.rounds_rollup_completed`；`traces.jsonl` 是管理台调试 rollup 的主要数据源。

### `src/session/transcript-reader.ts`

职责：读取 Codex transcript JSONL，找到最新 assistant `final_answer`。

关键导出：`readLatestFinalAnswer()`、`FinalAnswer`。

对外依赖：无内部依赖。

注意事项：transcript 格式不是稳定接口，reader 做了坏行跳过，但字段变化仍需适配。

### `src/sidecar/autostart.ts`

职责：sidecar 自动启动扩展点。当前是 no-op，保证 hook 链路不依赖 daemon。

关键导出：`ensureSidecar()`。

对外依赖：`session/store` 类型。

注意事项：后续实现 daemon 时替换这里即可。

### `src/types/*.ts`

职责：集中定义 Codex hook、Micat session state、rollup 输入输出类型。

关键导出：`CodexHookPayload`、`HookOutput`、`SessionMeta`、`Round`、`ActiveRule`、`RollupInput`、`RollupOutput`。

对外依赖：无内部依赖。

注意事项：这些类型是状态文件和 hook 输出契约的源头。

### `src/web/server.ts`

职责：启动 `micat serve` 本机 HTTP server，提供静态管理台和 JSON API。

关键导出：`startWebServer()`。

对外依赖：`config`、`session/store`、`rollup/runner`、`llm/openai-compatible`、`web/static`。

注意事项：默认只监听 `127.0.0.1`；API key 不在 config API 中明文返回；`POST /api/sessions/:id/rollup` 会真实触发 manual rollup。

### `src/web/static.ts`

职责：内嵌管理台 HTML/CSS/JS。页面支持 sessions、session detail、trace viewer、prompt editor、config editor 和 manual rollup。

关键导出：`INDEX_HTML`、`APP_CSS`、`APP_JS`。

对外依赖：无内部依赖。

注意事项：第一版不引入前端构建链；所有 UI 都由 `micat serve` 直接返回。

### `tests/hook-flow.test.ts`

职责：端到端测试 hook flow：`SessionStart -> UserPromptSubmit -> Stop -> PreCompact -> SessionStart(source=compact)`。

关键导出：无。

对外依赖：`hook/dispatch`。

注意事项：通过临时 `CODEX_HOME` 和 `base_url = "mock:"` 避免污染真实环境和外部模型依赖。

### `tests/configure.test.ts`

职责：验证 `writeConfigFile()` 会写入包含 direct `api_key` 和 `reasoning_effort` 的 toml，文件权限是 `0600`，且 `loadConfig()` 能读回。

关键导出：无。

对外依赖：`config/configure`、`config/load-config`。

注意事项：使用临时目录，不污染真实 `~/.codex/micat/config.toml`。

### `tests/llm-openai-compatible.test.ts`

职责：验证 OpenAI-compatible 请求体构造：设置 toml 或 `OPENAI_REASONING_EFFORT=high` 时请求 JSON 包含 `reasoning_effort: "high"`，未设置时不包含该字段；配置里的 key/effort 优先于 env。

关键导出：无。

对外依赖：`llm/openai-compatible`。

注意事项：用 mock `globalThis.fetch` 捕获请求体，不发真实网络请求。

## 5. 函数索引与算法实现

### `dispatchHook(payload: CodexHookPayload): Promise<HookOutput>`

算法：

1. 调用 `loadConfig()` 读取 Micat 配置。
2. 调用 `resolveSessionId()` 得到 session id。
3. 创建 `SessionStore`。
4. 根据 `payload.hook_event_name` 分派到对应 handler。
5. handler 抛错时写 `errors.jsonl` 并返回 `undefined`。

副作用：可能写 `~/.codex/micat/sessions/<session_id>/errors.jsonl`。

失败行为：错误被捕获并降级，不向 Codex 抛出。

### `runConfigWizard(options): Promise<ConfigWriteReport>`

算法：

1. 调用 `loadConfig()` 读取现有配置作为默认值。
2. 判断输入流是否为 TTY；TTY 使用 readline 逐项询问，非 TTY 一次读入多行用于脚本测试。
3. 依次获取 Base URL、Model、API key、Reasoning effort。
4. 校验 reasoning effort 是否为空或合法枚举。
5. 调用 `writeConfigFile()` 写入 toml。

副作用：读取 stdin，写 `~/.codex/micat/config.toml` 或指定配置文件。

失败行为：reasoning effort 非法、配置文件写入失败时抛错。

### `writeConfigFile(options): Promise<ConfigWriteReport>`

算法：

1. 解析配置文件路径，默认 `~/.codex/micat/config.toml`。
2. 校验 reasoning effort。
3. 调用 `renderConfigToml()` 生成 toml 文本。
4. 用 `atomicWriteFile(..., 0o600)` 写入并设置权限。
5. 返回不含明文 key 的配置报告。

副作用：写配置文件。

失败行为：非法 effort 或文件写入失败时抛错。

### `handleUserPromptSubmit(config, store, payload): Promise<HookOutput>`

算法：

1. 更新 `meta.json`。
2. 从 payload 中读取 `prompt` / `user_prompt` / `userPrompt`。
3. prompt 非空时追加到 `pending-user.jsonl`。
4. 读取 `active_rules.md`。
5. 构造 `additionalContext`，空规则则不输出。

副作用：写 `meta.json`、`pending-user.jsonl`。

失败行为：由 `dispatchHook()` 捕获并记录。

### `handleStop(config, store, payload): Promise<HookOutput>`

算法：

1. 更新 `meta.json`。
2. 调用 `readLatestFinalAnswer(transcript_path)`。
3. 没有 final answer 时直接返回。
4. 调用 `store.completeRound()` 合成 round。
5. 如果 `shouldScheduleRollup()` 为 true，执行一次 scheduled `runRollup()`。

副作用：写 `meta.json`、`rounds.jsonl`、`cursors.json`、可能写 `micat_context.md` 和 `active_rules.*`。

失败行为：由 `dispatchHook()` 捕获并记录。

### `handlePreCompact(config, store, payload): Promise<HookOutput>`

算法：

1. 更新 `meta.json`。
2. 调用 `runRollup(config, store, "precompact")`。
3. 用 `withTimeout()` 限制等待时间。
4. 出错时写 `errors.jsonl`。
5. 始终返回 `{ continue: true }`。

副作用：可能写 `micat_context.md`、`active_rules.*`、`cursors.json`、`errors.jsonl`。

失败行为：不阻止 Codex compact。

### `SessionStore.completeRound(finalAnswer, turnId): Promise<Round | null>`

算法：

1. 获取 session lock。
2. 读取 pending prompts 和 cursors。
3. 取 `pending_user_consumed` 指向的 user prompt。
4. 基于 session、prompt id、final answer 生成 round id。
5. 若 round id 已存在，返回 null。
6. 追加 round 到 `rounds.jsonl`。
7. 推进 `pending_user_consumed`。
8. 更新 `meta.rounds_completed`。

副作用：写 `rounds.jsonl`、`cursors.json`、`meta.json`。

失败行为：无 pending prompt 时返回 null。

### `runRollup(config, store, reason): Promise<boolean>`

算法：

1. 获取 session lock。
2. 读取 rounds 和 cursor。
3. 取尚未 rollup 的 rounds。
4. 没有新 rounds 时返回 false。
5. 读取旧 `micat_context` 和旧 active rules。
6. 加载 rollup prompt。
7. 调用 `runChatCompletion()`。
8. 解析模型输出。
9. 合并 active rules patch。
10. 写回 context、rules，并推进 rollup cursor。

副作用：写 `micat_context.md`、`active_rules.json`、`active_rules.md`、`cursors.json`、`meta.json`。

失败行为：解析或模型调用失败时抛出，由 handler/CLI 处理。

### `runChatCompletion(config, prompt, input): Promise<string>`

算法：

1. 如果 `base_url === "mock:"`，返回 deterministic JSON。
2. 调用 `readApiKey()` 读取 API key，toml direct 值优先，env fallback。
3. 调用 `buildChatCompletionRequestBody()` 构造 `/chat/completions` 请求体。
4. 设置超时 AbortController。
5. 校验 HTTP 状态。
6. 返回 `choices[0].message.content`。

副作用：真实模式发出 HTTP 请求。

失败行为：HTTP 非 2xx、空 content、超时都会抛错。

### `buildChatCompletionRequestBody(config, prompt, input): ChatCompletionRequestBody`

算法：

1. 调用 `readReasoningEffort()` 读取 reasoning effort，toml direct 值优先，env fallback。
2. 固定写入 `model`、system/user `messages`、`temperature: 0`。
3. 当 reasoning effort 存在时，追加 `reasoning_effort` 字段；不存在则完全省略。

副作用：无。

失败行为：`readReasoningEffort()` 发现非法值时抛错。

### `readReasoningEffort(config): string | undefined`

算法：

1. 先读取 `config.model.reasoning_effort`。
2. toml direct 值为空时，再读取 `config.model.reasoning_effort_env` 指向的环境变量。
3. 值为空时返回 `undefined`。
4. 非空值必须是 `none`、`minimal`、`low`、`medium`、`high`、`xhigh` 之一。
5. 合法时返回该值。

副作用：可能读取 `process.env`。

失败行为：非法值抛错，`PreCompact` 会记录错误并继续 compact。

### `readApiKey(config): string`

算法：

1. 先读取 `config.model.api_key`。
2. direct key 为空时，读取 `config.model.api_key_env` 指向的环境变量。
3. 两者都为空时返回空字符串。

副作用：可能读取 `process.env`。

失败行为：不抛错；空 key 会让请求不带 authorization header。

### `installNativeHooks(options): Promise<NativeHookReport>`

算法：

1. 计算 hooks 文件路径，默认 `~/.codex/hooks.json`。
2. 根据当前 entry path 构造命令：`"<node>" "<entry>" hook`。
3. 读取已有 hooks 文件；不存在则使用空 `{ hooks: {} }`。
4. 为 `SessionStart`、`UserPromptSubmit`、`Stop`、`PreCompact` 构造 Micat hook group。
5. 每个事件先移除已有 Micat group，保证幂等。
6. 追加新的 Micat group。
7. 按 Codex 官方 normalized hook identity 规则计算每个 Micat command hook 的 `trusted_hash`。
8. 非 dry-run 时原子写回 hooks 文件，并把 Micat-owned trust block 写入 `config.toml`。
9. 返回安装报告。

副作用：写 `~/.codex/hooks.json` 或指定 `--hooks-file`；写 `~/.codex/config.toml` 或指定 `codexConfigPath`。

失败行为：JSON 解析失败或写入失败时抛错。

### `uninstallNativeHooks(options): Promise<NativeHookReport>`

算法：

1. 读取 hooks 文件。
2. 遍历 Micat 使用的四个事件。
3. 删除 Micat group，保留其他 hook group。
4. 空事件数组从 hooks 表删除。
5. 移除 Micat-owned trust block。
6. 非 dry-run 时原子写回。
7. 返回卸载报告。

副作用：写 `~/.codex/hooks.json` 或指定 `--hooks-file`；写 `~/.codex/config.toml` 或指定 `codexConfigPath`。

失败行为：JSON 解析失败或写入失败时抛错。

### `inspectNativeHooks(options): Promise<NativeHookReport>`

算法：

1. 读取 hooks 文件。
2. 检查四个事件是否都存在 Micat group。
3. 重新计算 Micat hook hashes，并确认 `config.toml` 中 trust state 完整。
4. 返回 installed/trusted 状态和命令信息。

副作用：无。

失败行为：hooks 文件不存在视为未安装。

### `mergeActiveRules(existing, patch): ActiveRule[]`

算法：

1. 用已有规则 id 建 Map。
2. 对 patch 中每条 rule 做 normalize。
3. 用 normalize 后文本生成 sha256 id。
4. 已存在则更新 evidence、confidence、updated_at。
5. 不存在则创建新 ActiveRule。
6. 按 confidence 降序排序。

副作用：无。

失败行为：空 rule 被跳过。

### `readLatestFinalAnswer(transcriptPath): Promise<FinalAnswer | null>`

算法：

1. transcript path 为空则返回 null。
2. 读取 JSONL 文件。
3. 逐行 JSON parse，坏行跳过。
4. 只接受 `type=event_msg`、`payload.type=agent_message`、`payload.phase=final_answer`。
5. 不断覆盖 latest，最终返回最新 final answer。

副作用：无。

失败行为：文件不存在返回 null；其他读取错误抛出。

## 6. 完整数据流链路

### Flow A: 用户 prompt 捕获与注入

1. Codex `UserPromptSubmit` → `src/bin/micat.ts::main`
   - 入参：stdin JSON，包含 `session_id`、`turn_id`、`prompt`
   - 出参：hook JSON 或空 stdout
副作用：无
2. `main` → `hook/dispatch.ts::dispatchHook`
   - 入参：`CodexHookPayload`
   - 出参：`HookOutput`
   - 副作用：读取配置
3. `dispatchHook` → `user-prompt-submit.ts::handleUserPromptSubmit`
   - 入参：config、store、payload
   - 出参：`additionalContext | undefined`
   - 副作用：写 `meta.json`、`pending-user.jsonl`
4. `handleUserPromptSubmit` → `injector.ts::buildAdditionalContext`
   - 入参：hook event name、active rules markdown、max chars
   - 出参：Codex hook additionalContext JSON
   - 副作用：无

### Flow B: Stop 合成 round

1. Codex `Stop` → `dispatchHook`
   - 入参：payload 包含 `transcript_path`
   - 出参：空
   - 副作用：读取配置
2. `dispatchHook` → `stop.ts::handleStop`
   - 入参：config、store、payload
   - 出参：空
   - 副作用：写 meta
3. `handleStop` → `transcript-reader.ts::readLatestFinalAnswer`
   - 入参：transcript path
   - 出参：latest final answer
   - 副作用：读 transcript JSONL
4. `handleStop` → `store.ts::completeRound`
   - 入参：final answer、turn id
   - 出参：Round 或 null
   - 副作用：写 `rounds.jsonl`、推进 cursor
5. `handleStop` → `planner.ts::shouldScheduleRollup`
   - 入参：config、store
   - 出参：boolean
   - 副作用：读 rounds/cursors
6. `handleStop` → `runner.ts::runRollup`
   - 入参：config、store、`scheduled`
   - 出参：boolean
   - 副作用：达到阈值时压缩一批 `rollup.rounds` 轮对话

### Flow C: PreCompact 强制 rollup

1. Codex `PreCompact` → `dispatchHook`
   - 入参：payload 包含 `session_id`、`trigger`
   - 出参：`{ continue: true }`
   - 副作用：读取配置
2. `dispatchHook` → `pre-compact.ts::handlePreCompact`
   - 入参：config、store、payload
   - 出参：continue JSON
   - 副作用：写 meta、可能写 errors
3. `handlePreCompact` → `runner.ts::runAllPendingRollups`
   - 入参：config、store、reason
   - 出参：处理的批次数
   - 副作用：分批写 context/rules/cursors，直到没有待处理 rounds
4. `runRollup` → `openai-compatible.ts::runChatCompletion`
   - 入参：config、prompt、rollup input
   - 出参：raw JSON string
   - 副作用：mock 无；真实模式 HTTP 请求；如果 `OPENAI_REASONING_EFFORT` 有值，请求体包含 `reasoning_effort`
5. `runRollup` → `output-schema.ts::parseRollupOutput`
   - 入参：raw string
   - 出参：RollupOutput
   - 副作用：无
6. `runRollup` → `rule-merge.ts::mergeActiveRules`
   - 入参：旧规则、patch
   - 出参：新规则列表
   - 副作用：无
7. `runRollup` → `store.writeMicatContext` / `store.writeActiveRules` / `store.markRollupComplete`
   - 入参：新 context、规则、round count
   - 出参：void
   - 副作用：写 `micat_context.md`、`active_rules.*`、`cursors.json`

### Flow D: compact 后注入

1. Codex `SessionStart(source=compact)` → `dispatchHook`
   - 入参：payload source compact
   - 出参：additionalContext 或空
   - 副作用：读取配置
2. `dispatchHook` → `session-start.ts::handleSessionStart`
   - 入参：config、store、payload
   - 出参：additionalContext
   - 副作用：写 meta，调用 sidecar autostart no-op
3. `handleSessionStart` → `store.readActiveRulesMarkdown`
   - 入参：无
   - 出参：active rules markdown
   - 副作用：读 `active_rules.md`
4. `handleSessionStart` → `buildAdditionalContext`
   - 入参：active rules markdown
   - 出参：Codex developer context 注入 JSON
   - 副作用：无

### Flow E: native hooks 安装

1. 用户运行 `micat install` 或 `micat install-native-hooks` → `src/bin/micat.ts::main`
   - 入参：可选 `--dry-run`、`--hooks-file`
   - 出参：安装报告文本
   - 副作用：无或写 hooks/config 文件
2. `main` → `native-hooks/install.ts::installNativeHooks`
   - 入参：entry path、hooks path、dryRun
   - 出参：NativeHookReport
   - 副作用：读取并可能写入 `~/.codex/hooks.json` 和 `~/.codex/config.toml`
3. `installNativeHooks` → `atomic-write.ts::atomicWriteJson`
   - 入参：hooks 文件新内容
   - 出参：void
   - 副作用：原子替换 hooks 文件
4. `installNativeHooks` → `atomic-write.ts::atomicWriteFile`
   - 入参：带 Micat trust block 的 config.toml
   - 出参：void
   - 副作用：原子替换 Codex config 文件

### Flow F: 初始化配置

1. 用户运行 `micat config` 或 `micat init` → `src/bin/micat.ts::main`
   - 入参：交互式 stdin，依次为 base URL、model、API key、reasoning effort
   - 出参：配置报告文本，不包含明文 key
   - 副作用：可能写 `~/.codex/micat/config.toml`
2. `main` → `config/configure.ts::runConfigWizard`
   - 入参：可选 `--config`
   - 出参：ConfigWriteReport
   - 副作用：读取现有配置作为默认值，读取用户输入
3. `runConfigWizard` → `writeConfigFile`
   - 入参：ConfigWriteInput
   - 出参：ConfigWriteReport
   - 副作用：以 `0600` 权限写配置文件
4. `micat init` 额外调用 `installNativeHooks`
   - 入参：entry path、hooks path、dryRun
   - 出参：NativeHookReport
   - 副作用：非 dry-run 时安装 Codex hooks

## 7. 外部集成详情

### Codex Hooks

配置来源：

- plugin mode: `.codex-plugin/plugin.json` + `hooks/hooks.json`
- native fallback: `templates/native-hooks.snippet.json`

支持事件：

- `SessionStart`
- `UserPromptSubmit`
- `Stop`
- `PreCompact`

失败行为：

- handler 错误由 `dispatchHook` 捕获，写 `errors.jsonl`，hook 输出为空。
- `PreCompact` 错误由 handler 自己捕获，返回 `continue: true`。

### OpenAI-compatible LLM

配置来源：`~/.codex/micat/config.toml`

字段：

- `model.base_url`
- `model.api_key`
- `model.api_key_env`
- `model.reasoning_effort`
- `model.reasoning_effort_env`
- `model.model`
- `model.timeout_ms`

环境变量：

- `MICAT_API_KEY` / `OPENAI_API_KEY` 或配置指定的 key env：当 `model.api_key` 为空时作为 fallback。
- `OPENAI_REASONING_EFFORT` 或配置指定的 reasoning env：当 `model.reasoning_effort` 为空时作为 fallback。

失败行为：

- HTTP 非 2xx 抛错。
- 响应缺 content 抛错。
- 超时 AbortController 抛错。
- reasoning effort 非法值抛错。
- `PreCompact` 会记录错误但不阻塞 Codex。

## 8. 数据模型与契约

### `CodexHookPayload`

关键字段：

- `hook_event_name: string`
- `session_id?: string`
- `transcript_path?: string | null`
- `cwd?: string`
- `turn_id?: string`
- `source?: string`
- `trigger?: string`
- `prompt?: string`
- `user_prompt?: string`
- `userPrompt?: string`

### `MicatConfig`

关键字段：

- `model.base_url: string`
- `model.api_key: string`
- `model.api_key_env: string`
- `model.reasoning_effort: string`
- `model.reasoning_effort_env: string`
- `model.model: string`
- `model.timeout_ms: number`
- `rollup.rounds: number`
- `rollup.max_input_chars: number`
- `rollup.max_injected_chars: number`
- `rollup.precompact_timeout_ms: number`
- `prompts.rollup: string`
- `storage.root: string`

### `SessionMeta`

字段：

- `session_id: string`
- `cwd: string | null`
- `transcript_path: string | null`
- `created_at: string`
- `last_seen_at: string`
- `last_compact_at: string | null`
- `rounds_completed: number`
- `last_rollup_round: number`

### `Round`

字段：

- `id: string`
- `session_id: string`
- `turn_id: string | null`
- `user_prompt: string`
- `assistant_final_answer: string`
- `created_at: string`

### `ActiveRule`

字段：

- `id: string`
- `type: string`
- `rule: string`
- `evidence: string`
- `confidence: number`
- `created_at: string`
- `updated_at: string`

### `RollupOutput`

字段：

- `micat_context: string`
- `active_rules_patch: ActiveRulesPatchItem[]`

## 9. 风险与隐患登记册

- P1: transcript schema 变化会导致 `readLatestFinalAnswer` 抽不到 final answer。位置：`src/session/transcript-reader.ts::readLatestFinalAnswer`。触发条件：Codex JSONL 字段变化。建议：保留 transcript fixture，并增加真实 hook payload 捕获测试。
- P1: stale lock 可能阻塞 5 秒后失败。位置：`src/fs/file-lock.ts::withFileLock`。触发条件：hook 进程持锁崩溃。建议：后续加入 PID/mtime stale lock 清理。
- P1: scheduled rollup 现在在 `Stop` 中同步执行，可能让每第 N 轮结束后多等待一次 LLM 请求。位置：`src/hook/handlers/stop.ts::handleStop`。触发条件：模型响应慢或超时。建议：后续可改成真正的本地 worker。
- P2: TOML parser 只支持简单语法。位置：`src/config/load-config.ts::parseSimpleToml`。触发条件：用户使用数组、转义、复杂 TOML。建议：后续引入小型 TOML parser 或扩展 parser。
- P2: reasoning effort 配置填错会导致真实 rollup 失败。位置：`src/llm/openai-compatible.ts::readReasoningEffort`。触发条件：`model.reasoning_effort` 或 fallback env 不是允许枚举。建议：doctor 已输出解析状态；后续可把错误提示写入 README troubleshooting。
- P2: sidecar daemon 尚未实现。位置：`src/sidecar/autostart.ts::ensureSidecar`。触发条件：期待 scheduled rollup 后台执行而不是 Stop 同步执行。建议：下一阶段实现 daemon/worker；当前 `Stop`、`PreCompact` 和 manual rollup 已可用。
