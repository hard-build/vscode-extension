import { homedir } from "node:os";
import path from "node:path";

const sourceExtensions = new Set([".c", ".cc", ".cpp", ".c++"]);

export function isSourceFile(file: string): boolean {
  return sourceExtensions.has(path.extname(file).toLowerCase());
}

export function isTestSource(file: string): boolean {
  const extension = path.extname(file).toLowerCase();
  const stem = file.slice(0, -extension.length).toLowerCase();
  return (
    sourceExtensions.has(extension) &&
    (stem.endsWith(".test") || stem.endsWith("_test"))
  );
}

export function resolveWorkspacePath(workspace: string, value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(workspace, value);
}

export function effectiveEnvironment(
  configured: Readonly<Record<string, string>>,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return { ...inherited, ...configured };
}

export function hardRoot(environment: NodeJS.ProcessEnv, home = homedir()): string {
  const configured = environment.HARD_ROOT;
  return configured === undefined || configured === ""
    ? path.join(home, ".local", "share", "hard")
    : path.resolve(configured);
}

export function hardEnvironment(environment: NodeJS.ProcessEnv): string {
  return environment.HARD_ENV === undefined || environment.HARD_ENV === ""
    ? "host"
    : environment.HARD_ENV;
}

export function sourceForwardPath(root: string, environment: string, source: string): string {
  const absoluteSource = path.resolve(source);
  const volumeRoot = path.parse(absoluteSource).root;
  const mirrored = path.relative(volumeRoot, absoluteSource);
  if (mirrored === ".." || mirrored.startsWith(`..${path.sep}`)) {
    throw new Error(`source path escapes its filesystem root: ${source}`);
  }
  return path.join(root, "env", environment, "build", `${mirrored}.fwd.h`);
}
