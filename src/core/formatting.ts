import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function formatTemporarySource(
  source: string,
  content: string,
  format: (temporarySource: string) => Promise<void>,
): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "hard-vscode-format-"));
  const temporarySource = path.join(directory, path.basename(source));
  try {
    await writeFile(temporarySource, content, "utf8");
    await format(temporarySource);
    return await readFile(temporarySource, "utf8");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
