import path from "node:path";

import * as vscode from "vscode";

import {
  isCachedTestRun,
  parseGoogleTestResults,
  parseHardTestList,
} from "./core/testProtocol";
import { getHardSettings, hardPathArgument } from "./config";
import { isTestSource } from "./core/paths";
import { parseGoogleTestSource } from "./core/testSource";
import type { HardOutput } from "./output";

interface FolderMetadata {
  kind: "folder";
  folder: vscode.WorkspaceFolder;
}

interface FileMetadata {
  kind: "file";
  folder: vscode.WorkspaceFolder;
  uri: vscode.Uri;
}

interface SuiteMetadata {
  kind: "suite";
  folder: vscode.WorkspaceFolder;
  file: vscode.TestItem;
  suite: string;
}

interface CaseMetadata {
  kind: "case";
  folder: vscode.WorkspaceFolder;
  file: vscode.TestItem;
  name: string;
}

type TestMetadata = FolderMetadata | FileMetadata | SuiteMetadata | CaseMetadata;

interface FileRunPlan {
  file: vscode.TestItem;
  all: boolean;
  selectors: Set<string>;
}

function rootId(folder: vscode.WorkspaceFolder): string {
  return `folder:${folder.uri.toString()}`;
}

function fileId(uri: vscode.Uri): string {
  return `file:${uri.toString()}`;
}

function suiteId(uri: vscode.Uri, suite: string): string {
  return `suite:${uri.toString()}:${suite}`;
}

function caseId(uri: vscode.Uri, name: string): string {
  return `case:${uri.toString()}:${name}`;
}

function childItems(item: vscode.TestItem): vscode.TestItem[] {
  const items: vscode.TestItem[] = [];
  item.children.forEach((child) => items.push(child));
  return items;
}

function normalizeTerminalOutput(value: string): string {
  return value.replace(/\r?\n/gu, "\r\n");
}

export class HardTesting implements vscode.Disposable {
  private readonly controller = vscode.tests.createTestController(
    "hardTests",
    "hard",
  );
  private readonly metadata = new Map<string, TestMetadata>();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(private readonly output: HardOutput) {
    this.controller.resolveHandler = async (item) => {
      if (item === undefined) {
        await this.refresh();
        return;
      }
      const metadata = this.metadata.get(item.id);
      if (metadata?.kind === "folder") {
        await this.discoverFiles(item, metadata.folder);
      } else if (metadata?.kind === "file") {
        await this.discoverCases(item, metadata);
      }
    };

    this.disposables.push(
      this.controller.createRunProfile(
        "Run",
        vscode.TestRunProfileKind.Run,
        async (request, token) => this.run(request, token, false),
        true,
      ),
      this.controller.createRunProfile(
        "Run Without Cache",
        vscode.TestRunProfileKind.Run,
        async (request, token) => this.run(request, token, true),
        false,
      ),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.synchronizeRoots();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("hard.testSourcePattern") ||
            event.affectsConfiguration("hard.testExcludePattern")) {
          void this.refresh();
        }
      }),
    );

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        void this.discoverDocumentTests(document);
      }),
    );
    for (const pattern of [
      "**/*.[tT][eE][sS][tT].{[cC],[cC][cC],[cC][pP][pP],[cC]++}",
      "**/*_[tT][eE][sS][tT].{[cC],[cC][cC],[cC][pP][pP],[cC]++}",
    ]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.disposables.push(
        watcher,
        watcher.onDidCreate((uri) => {
          void this.refreshFolderFor(uri);
        }),
        watcher.onDidDelete((uri) => {
          void this.refreshFolderFor(uri);
        }),
        watcher.onDidChange((uri) => {
          void this.refreshChangedFile(uri);
        }),
      );
    }
    this.synchronizeRoots();
    for (const document of vscode.workspace.textDocuments) {
      void this.discoverDocumentTests(document);
    }
  }

  public async refresh(): Promise<void> {
    this.synchronizeRoots();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = this.controller.items.get(rootId(folder));
      if (root !== undefined) {
        await this.discoverFiles(root, folder);
      }
    }
  }

  public invalidateFile(uri: vscode.Uri): void {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) {
      return;
    }
    const root = this.controller.items.get(rootId(folder));
    const file = root?.children.get(fileId(uri));
    if (file === undefined) {
      return;
    }
    for (const child of childItems(file)) {
      this.deleteMetadataTree(child);
    }
    file.children.replace([]);
    file.error = undefined;
    file.canResolveChildren = true;
  }

  private synchronizeRoots(): void {
    const activeIds = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const id = rootId(folder);
      activeIds.add(id);
      if (this.controller.items.get(id) === undefined) {
        const root = this.controller.createTestItem(id, folder.name, folder.uri);
        root.canResolveChildren = true;
        this.metadata.set(id, { kind: "folder", folder });
        this.controller.items.add(root);
      }
    }
    this.controller.items.forEach((item) => {
      if (!activeIds.has(item.id)) {
        this.deleteMetadataTree(item);
        this.controller.items.delete(item.id);
      }
    });
  }

  private async refreshFolderFor(uri: vscode.Uri): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) {
      return;
    }
    const root = this.controller.items.get(rootId(folder));
    if (root !== undefined) {
      await this.discoverFiles(root, folder);
    }
  }

  private async refreshChangedFile(uri: vscode.Uri): Promise<void> {
    this.invalidateFile(uri);
    const document = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === uri.toString(),
    );
    if (document !== undefined) {
      await this.discoverDocumentTests(document);
    }
  }

  private async discoverDocumentTests(document: vscode.TextDocument): Promise<void> {
    const uri = document.uri;
    if (uri.scheme !== "file" || !isTestSource(uri.fsPath)) {
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined) {
      return;
    }
    const root = this.controller.items.get(rootId(folder));
    if (root === undefined) {
      return;
    }
    let file = root.children.get(fileId(uri));
    if (file === undefined) {
      await this.discoverFiles(root, folder);
      file = root.children.get(fileId(uri));
    }
    if (file === undefined || file.busy || !file.canResolveChildren) {
      return;
    }
    const metadata = this.metadata.get(file.id);
    if (metadata?.kind === "file") {
      await this.discoverCases(file, metadata);
    }
  }

  private async discoverFiles(
    root: vscode.TestItem,
    folder: vscode.WorkspaceFolder,
  ): Promise<void> {
    root.busy = true;
    root.error = undefined;
    try {
      const settings = getHardSettings(folder);
      const include = new vscode.RelativePattern(folder, settings.testSourcePattern);
      const exclude = new vscode.RelativePattern(folder, settings.testExcludePattern);
      const uris = (await vscode.workspace.findFiles(include, exclude)).filter(
        (uri) => isTestSource(uri.fsPath),
      );
      uris.sort((left, right) => left.fsPath.localeCompare(right.fsPath));

      const files: vscode.TestItem[] = [];
      for (const uri of uris) {
        const id = fileId(uri);
        const existing = root.children.get(id);
        const file =
          existing ??
          this.controller.createTestItem(
            id,
            path.relative(folder.uri.fsPath, uri.fsPath),
            uri,
          );
        file.canResolveChildren = true;
        this.metadata.set(id, { kind: "file", folder, uri });
        files.push(file);
      }
      const retained = new Set(files.map((file) => file.id));
      root.children.forEach((item) => {
        if (!retained.has(item.id)) {
          this.deleteMetadataTree(item);
        }
      });
      root.children.replace(files);
      root.canResolveChildren = false;
    } catch (error) {
      root.error = error instanceof Error ? error.message : String(error);
    } finally {
      root.busy = false;
    }
  }

  private async discoverCases(
    file: vscode.TestItem,
    metadata: FileMetadata,
    token?: vscode.CancellationToken,
  ): Promise<vscode.TestItem[]> {
    file.busy = true;
    file.error = undefined;
    try {
      const settings = getHardSettings(metadata.folder);
      const result = await this.output.run(
        metadata.folder,
        {
          command: "test",
          paths: [hardPathArgument(metadata.folder, metadata.uri)],
          jobs: settings.jobs,
          noColor: true,
          silent: true,
          listTests: true,
        },
        token,
        undefined,
        false,
      );
      if (result.code !== 0) {
        file.error = `hard test --list-tests exited with status ${result.code}`;
        return [];
      }

      const document = await vscode.workspace.openTextDocument(metadata.uri);
      const sourceRanges = new Map(
        parseGoogleTestSource(document.getText()).map((location) => [
          location.name,
          new vscode.Range(
            document.positionAt(location.start),
            document.positionAt(location.end),
          ),
        ] as const),
      );

      for (const child of childItems(file)) {
        this.deleteMetadataTree(child);
      }
      const suites = new Map<string, vscode.TestItem>();
      for (const name of parseHardTestList(result.output)) {
        const separator = name.lastIndexOf(".");
        if (separator <= 0 || separator === name.length - 1) {
          continue;
        }
        const suiteName = name.slice(0, separator);
        let suite = suites.get(suiteName);
        if (suite === undefined) {
          suite = this.controller.createTestItem(
            suiteId(metadata.uri, suiteName),
            suiteName,
            metadata.uri,
          );
          suite.canResolveChildren = false;
          this.metadata.set(suite.id, {
            kind: "suite",
            folder: metadata.folder,
            file,
            suite: suiteName,
          });
          suites.set(suiteName, suite);
        }
        const testCase = this.controller.createTestItem(
          caseId(metadata.uri, name),
          name.slice(separator + 1),
          metadata.uri,
        );
        testCase.range = sourceRanges.get(name);
        this.metadata.set(testCase.id, {
          kind: "case",
          folder: metadata.folder,
          file,
          name,
        });
        suite.children.add(testCase);
      }
      const suiteItems = [...suites.values()].sort((left, right) =>
        left.label.localeCompare(right.label),
      );
      file.children.replace(suiteItems);
      file.canResolveChildren = false;
      return this.casesBelow(file);
    } catch (error) {
      file.error = error instanceof Error ? error.message : String(error);
      return [];
    } finally {
      file.busy = false;
    }
  }

  private casesBelow(item: vscode.TestItem): vscode.TestItem[] {
    const metadata = this.metadata.get(item.id);
    if (metadata?.kind === "case") {
      return [item];
    }
    return childItems(item).flatMap((child) => this.casesBelow(child));
  }

  private async filesBelow(item: vscode.TestItem): Promise<vscode.TestItem[]> {
    const metadata = this.metadata.get(item.id);
    if (metadata?.kind === "folder") {
      if (item.canResolveChildren) {
        await this.discoverFiles(item, metadata.folder);
      }
      return childItems(item);
    }
    if (metadata?.kind === "file") {
      return [item];
    }
    if (metadata?.kind === "suite" || metadata?.kind === "case") {
      return [metadata.file];
    }
    return [];
  }

  private addPlan(
    plans: Map<string, FileRunPlan>,
    file: vscode.TestItem,
    selectors: readonly string[] | undefined,
  ): void {
    const plan = plans.get(file.id) ?? {
      file,
      all: false,
      selectors: new Set<string>(),
    };
    if (selectors === undefined) {
      plan.all = true;
      plan.selectors.clear();
    } else if (!plan.all) {
      for (const selector of selectors) {
        plan.selectors.add(selector);
      }
    }
    plans.set(file.id, plan);
  }

  private async plansForRequest(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<FileRunPlan[]> {
    const plans = new Map<string, FileRunPlan>();
    const included = request.include ?? (() => {
      const roots: vscode.TestItem[] = [];
      this.controller.items.forEach((root) => roots.push(root));
      return roots;
    })();

    for (const item of included) {
      const metadata = this.metadata.get(item.id);
      if (metadata?.kind === "case") {
        this.addPlan(plans, metadata.file, [metadata.name]);
      } else if (metadata?.kind === "suite") {
        const selectors = this.casesBelow(item)
          .map((testCase) => this.metadata.get(testCase.id))
          .filter((value): value is CaseMetadata => value?.kind === "case")
          .map((value) => value.name);
        this.addPlan(plans, metadata.file, selectors);
      } else {
        for (const file of await this.filesBelow(item)) {
          this.addPlan(plans, file, undefined);
        }
      }
    }

    const excludedIds = new Set((request.exclude ?? []).map((item) => item.id));
    const isExcluded = (item: vscode.TestItem): boolean => {
      let current: vscode.TestItem | undefined = item;
      while (current !== undefined) {
        if (excludedIds.has(current.id)) {
          return true;
        }
        current = current.parent;
      }
      return false;
    };

    const result: FileRunPlan[] = [];
    for (const plan of plans.values()) {
      const metadata = this.metadata.get(plan.file.id);
      if (metadata?.kind !== "file" || isExcluded(plan.file)) {
        continue;
      }
      let cases = this.casesBelow(plan.file);
      if (cases.length === 0 || plan.file.canResolveChildren) {
        cases = await this.discoverCases(plan.file, metadata, token);
      }
      const includedCases = cases.filter((testCase) => !isExcluded(testCase));
      if (plan.all) {
        if (includedCases.length !== cases.length) {
          plan.all = false;
          for (const testCase of includedCases) {
            const caseMetadata = this.metadata.get(testCase.id);
            if (caseMetadata?.kind === "case") {
              plan.selectors.add(caseMetadata.name);
            }
          }
        }
      } else {
        const allowed = new Set(
          includedCases
            .map((testCase) => this.metadata.get(testCase.id))
            .filter((value): value is CaseMetadata => value?.kind === "case")
            .map((value) => value.name),
        );
        for (const selector of plan.selectors) {
          if (!allowed.has(selector)) {
            plan.selectors.delete(selector);
          }
        }
      }
      if (plan.all || plan.selectors.size > 0) {
        result.push(plan);
      }
    }
    return result.sort((left, right) => left.file.id.localeCompare(right.file.id));
  }

  private async run(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    forceNoCache: boolean,
  ): Promise<void> {
    const run = this.controller.createTestRun(
      request,
      forceNoCache ? "hard Test Without Cache" : "hard Test",
      true,
    );
    try {
      const plans = await this.plansForRequest(request, token);
      for (const plan of plans) {
        if (token.isCancellationRequested) {
          break;
        }
        const metadata = this.metadata.get(plan.file.id);
        if (metadata?.kind !== "file") {
          continue;
        }
        const settings = getHardSettings(metadata.folder);
        const allCases = this.casesBelow(plan.file);
        const selectedCases = plan.all
          ? allCases
          : allCases.filter((testCase) => {
              const caseMetadata = this.metadata.get(testCase.id);
              return caseMetadata?.kind === "case" && plan.selectors.has(caseMetadata.name);
            });
        if (selectedCases.length === 0) {
          run.enqueued(plan.file);
          run.started(plan.file);
          const discoveryError = plan.file.error;
          run.errored(
            plan.file,
            new vscode.TestMessage(
              typeof discoveryError === "string"
                ? discoveryError
                : (discoveryError?.value ?? "hard reported no tests for this source"),
            ),
          );
          continue;
        }
        for (const testCase of selectedCases) {
          run.enqueued(testCase);
          run.started(testCase);
        }

        const result = await this.output.run(
          metadata.folder,
          {
            command: "test",
            paths: [hardPathArgument(metadata.folder, metadata.uri)],
            tests: plan.all ? undefined : [...plan.selectors],
            jobs: settings.jobs,
            noCache: forceNoCache || settings.noCache,
            noColor: true,
            verbose: true,
          },
          token,
          (chunk) => {
            run.appendOutput(normalizeTerminalOutput(chunk), undefined, plan.file);
          },
          false,
        );

        if (token.isCancellationRequested) {
          for (const testCase of selectedCases) {
            run.skipped(testCase);
          }
          break;
        }

        const parsed = new Map(
          parseGoogleTestResults(result.output).map((item) => [item.name, item]),
        );
        const cached = result.code === 0 && isCachedTestRun(result.output);
        for (const testCase of selectedCases) {
          const caseMetadata = this.metadata.get(testCase.id);
          if (caseMetadata?.kind !== "case") {
            continue;
          }
          const testResult = parsed.get(caseMetadata.name);
          if (testResult?.status === "failed") {
            run.failed(
              testCase,
              new vscode.TestMessage(testResult.message),
              testResult.duration,
            );
          } else if (testResult?.status === "skipped") {
            run.skipped(testCase);
          } else if (testResult?.status === "passed") {
            run.passed(testCase, testResult.duration);
          } else if (cached || result.code === 0) {
            run.passed(testCase);
          } else {
            run.errored(
              testCase,
              new vscode.TestMessage(`hard exited with status ${result.code}`),
            );
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.appendOutput(`hard Test Explorer: ${message}\r\n`);
    } finally {
      run.end();
    }
  }

  private deleteMetadataTree(item: vscode.TestItem): void {
    item.children.forEach((child) => this.deleteMetadataTree(child));
    this.metadata.delete(item.id);
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.controller.dispose();
    this.metadata.clear();
  }
}
