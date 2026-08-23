import { existsSync } from "node:fs";
import path from "node:path";

import * as vscode from "vscode";
import {
  getCppToolsApi,
  Version,
  type CppStandard,
  type CppToolsApi,
  type CustomConfigurationProvider,
  type GnuCppStandard,
  type SourceFileConfiguration,
  type SourceFileConfigurationItem,
  type WorkspaceBrowseConfiguration,
} from "vscode-cpptools";

import { analyzeCompilerFlags } from "./core/compilerFlags";
import {
  effectiveEnvironment,
  hardEnvironment,
  hardRoot,
  isSourceFile,
  sourceForwardPath,
} from "./core/paths";
import { parseShellWords } from "./core/shellWords";
import { getHardSettings, workspacePath } from "./config";
import type { HardOutput } from "./output";

type SupportedCppStandard = CppStandard | GnuCppStandard;

const cppStandards = new Set<SupportedCppStandard>([
  "c++98",
  "c++03",
  "c++11",
  "c++14",
  "c++17",
  "c++20",
  "c++23",
  "c++26",
  "gnu++98",
  "gnu++03",
  "gnu++11",
  "gnu++14",
  "gnu++17",
  "gnu++20",
  "gnu++23",
  "gnu++26",
]);

function asCppStandard(value: string, fallback: SupportedCppStandard): SupportedCppStandard {
  return cppStandards.has(value as SupportedCppStandard)
    ? (value as SupportedCppStandard)
    : fallback;
}

function defaultCompilerArguments(root: string, environment: string): string[] {
  return [
    "-std=c++20",
    "-O3",
    "-flto=auto",
    "-Wall",
    "-Wextra",
    `-I${path.join(root, "source")}`,
    "-include",
    path.join(root, "env", environment, "hard.h"),
  ];
}

function compilerArguments(environment: NodeJS.ProcessEnv): string[] {
  const root = hardRoot(environment);
  const targetEnvironment = hardEnvironment(environment);
  if (environment.HARD_CFLAGS === undefined) {
    return defaultCompilerArguments(root, targetEnvironment);
  }
  return environment.HARD_CFLAGS === "" ? [] : parseShellWords(environment.HARD_CFLAGS);
}

function supportedDocument(uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") {
    return false;
  }
  const extension = path.extname(uri.fsPath).toLowerCase();
  return isSourceFile(uri.fsPath) ||
    extension === ".h" ||
    extension === ".hh" ||
    extension === ".hpp" ||
    extension === ".h++" ||
    extension === ".ipp";
}

class HardConfigurationProvider implements CustomConfigurationProvider {
  public readonly name = "hard";
  public readonly extensionId = "hard-build.hard-vscode";

  public constructor(private readonly output: HardOutput) {}

  public canProvideConfiguration(uri: vscode.Uri): Promise<boolean> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return Promise.resolve(
      folder !== undefined &&
        getHardSettings(folder).intelliSense.enabled &&
        supportedDocument(uri),
    );
  }

  public provideConfigurations(
    uris: vscode.Uri[],
  ): Promise<SourceFileConfigurationItem[]> {
    const configurations: SourceFileConfigurationItem[] = [];
    for (const uri of uris) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (
        folder === undefined ||
        !getHardSettings(folder).intelliSense.enabled ||
        !supportedDocument(uri)
      ) {
        continue;
      }
      try {
        configurations.push({
          uri,
          configuration: this.sourceConfiguration(folder, uri),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.append(`hard IntelliSense: ${message}\n`);
      }
    }
    return Promise.resolve(configurations);
  }

  public canProvideBrowseConfiguration(): Promise<boolean> {
    return Promise.resolve(
      (vscode.workspace.workspaceFolders ?? []).some(
        (folder) => getHardSettings(folder).intelliSense.enabled,
      ),
    );
  }

  public provideBrowseConfiguration(): Promise<WorkspaceBrowseConfiguration | null> {
    const folder = (vscode.workspace.workspaceFolders ?? []).find(
      (candidate) => getHardSettings(candidate).intelliSense.enabled,
    );
    return Promise.resolve(
      folder === undefined ? null : this.browseConfiguration(folder),
    );
  }

  public canProvideBrowseConfigurationsPerFolder(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public provideFolderBrowseConfiguration(
    uri: vscode.Uri,
  ): Promise<WorkspaceBrowseConfiguration | null> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder === undefined || !getHardSettings(folder).intelliSense.enabled) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.browseConfiguration(folder));
  }

  private environment(folder: vscode.WorkspaceFolder): NodeJS.ProcessEnv {
    return effectiveEnvironment(getHardSettings(folder).environment);
  }

  private sourceConfiguration(
    folder: vscode.WorkspaceFolder,
    uri: vscode.Uri,
  ): SourceFileConfiguration {
    const settings = getHardSettings(folder);
    const environment = this.environment(folder);
    const root = hardRoot(environment);
    const targetEnvironment = hardEnvironment(environment);
    const arguments_ = compilerArguments(environment);
    const analyzed = analyzeCompilerFlags(arguments_, folder.uri.fsPath);
    const fallbackStandard = asCppStandard(settings.intelliSense.cppStandard, "c++20");
    const forcedInclude = [...analyzed.forcedIncludes];
    if (isSourceFile(uri.fsPath)) {
      const forward = sourceForwardPath(root, targetEnvironment, uri.fsPath);
      if (existsSync(forward)) {
        forcedInclude.push(forward);
      }
    }
    return {
      includePath: [
        ...analyzed.includePaths,
        ...settings.intelliSense.extraIncludePaths.map((value) =>
          workspacePath(folder, value),
        ),
      ],
      defines: [...analyzed.defines, ...settings.intelliSense.extraDefines],
      forcedInclude,
      compilerPath:
        settings.intelliSense.compilerPath || environment.HARD_CC || "c++",
      compilerArgs: [...arguments_, ...settings.intelliSense.extraCompilerArguments],
      standard: asCppStandard(analyzed.standard ?? fallbackStandard, fallbackStandard),
    };
  }

  private browseConfiguration(
    folder: vscode.WorkspaceFolder,
  ): WorkspaceBrowseConfiguration {
    const settings = getHardSettings(folder);
    const environment = this.environment(folder);
    const arguments_ = compilerArguments(environment);
    const analyzed = analyzeCompilerFlags(arguments_, folder.uri.fsPath);
    const fallbackStandard = asCppStandard(settings.intelliSense.cppStandard, "c++20");
    return {
      browsePath: [
        folder.uri.fsPath,
        ...analyzed.includePaths,
        ...settings.intelliSense.extraIncludePaths.map((value) =>
          workspacePath(folder, value),
        ),
      ],
      compilerPath:
        settings.intelliSense.compilerPath || environment.HARD_CC || "c++",
      compilerArgs: [...arguments_, ...settings.intelliSense.extraCompilerArguments],
      standard: asCppStandard(analyzed.standard ?? fallbackStandard, fallbackStandard),
    };
  }

  public dispose(): void {}
}

export class HardIntelliSense implements vscode.Disposable {
  private readonly provider: HardConfigurationProvider;
  private api: CppToolsApi | undefined;
  private readonly configurationListener: vscode.Disposable;

  public constructor(private readonly output: HardOutput) {
    this.provider = new HardConfigurationProvider(output);
    this.configurationListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("hard.intelliSense") ||
          event.affectsConfiguration("hard.environment")) {
        this.refresh();
      }
    });
  }

  public async initialize(): Promise<void> {
    this.api = await getCppToolsApi(Version.latest);
    if (this.api === undefined) {
      this.output.append(
        "hard IntelliSense: Microsoft C/C++ API is unavailable; provider was not registered.\n",
      );
      return;
    }
    this.api.registerCustomConfigurationProvider(this.provider);
    this.api.notifyReady(this.provider);
  }

  public refresh(): void {
    if (this.api === undefined) {
      return;
    }
    this.api.didChangeCustomConfiguration(this.provider);
    this.api.didChangeCustomBrowseConfiguration(this.provider);
  }

  public dispose(): void {
    this.configurationListener.dispose();
    this.provider.dispose();
    this.api?.dispose();
    this.api = undefined;
  }
}
