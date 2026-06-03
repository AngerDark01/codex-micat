import type { MicatConfig } from "../config/defaults.js";
import type { RollupInput, RollupOutput } from "../types/rollup.js";

const VALID_REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);

type ChatMessage = { role: "system" | "user"; content: string };

interface ChatCompletionRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  reasoning_effort?: string;
}

export async function runChatCompletion(
  config: MicatConfig,
  prompt: string,
  input: RollupInput,
): Promise<string> {
  if (config.model.base_url === "mock:") {
    return JSON.stringify(mockRollup(input));
  }

  return sendChatCompletionRequest(config, [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input, null, 2) },
  ]);
}

export async function runConnectivityCheck(config: MicatConfig): Promise<string> {
  if (config.model.base_url === "mock:") {
    return "你好，Micat mock LLM 已收到。";
  }

  return sendChatCompletionRequest(config, [
    {
      role: "system",
      content: "你是 Micat 的 LLM 连通性测试助手。请用一句中文简短回复，明确说明你收到了用户的问候。",
    },
    { role: "user", content: "你好" },
  ]);
}

async function sendChatCompletionRequest(config: MicatConfig, messages: ChatMessage[]): Promise<string> {
  const apiKey = readApiKey(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.model.timeout_ms);
  try {
    const body = buildChatCompletionMessagesRequestBody(config, messages);
    const response = await fetch(`${config.model.base_url.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM response missing choices[0].message.content");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildChatCompletionRequestBody(
  config: MicatConfig,
  prompt: string,
  input: RollupInput,
): ChatCompletionRequestBody {
  return buildChatCompletionMessagesRequestBody(config, [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input, null, 2) },
  ]);
}

function buildChatCompletionMessagesRequestBody(
  config: MicatConfig,
  messages: ChatMessage[],
): ChatCompletionRequestBody {
  const reasoningEffort = readReasoningEffort(config);
  return {
    model: config.model.model,
    messages,
    temperature: 0,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  };
}

export function readReasoningEffort(config: MicatConfig): string | undefined {
  const configured = config.model.reasoning_effort.trim();
  if (configured) return validateReasoningEffort(configured, "model.reasoning_effort");
  const envName = config.model.reasoning_effort_env.trim();
  if (!envName) return undefined;
  const value = process.env[envName]?.trim();
  if (!value) return undefined;
  return validateReasoningEffort(value, envName);
}

export function readApiKey(config: MicatConfig): string {
  const configured = config.model.api_key.trim();
  if (configured) return configured;
  const envName = config.model.api_key_env.trim();
  return envName ? (process.env[envName]?.trim() ?? "") : "";
}

function validateReasoningEffort(value: string, source: string): string {
  if (VALID_REASONING_EFFORTS.has(value)) return value;
  throw new Error(`Invalid ${source}: expected one of ${Array.from(VALID_REASONING_EFFORTS).join(", ")}`);
}

function mockRollup(input: RollupInput): RollupOutput {
  const latest = input.recent_rounds.at(-1);
  const rule = latest
    ? `用户纠正或约束 agent 执行策略：${latest.user_prompt.slice(0, 80)}`
    : "没有新的执行策略规则。";
  return {
    micat_context: [
      input.previous_micat_context.trim(),
      latest ? `最近一轮：用户要求「${latest.user_prompt.slice(0, 120)}」；助手最终回复「${latest.assistant_final_answer.slice(0, 120)}」。` : "",
    ].filter(Boolean).join("\n"),
    active_rules_patch: latest
      ? [{ type: "execution_rule", rule, evidence: latest.id, confidence: 0.6 }]
      : [],
  };
}
