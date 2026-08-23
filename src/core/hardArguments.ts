export type HardCommand = "format" | "build" | "fetch" | "test";

export interface HardInvocation {
  command: HardCommand;
  paths?: readonly string[];
  tests?: readonly string[];
  jobs?: number;
  noCache?: boolean;
  noColor?: boolean;
  silent?: boolean;
  verbose?: boolean;
  listTests?: boolean;
  output?: string;
  format?: string;
}

function validateTestSelector(selector: string): void {
  if (selector.length === 0) {
    throw new Error("test selector must not be empty");
  }
  if (selector.includes(":")) {
    throw new Error(`test selector ${JSON.stringify(selector)} must not contain ':'`);
  }
  if (selector.includes("-")) {
    throw new Error(`test selector ${JSON.stringify(selector)} must not contain '-'`);
  }
}

export function buildHardArguments(invocation: HardInvocation): string[] {
  const arguments_: string[] = [invocation.command];
  const tests = invocation.tests ?? [];

  if (invocation.verbose === true && invocation.silent === true) {
    throw new Error("verbose and silent modes are mutually exclusive");
  }
  if (invocation.command !== "test" && (invocation.listTests === true || tests.length > 0)) {
    throw new Error("test selection is only valid for the test command");
  }
  if (invocation.listTests === true && tests.length > 0) {
    throw new Error("--list-tests and --test are mutually exclusive");
  }
  if (invocation.noCache === true && invocation.command !== "build" && invocation.command !== "test") {
    throw new Error("--no-cache is only valid for build and test");
  }
  if (invocation.output !== undefined && invocation.command !== "build") {
    throw new Error("--output is only valid for build");
  }
  if (invocation.format !== undefined && invocation.command !== "format") {
    throw new Error("--format is only valid for format");
  }
  if (invocation.jobs !== undefined && (!Number.isInteger(invocation.jobs) || invocation.jobs < 0)) {
    throw new Error("jobs must be a non-negative integer");
  }

  if (invocation.verbose === true) {
    arguments_.push("--verbose");
  } else if (invocation.silent === true) {
    arguments_.push("--silent");
  }
  if (invocation.noColor === true) {
    arguments_.push("--no-color");
  }
  if (invocation.jobs !== undefined) {
    arguments_.push(`--jobs=${invocation.jobs}`);
  }
  if (invocation.noCache === true) {
    arguments_.push("--no-cache");
  }
  if (invocation.output !== undefined && invocation.output !== "") {
    arguments_.push(`--output=${invocation.output}`);
  }
  if (invocation.format !== undefined && invocation.format !== "") {
    arguments_.push(`--format=${invocation.format}`);
  }
  if (invocation.listTests === true) {
    arguments_.push("--list-tests");
  }
  for (const selector of tests) {
    validateTestSelector(selector);
    arguments_.push(`--test=${selector}`);
  }
  arguments_.push(...(invocation.paths ?? []));
  return arguments_;
}
