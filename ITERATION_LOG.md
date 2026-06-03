# Micat Codebase Iteration Log

## [第1轮] 2026-05-28

### A. 本轮目标（阅读前声明）

**目标文件：**
- `ARCHITECTURE.md`（原因：实现必须以最新 plugin-first 架构为准）
- `PROJECT.md`（原因：确认 v1 范围和验收标准）
- `package.json` / `tsconfig.json` / `src/**`（原因：本轮将创建项目骨架）

**本轮想弄清楚：**
- v1 最小可运行链路需要哪些入口文件和核心模块。
- codebase 记录如何跟随新增源码同步。

### C. 本轮发现

**关键发现：** (verified) 当前项目只有设计文档，没有源码；实现应从 TypeScript/Node plugin-first 骨架开始。

**修订的旧结论：** 原先文档中存在旧式 `memory/` 目录建议；现在以 `ARCHITECTURE.md` 的 `.codex-plugin/`、`hooks/`、`src/hook`、`src/session`、`src/rollup`、`src/llm`、`src/fs` 分层为准。

**新疑问：** sidecar 是否在 v1 首轮做到完整 daemon，还是先实现 hook 内 fallback 和 job 记录。当前选择：先实现 fallback 和 job 记录，保留 sidecar 扩展点。

**更新了 CODEBASE.md：** §1、§2、§3 初稿。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `ARCHITECTURE.md` | PENDING | 深度完整 | 1 | 确认 plugin-first、native hook fallback、本机 session 级目标架构。 |
| `PROJECT.md` | PENDING | 深度完整 | 1 | 确认 v1 只做 session 级记忆、双摘要、compact 前强制 rollup。 |

**下一轮计划：** 新增源码后执行 SYNC，补齐文件级说明、核心函数索引和数据流。

## [SYNC] 2026-05-28

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/bin/micat.ts`（原因：hook/CLI 主入口）
- `src/hook/**/*.ts`（原因：Codex hook 分发与四个核心事件）
- `src/session/**/*.ts`（原因：session store、transcript reader、注入逻辑）
- `src/rollup/**/*.ts`（原因：rollup 主流程、输出解析、规则合并）
- `src/llm/**/*.ts`（原因：模型调用和 mock rollup）
- `src/config/**/*.ts`、`src/fs/**/*.ts`、`src/types/**/*.ts`（原因：配置、文件可靠性、数据契约）
- `tests/hook-flow.test.ts`（原因：端到端验证链路）

**本轮想弄清楚：**
- 新增源码是否覆盖 v1 最小链路。
- 构建和测试是否能证明 hook flow 可运行。
- CODEBASE 是否与实际目录同步。

### C. 本轮发现

**关键发现：** (verified) 已实现可构建的 TypeScript/Node 骨架，`UserPromptSubmit -> Stop -> PreCompact -> SessionStart(source=compact)` 端到端测试通过。

**修订的旧结论：** 原先 `ARCHITECTURE.md` 写 sidecar 为目标组件；当前代码确认 sidecar 仍是 no-op autostart，占位但不阻塞 v1 hook fallback。可用能力来自 `PreCompact` 进程内 rollup 和 manual rollup。

**新疑问：** native hook 自动安装和真正 sidecar daemon 仍未实现，需要下一阶段补。

**更新了 CODEBASE.md：** §1 到 §9 全面同步新增源码、数据流和风险。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/bin/micat.ts` | PENDING | 深度完整 | 1 | 确认 CLI/hook 统一入口和 stdout 约束。 |
| `src/hook/dispatch.ts` | PENDING | 深度完整 | 1 | 确认按 hook_event_name 分发并降级记录错误。 |
| `src/hook/handlers/session-start.ts` | PENDING | 深度完整 | 1 | 确认 SessionStart 初始化和 compact 后注入路径。 |
| `src/hook/handlers/user-prompt-submit.ts` | PENDING | 深度完整 | 1 | 确认 prompt 捕获和 active rules 注入。 |
| `src/hook/handlers/stop.ts` | PENDING | 深度完整 | 1 | 确认 final_answer 抽取、round 合成、scheduled job 记录。 |
| `src/hook/handlers/pre-compact.ts` | PENDING | 深度完整 | 1 | 确认强制 rollup、超时和失败降级。 |
| `src/session/store.ts` | PENDING | 深度完整 | 1 | 确认 session 文件状态、cursor、lock、active rules 写入。 |
| `src/session/transcript-reader.ts` | PENDING | 深度完整 | 1 | 确认只读取 agent_message final_answer。 |
| `src/session/injector.ts` | PENDING | 深度完整 | 1 | 确认 additionalContext 输出与截断。 |
| `src/session/resolver.ts` | PENDING | 深度完整 | 1 | 确认 session fallback 和 prompt 字段兼容。 |
| `src/rollup/runner.ts` | PENDING | 深度完整 | 1 | 确认 rollup 读写链和 cursor 推进。 |
| `src/rollup/rule-merge.ts` | PENDING | 深度完整 | 1 | 确认规则去重、合并和排序。 |
| `src/rollup/output-schema.ts` | PENDING | 深度完整 | 1 | 确认模型 JSON 输出解析。 |
| `src/rollup/planner.ts` | PENDING | 深度完整 | 1 | 确认 N 轮阈值判断。 |
| `src/llm/openai-compatible.ts` | PENDING | 深度完整 | 1 | 确认 mock 和真实 chat completions 路径。 |
| `src/llm/prompt-loader.ts` | PENDING | 深度完整 | 1 | 确认 prompt 文件缺失降级。 |
| `src/config/defaults.ts` | PENDING | 深度完整 | 1 | 确认默认 mock 配置和存储路径。 |
| `src/config/load-config.ts` | PENDING | 深度完整 | 1 | 确认简单 TOML 覆盖逻辑和局限。 |
| `src/fs/atomic-write.ts` | PENDING | 深度完整 | 1 | 确认临时文件 rename 写入策略。 |
| `src/fs/file-lock.ts` | PENDING | 深度完整 | 1 | 确认 5 秒锁等待和 stale lock 风险。 |
| `src/fs/jsonl.ts` | PENDING | 深度完整 | 1 | 确认 JSONL append/read 行为。 |
| `src/fs/paths.ts` | PENDING | 深度完整 | 1 | 确认 CODEX_HOME 优先路径策略。 |
| `src/sidecar/autostart.ts` | PENDING | 深度完整 | 1 | 确认 sidecar 当前为 no-op 扩展点。 |
| `src/types/codex-hook.ts` | PENDING | 深度完整 | 1 | 确认 hook payload/output 契约。 |
| `src/types/micat-state.ts` | PENDING | 深度完整 | 1 | 确认 session 文件状态契约。 |
| `src/types/rollup.ts` | PENDING | 深度完整 | 1 | 确认 rollup 输入输出契约。 |
| `tests/hook-flow.test.ts` | PENDING | 深度完整 | 1 | 确认端到端 fixture 覆盖核心 hook flow。 |

**验证记录：**
- `npm install`：通过，0 vulnerabilities。
- `npm test`：通过，1 个端到端测试通过。
- `node dist/src/bin/micat.mjs doctor`：通过，storage/model 状态 ok。

**下一轮计划：**
- 实现 `install-native-hooks` 的安全 merge。
- 实现真实 sidecar daemon 或先实现 job worker。

## [SYNC] 2026-05-28 native hooks

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/native-hooks/install.ts`（原因：让 Micat 能安装到本机 Codex hooks）
- `src/bin/micat.ts`（原因：新增 install/uninstall CLI）
- `src/doctor/doctor.ts`（原因：输出本机 hook 安装状态）
- `tests/native-hooks.test.ts`、`tests/hook-flow.test.ts`（原因：验证安装合并和测试日志）
- `README.md`（原因：给本机测试步骤）

**本轮想弄清楚：**
- Micat 是否能安全写入 `~/.codex/hooks.json` 并保留已有 hooks。
- 测试输出是否足够用户跟踪真实路径和注入内容。

### C. 本轮发现

**关键发现：** (verified) `install-native-hooks` 已实现并已在本机执行，`doctor` 显示 native hooks installed: yes。

**修订的旧结论：** `install-native-hooks` 不再是缺口；当前剩余主要缺口是 sidecar daemon 尚未实现。

**新疑问：** Codex 首次运行新 hook 时可能需要用户信任 hook；后续可在 README 中补充截图或日志说明。

**更新了 CODEBASE.md：** §2、§4、§5、§6、§9。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/native-hooks/install.ts` | PENDING | 深度完整 | 1 | 确认 install/uninstall/inspect 都保留既有 hooks 和 state。 |
| `src/bin/micat.ts` | 深度完整 | 深度完整 | 2 | 新增 install/uninstall CLI，输出安装报告。 |
| `src/doctor/doctor.ts` | 深度完整 | 深度完整 | 2 | 新增 native hooks path/installed/command/events 检查。 |
| `tests/native-hooks.test.ts` | PENDING | 深度完整 | 1 | 验证 merge 和 uninstall 不删除已有 Stop hook。 |
| `tests/hook-flow.test.ts` | 深度完整 | 深度完整 | 2 | 新增 CODEX_HOME、active_rules、additionalContext 日志。 |
| `README.md` | PENDING | 深度完整 | 1 | 记录测试、安装、卸载、运行数据位置。 |

**验证记录：**
- `npm test`：通过，2 个测试全部通过，测试输出包含路径、active rules、安装报告。
- `node dist/src/bin/micat.mjs install-native-hooks`：通过，写入 `/home/aseit/.codex/hooks.json`。
- `node dist/src/bin/micat.mjs doctor`：通过，显示 native_hooks.installed: yes。

**下一轮计划：**
- 实现 sidecar daemon/job worker，或先实现 scheduled job 的同步 worker 命令。

## [SYNC] 2026-05-28 reasoning effort

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/config/defaults.ts`（原因：新增 OpenAI reasoning effort 环境变量配置名）
- `src/llm/openai-compatible.ts`（原因：重构 chat completions 请求体并注入 `reasoning_effort`）
- `src/doctor/doctor.ts`（原因：输出 reasoning effort 的环境变量名和解析状态）
- `templates/config.default.toml`（原因：模板不应把密钥或 reasoning effort 值写死到 toml）
- `tests/llm-openai-compatible.test.ts`（原因：验证请求体真的携带 env 解析出的字段）

**本轮想弄清楚：**
- `OPENAI_REASONING_EFFORT=high` 是否能进入真实模型请求体。
- 未设置该环境变量时是否不会污染请求体。
- 配置模板是否只保留 env var 名，不保存 key 或 reasoning effort 值。

### C. 本轮发现

**关键发现：** (verified) OpenAI-compatible 请求体已改为单独构造，`OPENAI_REASONING_EFFORT=high` 时会写入 `reasoning_effort: "high"`，未设置时字段省略。

**修订的旧结论：** 配置文件继续使用 `~/.codex/micat/config.toml`，但真实密钥和 reasoning effort 实际值不写入 toml，只保存 env var 名。

**新疑问：** 每 N 轮 scheduled rollup 当前仍只写 `jobs.jsonl`，sidecar/worker 尚未消费；compact 前强制 rollup 已可用。

**更新了 CODEBASE.md：** §1、§2、§4、§5、§6、§7、§9。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/config/defaults.ts` | 深度完整 | 深度完整 | 2 | 新增 `reasoning_effort_env`，默认 `OPENAI_REASONING_EFFORT`。 |
| `src/llm/openai-compatible.ts` | 深度完整 | 深度完整 | 2 | 新增请求体构造函数和 reasoning effort env 校验。 |
| `src/doctor/doctor.ts` | 深度完整 | 深度完整 | 3 | doctor 输出 reasoning effort env 名和解析值。 |
| `templates/config.default.toml` | PENDING | 深度完整 | 1 | 模板改为 OpenAI 默认地址，key/effort 只配置 env 名。 |
| `tests/llm-openai-compatible.test.ts` | PENDING | 深度完整 | 1 | mock fetch 捕获请求体，验证带字段和省略字段两个分支。 |
| `README.md` | 深度完整 | 深度完整 | 2 | 增加真实模型 env 配置说明。 |

**验证记录：**
- `npm test`：通过，4 个测试全部通过；测试输出打印了 reasoning effort 请求体。
- `OPENAI_REASONING_EFFORT=high node dist/src/bin/micat.mjs doctor`：通过，doctor 显示 `model.reasoning_effort: high` 且 native hooks installed: yes。

**下一轮计划：**
- 实现 scheduled rollup job worker，补齐每 N 轮自动后台压缩能力。

## [SYNC] 2026-05-28 config cli

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/config/defaults.ts`（原因：配置模型需要支持 toml 直存 api key 和 reasoning effort）
- `src/config/load-config.ts`（原因：继续直接读取 `~/.codex/micat/config.toml`）
- `src/config/configure.ts`（原因：新增交互式 `micat config` 写入流程）
- `src/llm/openai-compatible.ts`（原因：真实请求优先读配置里的 key/effort）
- `src/bin/micat.ts`（原因：新增 `config`、`init`、`install` 等 CLI 入口）
- `src/doctor/doctor.ts`（原因：doctor 展示配置文件和 key/effort 来源）
- `templates/config.default.toml`、`README.md`（原因：用户使用方式从 shell env 改为 CLI 配置）
- `tests/**/*.test.ts`（原因：覆盖配置写入、请求体和兼容行为）

**本轮想弄清楚：**
- 用户是否可以通过 `micat config` 完成 url/key/model/effort 配置，不再依赖 shell env。
- `micat init` 是否可以串起配置和 Codex native hook 安装。
- 旧 env 配置是否仍能兼容。

### C. 本轮发现

**关键发现：** (verified) 已新增 `micat config` 和 `micat init`。`config` 会交互写入 `~/.codex/micat/config.toml`，包含 `api_key` 和可选 `reasoning_effort`；文件权限为 `0600`。`init` 会先配置，再安装 Codex native hooks。

**修订的旧结论：** 真实模型配置不再要求用户在启动 Codex 前 export env；toml direct 配置优先，env var 只作为兼容 fallback。

**新疑问：** npm 包发布后是否需要 postinstall 自动提示 `micat init`，当前没有做安装后自动改 hooks，避免 npm install 产生隐式写 `~/.codex/hooks.json` 的副作用。

**更新了 CODEBASE.md：** §1、§2、§4、§5、§6、§7、§8、§9。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/config/defaults.ts` | 深度完整 | 深度完整 | 3 | `MicatConfig` 增加 direct `api_key` 和 `reasoning_effort`。 |
| `src/config/load-config.ts` | 深度完整 | 深度完整 | 2 | 导出默认 config path；quoted scalar 支持 JSON parse。 |
| `src/config/configure.ts` | PENDING | 深度完整 | 1 | 新增配置向导、非 TTY 脚本输入、toml 渲染和 0600 写入。 |
| `src/llm/openai-compatible.ts` | 深度完整 | 深度完整 | 3 | API key 和 reasoning effort 改为 toml direct 优先，env fallback。 |
| `src/bin/micat.ts` | 深度完整 | 深度完整 | 3 | 新增 `config`、`init`、`install`、`sessions`、`rules`、`context` 命令。 |
| `src/doctor/doctor.ts` | 深度完整 | 深度完整 | 4 | doctor 显示 config path、key 是否配置、reasoning effort。 |
| `src/fs/atomic-write.ts` | 深度完整 | 深度完整 | 2 | 支持写入后 chmod，用于保护配置文件。 |
| `templates/config.default.toml` | 深度完整 | 深度完整 | 2 | 模板增加 direct `api_key` 和 `reasoning_effort` 字段。 |
| `tests/configure.test.ts` | PENDING | 深度完整 | 1 | 验证 toml 写入、0600 权限和配置读回。 |
| `tests/llm-openai-compatible.test.ts` | 深度完整 | 深度完整 | 2 | 增加 direct config 优先于 env 的请求测试。 |
| `README.md` | 深度完整 | 深度完整 | 3 | 更新为 `npm install -g micat` / `micat init` / 查询命令用法。 |

**验证记录：**
- `npm test`：通过，6 个测试全部通过。
- `node dist/src/bin/micat.mjs config --config <tmp>` 通过，生成 `0600` 配置文件并写入 direct key/effort。
- `node dist/src/bin/micat.mjs init --dry-run --config <tmp> --hooks-file <tmp>` 通过，配置流程和 hook 安装 dry-run 报告正常。
- `node dist/src/bin/micat.mjs doctor`：通过，显示 config path、key 状态、native hooks installed: yes。

**下一轮计划：**
- 发布 npm 包前补 package files / postinstall 提示策略。
- 实现 scheduled rollup job worker。

## [SYNC] 2026-05-28 codex trust state / no-omx

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/native-hooks/install.ts`（原因：Codex 官方 unmanaged hooks 需要 `config.toml` 的 `hooks.state` 信任哈希）
- `src/bin/micat.ts`（原因：安装报告需要显示 config/trusted 状态）
- `src/doctor/doctor.ts`（原因：doctor 需要证明 Micat hook 已安装且被 Codex 信任）
- `tests/native-hooks.test.ts`（原因：锁定 hooks.json + config.toml trust state 写入/卸载行为）
- `README.md`、`ARCHITECTURE.md`、`CODEBASE.md`（原因：同步官方 hook 信任机制结论）

**本轮想弄清楚：**
- 去掉 oh-my-codex 后，纯 Codex native hooks 是否能自动触发 Micat。
- Micat 安装时是否应该写 `hooks.json` 顶层 `state`，还是写 Codex 官方 `config.toml hooks.state`。

### C. 本轮发现

**关键发现：** (verified) Codex 官方实现只从 `hooks.json` 读取 hook 声明；unmanaged hook 的信任状态来自 `config.toml` 的 `hooks.state."<source>:<event>:<group>:<handler>".trusted_hash`。旧的 `hooks.json.state` 对当前 Codex 不生效。

**修订的旧结论：** `micat install` 不只写 `~/.codex/hooks.json`，还必须按 Codex normalized hook identity 规则计算并写入 `~/.codex/config.toml` 的 Micat-owned trust block。

**环境处理：** 已移除 oh-my-codex 全局接入面：卸载 npm global `oh-my-codex`、移除 `omx` 命令、清理 `~/.codex/config.toml` 的 OMX 注入/信任状态、移走 `~/.codex/AGENTS.md` 和 workspace `oh-my-codex` 到备份目录。

**更新了 CODEBASE.md：** §2、§4、§6、§7。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/native-hooks/install.ts` | 深度完整 | 深度完整 | 2 | 新增 Codex trust hash 计算、config.toml trust block 写入、inspect trusted 检查。 |
| `src/bin/micat.ts` | 深度完整 | 深度完整 | 4 | 安装报告新增 `codex_config.path`、`codex_config.changed`、`trusted`。 |
| `src/doctor/doctor.ts` | 深度完整 | 深度完整 | 5 | doctor 输出 native hook trust 状态。 |
| `tests/native-hooks.test.ts` | 深度完整 | 深度完整 | 2 | 验证 trust state 写入和卸载清理。 |
| `README.md` | 深度完整 | 深度完整 | 4 | 说明 Micat 自动写 hooks.state 信任哈希。 |
| `ARCHITECTURE.md` | 深度完整 | 深度完整 | 2 | native hooks 形态补充 config.toml trust state。 |

**验证记录：**
- `npm test`：通过，7 个测试全部通过。
- `npm install -g .`：通过，本机 `micat` 已更新。
- `micat install && micat doctor`：通过，`native_hooks.installed: yes` 且 `native_hooks.trusted: yes`。
- `codex exec --skip-git-repo-check -C /home/aseit/桌面/桌面/Micat -s read-only --output-last-message <tmp> 'Micat hook smoke test. Reply exactly: OK'`：通过，Codex 输出 `hook: SessionStart/UserPromptSubmit/Stop Completed`。
- `micat sessions`：通过，新 session `019e6e12-b148-7a31-8a5d-f24aba3196d7` 记录 `rounds=1`，`rounds.jsonl` 捕获用户 prompt 和助手 final answer。

**下一轮计划：**
- 如需继续，补 `micat trust`/`micat repair` 命令，让用户在 hooks 被手工改动后可单独重建 trust state。

## [SYNC] 2026-05-29 rolling rollup batches

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/rollup/runner.ts`（原因：把 rollup 改成每批最多 `rollup.rounds` 轮）
- `src/hook/handlers/stop.ts`（原因：达到 N 轮后实际执行 scheduled rollup）
- `src/hook/handlers/pre-compact.ts`（原因：compact 前分批清空积压）
- `src/bin/micat.ts`（原因：手动 `micat rollup` 也应清空积压）
- `tests/rollup-runner.test.ts`（原因：证明 12 轮按 5/5/2 分批，且后一批读取前一批 context）
- `prompts/rollup.default.md`、`~/.codex/micat/prompts/rollup.md`（原因：提示词明确两个压缩产物边界）
- `README.md`、`CODEBASE.md`（原因：同步当前机制）

**本轮想弄清楚：**
- Micat 是否只把最新一小批 rounds 传给 LLM。
- 旧对话是否通过 `micat_context` 滚动压缩传递。
- active rules 和 Micat 自用上下文是否保持分离。

### C. 本轮发现

**关键发现：** (verified) 已实现滚动批处理：`runRollup()` 一次最多处理 `rollup.rounds` 轮；`runAllPendingRollups()` 会循环清空积压；`PreCompact` 和 manual rollup 使用 drain；`Stop` 达到阈值后实际执行一次 scheduled rollup。

**修订的旧结论：** scheduled rollup 不再只是写 `jobs.jsonl`。`jobs.jsonl` 不再是当前 scheduled 路径的必要机制，sidecar 仍是后续可选优化。

**新疑问：** 真实 sicbot 请求在一次 1 轮 manual rollup 验证中触发 `AbortError`，疑似模型响应超过当前 `timeout_ms = 20000` 或接口兼容/模型响应问题；本轮未改模型协议。

**更新了 CODEBASE.md：** §1、§4、§7、§9。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/rollup/runner.ts` | 深度完整 | 深度完整 | 2 | 新增固定批处理和 drain。 |
| `src/hook/handlers/stop.ts` | 深度完整 | 深度完整 | 2 | 达到阈值后同步执行 scheduled rollup，失败写 errors。 |
| `src/hook/handlers/pre-compact.ts` | 深度完整 | 深度完整 | 2 | compact 前清空所有 pending batches。 |
| `src/bin/micat.ts` | 深度完整 | 深度完整 | 5 | manual rollup 改成 drain，并输出批次数。 |
| `tests/rollup-runner.test.ts` | PENDING | 深度完整 | 1 | 新增 scheduled 阈值和 12 轮 5/5/2 drain 测试。 |
| `prompts/rollup.default.md` | 深度完整 | 深度完整 | 2 | 明确 `micat_context` 不注入 Codex，`active_rules_patch` 才进入规则库。 |

**验证记录：**
- `npm test`：通过，9 个测试全部通过。
- `npm install -g .`：通过。
- `micat doctor`：通过，base_url 使用用户配置的 OpenAI-compatible endpoint，native hooks installed/trusted。
- `micat rollup --session 019e6c90-7db7-7462-8106-c395c8c505c7`：未通过，真实 LLM 请求 `AbortError`；本地滚动机制测试通过。

**下一轮计划：**
- 诊断 sicbot `/chat/completions` 超时/协议兼容问题，必要时支持 Responses API 或提高 timeout。

## [SYNC] 2026-05-29 local console and trace viewer

### A. 本轮目标（阅读前声明）

**目标文件：**
- `src/rollup/runner.ts`、`src/session/store.ts`、`src/types/rollup.ts`（原因：新增 `traces.jsonl` 可观测数据）
- `src/web/server.ts`、`src/web/static.ts`（原因：新增本机管理台和 API）
- `src/bin/micat.ts`（原因：新增 `micat serve` 命令）
- `tests/web-server.test.ts`、`tests/rollup-runner.test.ts`（原因：验证管理台 API 和 trace 落盘）
- `README.md`、`ARCHITECTURE.md`、`CODEBASE.md`（原因：同步本机管理台能力）

**本轮想弄清楚：**
- 用户是否能通过网页查看 sessions、rounds、rules、context、errors 和 traces。
- 用户是否能在网页里编辑 rollup prompt 并手动触发 rollup。
- 每次 rollup 是否都有完整 trace 可用于优化提示词。

### C. 本轮发现

**关键发现：** (verified) 已新增 `micat serve` 本机管理台，默认 `http://127.0.0.1:17877`。管理台提供 session list、session detail、rollup trace viewer、prompt editor、config editor 和 manual rollup。

**修订的旧结论：** Micat 不再是纯黑箱 CLI/hook 工具；核心 hook 链路仍自动运行，但可通过本机 Web console 做 debug 和提示词优化。

**新增状态文件：** `traces.jsonl`。每条 trace 记录 reason、status、batch、LLM input、raw output、parsed output、merged rules 或 error。

**更新了 CODEBASE.md：** §1、§2、§4。

**覆盖进度更新：**

| 文件 | 前状态 | 现状态 | 阅读次数 | 备注 |
|---|---|---|---:|---|
| `src/types/rollup.ts` | 深度完整 | 深度完整 | 3 | 新增 `RollupTrace`。 |
| `src/session/store.ts` | 深度完整 | 深度完整 | 3 | 新增 `appendTrace()` / `readTraces()`。 |
| `src/rollup/runner.ts` | 深度完整 | 深度完整 | 3 | 成功/失败 rollup 都写 trace。 |
| `src/web/server.ts` | PENDING | 深度完整 | 1 | 新增 localhost HTTP server 和 API。 |
| `src/web/static.ts` | PENDING | 深度完整 | 1 | 新增无构建链管理台 UI。 |
| `src/bin/micat.ts` | 深度完整 | 深度完整 | 6 | 新增 `serve` 命令。 |
| `tests/web-server.test.ts` | PENDING | 深度完整 | 1 | 覆盖 sessions/prompt/manual rollup/traces API。 |

**验证记录：**
- `npm test`：通过，10 个测试全部通过。
- `npm install -g .`：通过。
- `micat serve --port 17877`：通过，启动 `http://127.0.0.1:17877`。
- HTTP smoke：`/`、`/api/config`、`/api/sessions`、`/api/prompt` 均返回 200。

**下一轮计划：**
- 用浏览器做视觉/交互验收；如要继续增强，补 session 搜索、trace diff、规则启停编辑。
