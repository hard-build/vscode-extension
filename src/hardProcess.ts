import { spawn } from "node:child_process";

import type * as vscode from "vscode";

export interface HardProcessRequest {
  executable: string;
  arguments: readonly string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
}

export interface HardProcessResult {
  code: number;
  signal: NodeJS.Signals | null;
  output: string;
  error: Error | undefined;
}

export class HardProcessRunner {
  public run(
    request: HardProcessRequest,
    onOutput: (chunk: string) => void,
    token?: vscode.CancellationToken,
  ): Promise<HardProcessResult> {
    return new Promise((resolve) => {
      let output = "";
      let finished = false;
      const child = spawn(request.executable, request.arguments, {
        cwd: request.cwd,
        env: request.environment,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const append = (chunk: Buffer): void => {
        const text = chunk.toString("utf8");
        output += text;
        onOutput(text);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      const cancellation = token?.onCancellationRequested(() => {
        child.kill();
      });
      const finish = (result: HardProcessResult): void => {
        if (finished) {
          return;
        }
        finished = true;
        cancellation?.dispose();
        resolve(result);
      };

      child.once("error", (error) => {
        const message = `hard: cannot start ${request.executable}: ${error.message}\n`;
        output += message;
        onOutput(message);
        finish({ code: 127, signal: null, output, error });
      });
      child.once("close", (code, signal) => {
        finish({
          code: code ?? (token?.isCancellationRequested === true ? 130 : 1),
          signal,
          output,
          error: undefined,
        });
      });
    });
  }
}
