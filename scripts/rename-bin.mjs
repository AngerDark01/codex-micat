import { chmod, rename, stat } from "node:fs/promises";

const output = new URL("../dist/src/bin/micat.mjs", import.meta.url);

try {
  await stat(new URL("../dist/src/bin/micat.js", import.meta.url));
  await rename(
    new URL("../dist/src/bin/micat.js", import.meta.url),
    output,
  );
} catch {
  // Already renamed or build failed before emit.
}

await chmod(output, 0o755).catch(() => {});
