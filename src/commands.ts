import * as vscode from "vscode";

import type { HardCommand, HardInvocation } from "./core/hardArguments";
import { isSourceFile, isTestSource } from "./core/paths";
import {
  getHardSettings,
  hardPathArgument,
  selectWorkspaceFolder,
} from "./config";
import type { HardIntelliSense } from "./intellisense";
import type { HardOutput } from "./output";
import type { HardTesting } from "./testing";

export class HardCommands implements vscode.Disposable {
  private readonly registrations: vscode.Disposable[] = [];

  public constructor(
    private readonly output: HardOutput,
    private readonly testing: HardTesting,
    private readonly intelliSense: HardIntelliSense,
  ) {
    this.register("hard.format", async (resource?: vscode.Uri) => {
      await this.runPathCommand("format", "Formatting with hard", resource);
    });
    this.register("hard.build", async (resource?: vscode.Uri) => {
      await this.runPathCommand("build", "Building with hard", resource);
    });
    this.register("hard.buildNoCache", async (resource?: vscode.Uri) => {
      await this.runPathCommand("build", "Rebuilding with hard", resource, true);
    });
    this.register("hard.fetch", async (resource?: vscode.Uri) => {
      await this.runPathCommand("fetch", "Fetching with hard", resource);
    });
    this.register("hard.test", async (resource?: vscode.Uri) => {
      await this.runPathCommand("test", "Testing with hard", resource);
    });
    this.register("hard.testNoCache", async (resource?: vscode.Uri) => {
      await this.runPathCommand("test", "Testing without hard cache", resource, true);
    });
    this.register("hard.testFile", async (resource?: vscode.Uri) => {
      await this.runTestFile(resource);
    });
    this.register("hard.listTests", async (resource?: vscode.Uri) => {
      await this.listTests(resource);
    });
    this.register("hard.refreshTests", async () => {
      await this.testing.refresh();
    });
    this.register("hard.openOutput", () => {
      this.output.show();
    });
    this.register("hard.refreshIntelliSense", () => {
      this.intelliSense.refresh();
    });
  }

  private register(
    command: string,
    callback: (...arguments_: never[]) => unknown,
  ): void {
    this.registrations.push(vscode.commands.registerCommand(command, callback));
  }

  private activeResource(resource?: vscode.Uri): vscode.Uri | undefined {
    return resource ?? vscode.window.activeTextEditor?.document.uri;
  }

  private baseInvocation(
    folder: vscode.WorkspaceFolder,
    command: HardCommand,
    paths: readonly string[],
    forceNoCache: boolean,
  ): HardInvocation {
    const settings = getHardSettings(folder);
    return {
      command,
      paths,
      jobs: settings.jobs,
      noCache:
        command === "build" || command === "test"
          ? forceNoCache || settings.noCache
          : undefined,
      noColor: settings.noColor,
      output:
        command === "build" && settings.output !== "" ? settings.output : undefined,
      format:
        command === "format" && settings.format !== "" ? settings.format : undefined,
    };
  }

  private async runPathCommand(
    command: HardCommand,
    title: string,
    rawResource: vscode.Uri | undefined,
    forceNoCache = false,
  ): Promise<void> {
    const resource = this.activeResource(rawResource);
    const folder = await selectWorkspaceFolder(resource);
    if (folder === undefined) {
      return;
    }
    const acceptsActiveResource =
      command === "test" ? isTestSource(resource?.fsPath ?? "") : true;
    const useResource =
      resource !== undefined &&
      vscode.workspace.getWorkspaceFolder(resource)?.uri.toString() ===
        folder.uri.toString() &&
      acceptsActiveResource &&
      isSourceFile(resource.fsPath);
    const paths = useResource ? [hardPathArgument(folder, resource)] : ["."];
    const result = await this.output.runWithProgress(
      title,
      folder,
      this.baseInvocation(folder, command, paths, forceNoCache),
    );
    if (result.code === 0) {
      if (command === "build" || command === "test") {
        this.intelliSense.refresh();
      }
      if (resource !== undefined && command === "test") {
        this.testing.invalidateFile(resource);
      }
    }
  }

  private async runTestFile(rawResource?: vscode.Uri): Promise<void> {
    const resource = this.activeResource(rawResource);
    if (resource === undefined || !isTestSource(resource.fsPath)) {
      void vscode.window.showErrorMessage(
        "The active file is not a hard *_test.c, *_test.cc, *_test.cpp, or *_test.c++ source.",
      );
      return;
    }
    const folder = await selectWorkspaceFolder(resource);
    if (folder === undefined) {
      return;
    }
    const result = await this.output.runWithProgress(
      "Testing current file with hard",
      folder,
      this.baseInvocation(
        folder,
        "test",
        [hardPathArgument(folder, resource)],
        false,
      ),
    );
    if (result.code === 0) {
      this.testing.invalidateFile(resource);
      this.intelliSense.refresh();
    }
  }

  private async listTests(rawResource?: vscode.Uri): Promise<void> {
    const resource = this.activeResource(rawResource);
    const folder = await selectWorkspaceFolder(resource);
    if (folder === undefined) {
      return;
    }
    const path =
      resource !== undefined && isTestSource(resource.fsPath)
        ? hardPathArgument(folder, resource)
        : ".";
    const settings = getHardSettings(folder);
    await this.output.runWithProgress("Listing hard tests", folder, {
      command: "test",
      paths: [path],
      jobs: settings.jobs,
      noCache: settings.noCache,
      noColor: settings.noColor,
      listTests: true,
    });
  }

  public dispose(): void {
    for (const registration of this.registrations) {
      registration.dispose();
    }
  }
}
