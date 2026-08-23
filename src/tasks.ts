import * as vscode from "vscode";

import {
  buildHardArguments,
  type HardCommand,
  type HardInvocation,
} from "./core/hardArguments";
import { effectiveEnvironment } from "./core/paths";
import { getHardSettings } from "./config";
import { HardProcessRunner } from "./hardProcess";

interface HardTaskDefinition extends vscode.TaskDefinition {
  command: HardCommand;
  paths?: string[];
  tests?: string[];
  listTests?: boolean;
  noCache?: boolean;
  silent?: boolean;
  output?: string;
  format?: string;
}

function commandArgument(value: string): string {
  return /^[A-Za-z0-9_./:=+,-]+$/u.test(value) ? value : JSON.stringify(value);
}

function invocationForTask(
  folder: vscode.WorkspaceFolder,
  definition: HardTaskDefinition,
): HardInvocation {
  const settings = getHardSettings(folder);
  const supportsCache = definition.command === "build" || definition.command === "test";
  return {
    command: definition.command,
    paths: definition.paths,
    tests: definition.tests,
    jobs: settings.jobs,
    noCache:
      supportsCache ? (definition.noCache ?? settings.noCache) : undefined,
    noColor: settings.noColor,
    silent: definition.silent,
    listTests: definition.listTests,
    output:
      definition.command === "build"
        ? (definition.output ?? (settings.output === "" ? undefined : settings.output))
        : undefined,
    format:
      definition.command === "format"
        ? (definition.format ?? (settings.format === "" ? undefined : settings.format))
        : undefined,
  };
}

class HardPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  private readonly cancellation = new vscode.CancellationTokenSource();

  public readonly onDidWrite = this.writeEmitter.event;
  public readonly onDidClose = this.closeEmitter.event;

  public constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly definition: HardTaskDefinition,
  ) {}

  public open(): void {
    void this.execute();
  }

  public close(): void {
    this.cancellation.cancel();
  }

  private async execute(): Promise<void> {
    try {
      const settings = getHardSettings(this.folder);
      const arguments_ = buildHardArguments(invocationForTask(this.folder, this.definition));
      this.writeEmitter.fire(
        `$ ${[settings.executable, ...arguments_].map(commandArgument).join(" ")}\r\n`,
      );
      const result = await new HardProcessRunner().run(
        {
          executable: settings.executable,
          arguments: arguments_,
          cwd: this.folder.uri.fsPath,
          environment: effectiveEnvironment(settings.environment),
        },
        (chunk) => {
          this.writeEmitter.fire(chunk.replace(/\r?\n/gu, "\r\n"));
        },
        this.cancellation.token,
      );
      this.closeEmitter.fire(result.code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.writeEmitter.fire(`hard task: ${message}\r\n`);
      this.closeEmitter.fire(1);
    } finally {
      this.cancellation.dispose();
      this.writeEmitter.dispose();
      this.closeEmitter.dispose();
    }
  }
}

function taskName(definition: HardTaskDefinition): string {
  if (definition.command === "build" && definition.noCache === true) {
    return "Rebuild";
  }
  if (definition.command === "test" && definition.noCache === true) {
    return "Test Without Cache";
  }
  return definition.command[0]?.toUpperCase() + definition.command.slice(1);
}

function problemMatchers(command: HardCommand): string[] {
  return command === "build" || command === "test" ? ["$gcc"] : [];
}

export class HardTaskProvider implements vscode.TaskProvider, vscode.Disposable {
  private readonly registration: vscode.Disposable;

  public constructor() {
    this.registration = vscode.tasks.registerTaskProvider("hard", this);
  }

  public provideTasks(): vscode.Task[] {
    const tasks: vscode.Task[] = [];
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const command of ["format", "build", "fetch", "test"] as const) {
        const definition: HardTaskDefinition = { type: "hard", command, paths: ["."] };
        const task = this.createTask(folder, definition);
        if (command === "build") {
          task.group = vscode.TaskGroup.Build;
        } else if (command === "test") {
          task.group = vscode.TaskGroup.Test;
        }
        tasks.push(task);
      }
    }
    return tasks;
  }

  public resolveTask(task: vscode.Task): vscode.Task | undefined {
    const folder =
      task.scope !== undefined && typeof task.scope !== "number" ? task.scope : undefined;
    if (folder === undefined) {
      return undefined;
    }
    const definition = task.definition as Partial<HardTaskDefinition>;
    if (
      definition.command !== "format" &&
      definition.command !== "build" &&
      definition.command !== "fetch" &&
      definition.command !== "test"
    ) {
      return undefined;
    }
    return this.createTask(folder, definition as HardTaskDefinition);
  }

  private createTask(
    folder: vscode.WorkspaceFolder,
    definition: HardTaskDefinition,
  ): vscode.Task {
    return new vscode.Task(
      definition,
      folder,
      taskName(definition),
      "hard",
      new vscode.CustomExecution(
        () => Promise.resolve(new HardPseudoterminal(folder, definition)),
      ),
      problemMatchers(definition.command),
    );
  }

  public dispose(): void {
    this.registration.dispose();
  }
}
