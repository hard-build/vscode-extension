import * as vscode from "vscode";

import { formatTemporarySource } from "./core/formatting";
import { getHardSettings } from "./config";
import type { HardOutput } from "./output";

const documentSelector: vscode.DocumentSelector = [
  { language: "c", scheme: "file" },
  { language: "cpp", scheme: "file" },
];

export class HardFormatting implements vscode.DocumentFormattingEditProvider, vscode.Disposable {
  private readonly registration: vscode.Disposable;

  public constructor(private readonly output: HardOutput) {
    this.registration = vscode.languages.registerDocumentFormattingEditProvider(
      documentSelector,
      this,
    );
  }

  public async provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): Promise<vscode.TextEdit[]> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (folder === undefined) {
      return [];
    }

    const settings = getHardSettings(folder);
    const original = document.getText();
    const version = document.version;
    let formatted: string;
    try {
      formatted = await formatTemporarySource(
        document.fileName,
        original,
        async (temporarySource) => {
          const result = await this.output.run(
            folder,
            {
              command: "format",
              paths: [temporarySource],
              jobs: 1,
              noColor: settings.noColor,
              silent: true,
              format: settings.format === "" ? undefined : settings.format,
            },
            token,
            undefined,
            false,
          );
          if (result.code !== 0) {
            throw new Error(`hard exited with status ${result.code}`);
          }
        },
      );
    } catch (error) {
      if (token.isCancellationRequested) {
        return [];
      }
      const message = error instanceof Error ? error.message : String(error);
      this.output.append(`hard formatter: ${message}\n`);
      void vscode.window.showErrorMessage(
        `hard formatting failed: ${message}. See the hard output for details.`,
      );
      return [];
    }

    if (
      token.isCancellationRequested ||
      document.version !== version ||
      formatted === original
    ) {
      return [];
    }
    const range = new vscode.Range(
      document.positionAt(0),
      document.positionAt(original.length),
    );
    return [vscode.TextEdit.replace(range, formatted)];
  }

  public dispose(): void {
    this.registration.dispose();
  }
}
