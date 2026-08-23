import { stripAnsi } from "./diagnostics";

export type GoogleTestStatus = "passed" | "failed" | "skipped";

export interface GoogleTestResult {
  name: string;
  status: GoogleTestStatus;
  duration: number | undefined;
  message: string;
}

const testNamePattern = /^\S+\.\S+$/u;
const runPattern = /^\[ RUN\s+\] (\S+)$/u;
const resultPattern = /^\[\s*(OK|FAILED|SKIPPED)\s*\] (\S+?)(?: \((\d+) ms\))?$/u;

export function parseHardTestList(output: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of stripAnsi(output).split(/\r?\n/u)) {
    const name = line.trim();
    if (name.endsWith(":") || !testNamePattern.test(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function parseGoogleTestResults(output: string): GoogleTestResult[] {
  const lines = stripAnsi(output).split(/\r?\n/u);
  const results: GoogleTestResult[] = [];
  let activeName: string | undefined;
  let activeStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const run = runPattern.exec(line);
    if (run?.[1] !== undefined) {
      activeName = run[1];
      activeStart = index;
      continue;
    }

    const result = resultPattern.exec(line);
    if (result === null || activeName === undefined || result[2] !== activeName) {
      continue;
    }
    const rawStatus = result[1];
    const status: GoogleTestStatus =
      rawStatus === "OK" ? "passed" : rawStatus === "SKIPPED" ? "skipped" : "failed";
    results.push({
      name: activeName,
      status,
      duration: result[3] === undefined ? undefined : Number.parseInt(result[3], 10),
      message: lines.slice(activeStart, index + 1).join("\n"),
    });
    activeName = undefined;
  }
  return results;
}

export function isCachedTestRun(output: string): boolean {
  return /(?:^|[\r\n])\[\d+\/\d+\] Testing .+ \(CACHED\)(?:[\r\n]|$)/u.test(
    stripAnsi(output),
  );
}
