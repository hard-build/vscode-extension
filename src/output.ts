import path from "node:path";

import * as vscode from "vscode";

import { buildHardArguments, type HardInvocation } from "./core/hardArguments";
import {
  parseCompilerDiagnostics,
  type CompilerDiagnosticSeverity,
} from "./core/diagnostics";
import { effectiveEnvironment } from "./core/paths";
import { getHardSettings } from "./config";
import { HardProcessRunner, type HardProcessResult } from "./hardProcess";

function commandArgument(value: string): string {
  return /^[A-Za-z0-9_./:=+,-]+$/u.test(value) ? value : JSON.stringify(value);
}

function vscodeSeverity(severity: CompilerDiagnosticSeverity): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "information":
      return vscode.DiagnosticSeverity.Information;
  }
}

export class HardOutput implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel("hard");
  private readonly diagnostics = vscode.languages.createDiagnosticCollection("hard");
  private readonly processRunner = new HardProcessRunner();

  public show(): void {
    this.channel.show(true);
  }

  public append(value: string): void {
    this.channel.append(value);
  }

  public async run(
    folder: vscode.WorkspaceFolder,
    invocation: HardInvocation,
    token?: vscode.CancellationToken,
    onOutput?: (chunk: string) => void,
    showOutput = true,
  ): Promise<HardProcessResult> {
    const settings = getHardSettings(folder);
    const arguments_ = buildHardArguments(invocation);
    if (showOutput) {
      this.channel.show(true);
    }
    this.channel.appendLine("");
    this.channel.appendLine(
      `$ ${[settings.executable, ...arguments_].map(commandArgument).join(" ")}`,
    );

    const result = await this.processRunner.run(
      {
        executable: settings.executable,
        arguments: arguments_,
        cwd: folder.uri.fsPath,
        environment: effectiveEnvironment(settings.environment),
      },
      (chunk) => {
        this.channel.append(chunk);
        onOutput?.(chunk);
      },
      token,
    );
    this.publishDiagnostics(folder, result.output);
    return result;
  }

  public async runWithProgress(
    title: string,
    folder: vscode.WorkspaceFolder,
    invocation: HardInvocation,
  ): Promise<HardProcessResult> {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      async (_progress, token) => this.run(folder, invocation, token),
    );
    if (result.code !== 0) {
      void vscode.window.showErrorMessage(
        `hard exited with status ${result.code}. See the hard output for details.`,
      );
    }
    return result;
  }

  private publishDiagnostics(folder: vscode.WorkspaceFolder, output: string): void {
    this.diagnostics.clear();
    const grouped = new Map<string, vscode.Diagnostic[]>();
    for (const item of parseCompilerDiagnostics(output)) {
      const file = path.isAbsolute(item.file)
        ? path.normalize(item.file)
        : path.resolve(folder.uri.fsPath, item.file);
      const uri = vscode.Uri.file(file);
      const range = new vscode.Range(item.line, item.column, item.line, item.column + 1);
      const diagnostic = new vscode.Diagnostic(
        range,
        item.message,
        vscodeSeverity(item.severity),
      );
      diagnostic.source = "hard";
      const existing = grouped.get(uri.toString()) ?? [];
      existing.push(diagnostic);
      grouped.set(uri.toString(), existing);
    }
    for (const [rawUri, diagnostics] of grouped) {
      this.diagnostics.set(vscode.Uri.parse(rawUri), diagnostics);
    }
  }

  public dispose(): void {
    this.channel.dispose();
    this.diagnostics.dispose();
  }
}
