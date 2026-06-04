import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { installNativeHooks, inspectNativeHooks, uninstallNativeHooks } from "../src/native-hooks/install.js";

test("native hook installer merges and removes Micat hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-hooks-test-"));
  const hooksPath = join(root, "hooks.json");
  const codexConfigPath = join(root, "config.toml");
  const entryPath = join(root, "dist", "src", "bin", "micat.mjs");
  console.log(`[micat-test] hooksPath=${hooksPath}`);

  await writeFile(
    hooksPath,
    JSON.stringify({
      state: { keep: true },
      hooks: {
        Stop: [
          {
            hooks: [{ type: "command", command: "echo keep" }],
          },
        ],
      },
    }, null, 2),
    "utf8",
  );

  const install = await installNativeHooks({ hooksPath, codexConfigPath, entryPath });
  console.log(`[micat-test] install report=${JSON.stringify(install)}`);
  assert.equal(install.changed, true);
  assert.equal(install.configChanged, true);
  assert.equal(install.trusted, true);

  const installed = await inspectNativeHooks({ hooksPath, codexConfigPath, entryPath });
  assert.equal(installed.installed, true);
  assert.equal(installed.trusted, true);

  const file = JSON.parse(await readFile(hooksPath, "utf8")) as {
    state: unknown;
    hooks: Record<string, Array<{ hooks: Array<{ command: string; timeout?: number }> }>>;
  };
  assert.deepEqual(file.state, { keep: true });
  assert.equal(file.hooks.Stop.length, 2);
  assert.equal(file.hooks.SessionStart.length, 1);
  assert.match(file.hooks.SessionStart[0].hooks[0].command, /micat\.mjs"? hook/);
  assert.equal(file.hooks.PreCompact[0].hooks[0].timeout, 300);
  const config = await readFile(codexConfigPath, "utf8");
  assert.match(config, /Micat-owned Codex hook trust state/);
  assert.match(config, /\[hooks\.state\.".*hooks\.json:session_start:0:0"\]/);
  assert.match(config, /trusted_hash = "sha256:[a-f0-9]{64}"/);

  const uninstall = await uninstallNativeHooks({ hooksPath, codexConfigPath, entryPath });
  console.log(`[micat-test] uninstall report=${JSON.stringify(uninstall)}`);
  assert.equal(uninstall.changed, true);
  assert.equal(uninstall.configChanged, true);

  const after = JSON.parse(await readFile(hooksPath, "utf8")) as {
    hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
  };
  assert.equal(after.hooks.Stop.length, 1);
  assert.equal(after.hooks.Stop[0].hooks[0].command, "echo keep");
  assert.equal(after.hooks.SessionStart, undefined);
  assert.doesNotMatch(await readFile(codexConfigPath, "utf8"), /Micat-owned Codex hook trust state/);
});
