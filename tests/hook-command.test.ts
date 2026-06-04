import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

test("hook command logs invalid payloads without failing Codex hook execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-hook-command-"));
  const entry = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "bin", "micat.mjs");
  const result = await runNode(entry, ["hook"], {
    input: "{bad json",
    env: { ...process.env, CODEX_HOME: root },
  });

  console.log(`[micat-test] invalid hook exit=${result.code} stderr=${JSON.stringify(result.stderr)}`);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");

  const errors = await readFile(join(root, "micat", "hook-errors.jsonl"), "utf8");
  assert.match(errors, /hook-payload-parse/);
  assert.match(errors, /raw_input_length/);
});

function runNode(
  entry: string,
  args: string[],
  options: { input: string; env: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}
