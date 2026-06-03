# Micat

Micat 是一个轻量的、本机运行的 Codex session 执行策略记忆插件。它通过 Codex hooks 自动记录用户消息和助手最终回复，滚动提取“用户纠正 agent 怎么做事”的规则，并在后续对话或 compact 后重新注入给 Codex。

它不是通用 memory，不保存完整项目事实，也不替代 `AGENTS.md`、skills 或当前用户指令。Micat 只解决一个很具体的问题：长对话、反复 compact、跨很多轮开发时，用户已经纠正过的执行策略容易丢失，导致 agent 重复犯同类错误。

## 项目从什么问题触发

Micat 的触发点是 Codex 长 session 的上下文丢失问题。

在一个长期项目里，用户会不断纠正 agent 的做事方式：

- 这个项目里先生成视觉方案，再写 plan，等我审核后再改代码。
- 管理台入口应该放到项目管理页，不要做成全局入口。
- 渲染预览应该独立窗口展示，不要塞在文件下方。
- 测试失败时先跑最小验证命令，不要直接全量重跑。
- compact 之后仍然要记住这些执行约束。

这些话很重要，但它们通常又很零碎：

- 不一定值得马上整理成 skill。
- 不一定适合写进 `AGENTS.md`。
- 用户也不可能每次都说“把这条记住”。
- 对话一长，compact 多几次后，Codex 很容易忘掉这些小规则。

Micat 就是为了解决这个痛点：用户自然聊天时提出的执行策略纠正，可以被本机小模型自动抽取、滚动更新，并在后续 session 上下文里继续传递。

## 它具体解决什么问题

Micat 解决的是“执行策略记忆”，不是“项目知识库”。

它要保住的是这类信息：

- 用户纠正过 agent 下一步该怎么执行。
- 用户纠正过当前项目里某类任务应该优先看什么、先跑什么、不要改什么。
- 用户纠正过某个功能或页面的交互决策，并且后续执行还应该遵守。
- compact 前后的规则连续性。

它不负责这些事：

- 不保存完整聊天记录给 Codex 复读。
- 不替代项目文档、需求文档、`AGENTS.md` 或 skills。
- 不把普通事实、一次性任务、助手自我总结都当成长期规则。

## 为什么说它轻量

Micat 只做一件事：从用户纠正里提取执行策略，并在合适时机注入给 Codex。

- 不常驻大型服务。hooks 触发时才执行采集或 rollup，Web 管理台只有运行 `micat serve` 时才启动。
- 不依赖数据库、向量库或云端存储。所有数据默认放在 `~/.codex/micat`。
- 不记录 Codex 的完整工作过程。默认只关心 user message 和 assistant final answer。
- 不接管 Codex。它只是通过 hooks 给 Codex 补充一小段执行规则上下文。
- 模型可自配。你可以用任意 OpenAI-compatible 小模型做规则抽取。

## 快速安装与 Web 配置

普通用户推荐直接从 npm 安装：

```bash
npm install -g @angerdeep/micat
micat init
micat doctor
micat serve
```

然后打开：

```text
http://127.0.0.1:17877
```

第一次配置时，`micat init` 会询问：

```text
Base URL
Model
API key
Reasoning effort
```

Web 管理台里可以继续做这些事：

- 在 `Config` 页面修改模型地址、模型名、超时时间和 rollup 参数。
- 点击 `Test LLM`，发送“你好”确认模型能返回。
- 在 `Prompt` 页面编辑规则抽取提示词。
- 在 `Session` 页面查看 rounds、traces、rules、context、errors。
- 对单个 session 手动触发 rollup，方便调试提示词。

如果端口被占用：

```bash
micat serve --port 17888
```

## Micat 记录什么

Micat 主要抽取三类规则：

- `agent_behavior_strategy`：用户纠正 agent 怎么工作。比如先出图、再写 plan、等审核后再改代码。
- `project_correction_instruction`：用户纠正当前项目或功能的要求。只在当前项目语境下使用。
- `interaction_behavior_correction`：用户纠正产品交互方式。比如入口位置、窗口组织、展示方式。

Micat 不应该记录：

- 一次性任务目标。
- 普通项目事实。
- 代码实现细节。
- 密钥、token、隐私信息。
- 只有助手自己声称完成的事情。

## 前置要求

- Node.js `>= 20`
- 本机已安装 Codex CLI
- Codex CLI 支持 native hooks，并且能触发 `SessionStart`、`UserPromptSubmit`、`Stop`、`PreCompact`
- 一个 OpenAI-compatible LLM API：
  - `base_url`
  - `api_key`
  - `model`

Micat 默认只监听本机地址，不会启动公网服务。

## 版本和平台差异

### Node.js

Micat 要求 Node.js `>= 20`。如果 Node 版本太低，先升级 Node，再安装 Micat。

### Codex CLI

Micat 依赖 Codex native hooks：

- `UserPromptSubmit`：捕获用户输入。
- `Stop`：捕获助手最终回复。
- `PreCompact`：compact 前强制做一次 rollup。
- `SessionStart`：session 启动、恢复或 compact 后注入规则。

如果你的 Codex CLI 版本不支持这些 hooks，Micat 不能完整自动工作。先升级 Codex CLI，然后运行：

```bash
micat doctor
```

确认 hooks 已安装并被 trust。

### Linux / macOS / Windows

Micat 本身是 Node.js CLI，核心逻辑不绑定 Linux。

- Linux：当前主要验证环境，推荐优先使用。
- macOS：理论上和 Linux 一样使用，路径仍然在 `~/.codex/micat`。
- Windows：可以使用，但依赖你本机的 Codex CLI 是否支持 native hooks。配置目录通常在 `%USERPROFILE%\.codex\micat`。安装后一定要运行 `micat doctor` 检查。
- WSL：按 Linux 处理。注意 WSL 里的 Codex 和 Windows 里的 Codex 是两套环境，hooks 和数据目录不会自动共享。

## 安装方式 A：从 npm 安装

适合普通用户使用。

```bash
npm install -g @angerdeep/micat
```

确认安装：

```bash
micat --help
```

## 安装方式 B：从源码安装

适合本地开发或还没发布 npm 时使用。

```bash
git clone https://github.com/AngerDark01/codex-micat.git
cd codex-micat
npm install
npm run build
npm install -g .
```

确认命令可用：

```bash
micat --help
```

## 第一次初始化

运行：

```bash
micat init
```

它会依次询问：

```text
Base URL
Model
API key
Reasoning effort
```

示例：

```text
Base URL: https://api.openai.com/v1
Model: gpt-5.4
API key: sk-...
Reasoning effort: high
```

`Reasoning effort` 可以留空，也可以填：

```text
none / minimal / low / medium / high / xhigh
```

初始化会做两件事：

- 写入配置：`~/.codex/micat/config.toml`
- 安装 Codex native hooks：`~/.codex/hooks.json`

配置文件权限会设置为 `0600`，API key 不会在 Web 管理台明文展示。

## 检查安装状态

运行：

```bash
micat doctor
```

正常时应该看到类似：

```text
native_hooks.installed: yes
native_hooks.trusted: yes
status: ok
```

如果没有看到 trusted，重新执行：

```bash
micat install
micat doctor
```

## 配置 LLM

推荐用交互式命令：

```bash
micat config
```

也可以直接编辑：

```text
~/.codex/micat/config.toml
```

典型配置：

```toml
[model]
base_url = "https://api.openai.com/v1"
api_key = "sk-..."
api_key_env = "MICAT_API_KEY"
reasoning_effort = "high"
reasoning_effort_env = "OPENAI_REASONING_EFFORT"
model = "gpt-5.4"
timeout_ms = 300000

[rollup]
rounds = 5
max_backfill_rounds = 100
max_input_chars = 30000
max_injected_chars = 8000
precompact_timeout_ms = 300000

[prompts]
rollup = "~/.codex/micat/prompts/rollup.md"

[storage]
root = "~/.codex/micat"
```

常用参数：

- `timeout_ms`：单次 LLM 请求超时，默认 5 分钟。
- `rounds`：每批压缩多少轮对话，默认 5。
- `max_backfill_rounds`：老 session 最多回溯多少轮，默认 100。
- `max_injected_chars`：注入 Codex 的最大字符数。
- `precompact_timeout_ms`：compact 前强制压缩的总超时。

## 启动 Web 管理台

运行：

```bash
micat serve
```

打开：

```text
http://127.0.0.1:17877
```

管理台可以做这些事：

- 查看所有 Codex session。
- 查看每个 session 的 rounds、traces、errors。
- 查看 `micat_context.md`。
- 查看 `active_rules.md/json`。
- 编辑 rollup prompt。
- 修改非敏感配置。
- 手动触发某个 session 的 rollup。
- 点击 `Test LLM`，发送“你好”测试模型是否能正确返回。

如果端口被占用，Micat 会尝试后续端口；也可以指定：

```bash
micat serve --port 17888
```

## 如何验证能用

按下面顺序检查：

1. 检查 hooks：

```bash
micat doctor
```

2. 启动管理台：

```bash
micat serve
```

3. 打开浏览器：

```text
http://127.0.0.1:17877
```

4. 进入 `Config` 页面，点击 `Test LLM`。

成功时会看到模型回复，比如：

```text
Reply: 你好，我已收到。
```

5. 新开一个 Codex session，说几轮带有纠正性质的话。

6. 回到管理台，看 session 是否出现 rounds 和 traces。

## 常用命令

```bash
# 查看安装状态
micat doctor

# 重新配置模型
micat config

# 启动 Web 管理台
micat serve

# 查看 session 列表
micat sessions

# 查看某个 session 的规则
micat rules <session_id>

# 查看某个 session 的滚动上下文
micat context <session_id>

# 手动压缩某个 session
micat rollup --session <session_id>

# 重新安装 hooks
micat install

# 卸载 hooks
micat uninstall-native-hooks
```

## 数据存在哪里

默认目录：

```text
~/.codex/micat/
```

每个 session 一个目录：

```text
~/.codex/micat/sessions/<session_id>/
```

重要文件：

- `pending-user.jsonl`：已捕获但还没配对 final answer 的用户消息。
- `rounds.jsonl`：用户消息 + assistant final answer。
- `micat_context.md`：给 Micat 自己看的滚动摘要。
- `active_rules.md`：注入给 Codex 的可读规则。
- `active_rules.json`：结构化规则。
- `traces.jsonl`：每次 rollup 的输入、输出、错误。
- `errors.jsonl`：hook 或 rollup 错误。

## Prompt 在哪里改

默认路径：

```text
~/.codex/micat/prompts/rollup.md
```

Micat 的 npm 包内置了默认 prompt：`prompts/rollup.default.md`。运行 `micat init` 或 `micat config` 时，如果本地还没有 `rollup.md`，Micat 会自动把内置 prompt 写入这个默认路径。运行时如果本地 prompt 缺失，也会回退读取包内置 prompt。

你可以直接编辑这个文件，也可以在 Web 管理台的 `Prompt` 页面编辑。

Prompt 的目标是让小模型判断：

- 哪些是 agent 执行策略。
- 哪些是当前项目修正指令。
- 哪些是交互行为修正。
- 哪些只是一次性任务，不应该保存。

## 工作机制

Micat 会生成两个产物：

```text
micat_context.md
active_rules.md/json
```

区别：

- `micat_context.md` 给 Micat 自己看，用来理解旧对话背景。
- `active_rules.md/json` 给 Codex 看，只包含可执行规则。

注入时 Micat 会包一层说明：

```text
Micat is not a general memory system...
Use these rules as execution guidance when relevant...
```

这样 Codex 会知道这些内容不是完整项目记忆，也不是事实来源，只是用户纠正过的执行规则。

## 卸载

只卸载 hooks：

```bash
micat uninstall-native-hooks
```

删除 Micat 配置和数据：

```bash
rm -rf ~/.codex/micat
```

如果是全局 npm 安装：

```bash
npm uninstall -g @angerdeep/micat
```

如果是源码全局安装，可以在源码目录执行：

```bash
npm uninstall -g @angerdeep/micat
```

## 常见问题

### `micat doctor` 显示 hooks 没安装

执行：

```bash
micat install
micat doctor
```

### Web 页面打不开

先确认服务是否启动：

```bash
micat serve
```

如果 `17877` 被占用：

```bash
micat serve --port 17888
```

### `Test LLM` 失败

检查：

- `base_url` 是否是 OpenAI-compatible endpoint。
- `api_key` 是否正确。
- `model` 是否存在。
- 网络是否能访问该服务。
- `timeout_ms` 是否太短。

### session 一直显示历史 error

管理台会区分：

- `latest ok`：最新 rollup 成功。
- `latest error`：最新 rollup 失败。
- `old errors N`：历史曾经报错，但不代表当前仍失败。

进入 session 详情的 `Traces` 和 `Errors` 可以查看具体原因。

## 本地开发

```bash
npm install
npm run build
npm test
node dist/src/bin/micat.mjs doctor
```

本地开发时重新安装全局命令：

```bash
npm install -g .
```
