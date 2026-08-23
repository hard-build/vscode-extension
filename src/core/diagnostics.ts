export type CompilerDiagnosticSeverity = "error" | "warning" | "information";

export interface CompilerDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: CompilerDiagnosticSeverity;
  message: string;
}

const ansiPattern = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const diagnosticPattern = /^(.*?):(\d+)(?::(\d+))?:\s+(fatal error|error|warning|note):\s+(.+)$/u;

export function stripAnsi(value: string): string {
  return value.replace(ansiPattern, "");
}

export function parseCompilerDiagnostics(output: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const rawLine of stripAnsi(output).split(/[\r\n]+/u)) {
    const match = diagnosticPattern.exec(rawLine.trim());
    if (match === null) {
      continue;
    }
    const [, file, rawLineNumber, rawColumn, rawSeverity, message] = match;
    if (
      file === undefined ||
      rawLineNumber === undefined ||
      rawSeverity === undefined ||
      message === undefined
    ) {
      continue;
    }
    diagnostics.push({
      file,
      line: Math.max(Number.parseInt(rawLineNumber, 10) - 1, 0),
      column: Math.max(Number.parseInt(rawColumn ?? "1", 10) - 1, 0),
      severity:
        rawSeverity === "warning"
          ? "warning"
          : rawSeverity === "note"
            ? "information"
            : "error",
      message,
    });
  }
  return diagnostics;
}
