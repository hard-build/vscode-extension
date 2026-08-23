import type * as vscode from "vscode";

import { HardCommands } from "./commands";
import { HardFormatting } from "./formatting";
import { HardIntelliSense } from "./intellisense";
import { HardOutput } from "./output";
import { HardTaskProvider } from "./tasks";
import { HardTesting } from "./testing";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = new HardOutput();
  const formatting = new HardFormatting(output);
  const testing = new HardTesting(output);
  const intelliSense = new HardIntelliSense(output);
  const tasks = new HardTaskProvider();
  const commands = new HardCommands(output, testing, intelliSense);

  context.subscriptions.push(commands, formatting, tasks, testing, intelliSense, output);
  await intelliSense.initialize();
}
