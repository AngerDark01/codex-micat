import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { withFileLock } from "../src/fs/file-lock.js";

test("withFileLock removes stale pid locks before retrying", async () => {
  const root = await mkdtemp(join(tmpdir(), "micat-lock-test-"));
  const lockPath = join(root, "session", "lock");
  await mkdir(join(root, "session"), { recursive: true });
  await writeFile(lockPath, "999999999\n", "utf8");

  let ran = false;
  await withFileLock(lockPath, async () => {
    ran = true;
    const text = await readFile(lockPath, "utf8");
    console.log(`[micat-test] lock content=${JSON.stringify(text)}`);
    assert.match(text, new RegExp(`^${process.pid}\\n`));
  });

  assert.equal(ran, true);
});
