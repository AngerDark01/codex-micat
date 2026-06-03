import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withFileLock<T>(lockPath: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 5000;

  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n${Date.now()}\n`, "utf8");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (await removeStaleLock(lockPath)) continue;
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for lock: ${lockPath}`);
      }
      await sleep(50);
    }
  }

  try {
    return await action();
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  const pid = await readLockPid(lockPath);
  if (pid && isProcessAlive(pid)) return false;
  await rm(lockPath, { force: true });
  return true;
}

async function readLockPid(lockPath: string): Promise<number | null> {
  try {
    const text = await readFile(lockPath, "utf8");
    const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const pid = Number(firstLine);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
