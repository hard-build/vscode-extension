import path from "node:path";

import * as vscode from "vscode";

export interface HardSettings {
  executable: string;
  environment: Readonly<Record<string, string>>;
  jobs: number;
  noCache: boolean;
  noColor: boolean;
  output: string;
  format: string;
  testSourcePattern: string;
  testExcludePattern: string;
  intelliSense: {
    enabled: boolean;
    compilerPath: string;
    cppStandard: string;
    extraIncludePaths: readonly string[];
    extraDefines: readonly string[];
    extraCompilerArguments: readonly string[];
  };
}

function stringArray(configuration: vscode.WorkspaceConfiguration, name: string): string[] {
  return (configuration.get<unknown[]>(name, []) ?? []).filter(
    (value): value is string => typeof value === "string",
  );
}

function environmentMap(configuration: vscode.WorkspaceConfiguration): Record<string, string> {
  const raw = configuration.get<Record<string, unknown>>("environment", {});
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      result[name] = value;
    }
  }
  return result;
}

export function getHardSettings(folder: vscode.WorkspaceFolder): HardSettings {
  const configuration = vscode.workspace.getConfiguration("hard", folder.uri);
  return {
    executable: configuration.get("executable", "hard"),
    environment: environmentMap(configuration),
    jobs: configuration.get("jobs", 0),
    noCache: configuration.get("noCache", false),
    noColor: configuration.get("noColor", true),
    output: configuration.get("output", ""),
    format: configuration.get("format", ""),
    testSourcePattern: configuration.get(
      "testSourcePattern",
      "**/*_[tT][eE][sS][tT].{[cC],[cC][cC],[cC][pP][pP],[cC]++}",
    ),
    testExcludePattern: configuration.get(
      "testExcludePattern",
      "**/{.git,.hg,.svn,node_modules}/**",
    ),
    intelliSense: {
      enabled: configuration.get("intelliSense.enabled", true),
      compilerPath: configuration.get("intelliSense.compilerPath", ""),
      cppStandard: configuration.get("intelliSense.cppStandard", "c++20"),
      extraIncludePaths: stringArray(configuration, "intelliSense.extraIncludePaths"),
      extraDefines: stringArray(configuration, "intelliSense.extraDefines"),
      extraCompilerArguments: stringArray(
        configuration,
        "intelliSense.extraCompilerArguments",
      ),
    },
  };
}

export function workspacePath(folder: vscode.WorkspaceFolder, value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(folder.uri.fsPath, value);
}

export function hardPathArgument(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
  const relative = path.relative(folder.uri.fsPath, uri.fsPath);
  return relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    ? uri.fsPath
    : relative;
}

export async function selectWorkspaceFolder(
  resource?: vscode.Uri,
): Promise<vscode.WorkspaceFolder | undefined> {
  if (resource !== undefined) {
    const resourceFolder = vscode.workspace.getWorkspaceFolder(resource);
    if (resourceFolder !== undefined) {
      return resourceFolder;
    }
  }

  const editorFolder =
    vscode.window.activeTextEditor === undefined
      ? undefined
      : vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
  if (editorFolder !== undefined) {
    return editorFolder;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showErrorMessage("Open a workspace folder before running hard.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }

  const selected = await vscode.window.showQuickPick(
    folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    { placeHolder: "Select the workspace folder for hard" },
  );
  return selected?.folder;
}
