import path from "node:path";

export interface CompilerFlagAnalysis {
  includePaths: string[];
  forcedIncludes: string[];
  defines: string[];
  standard: string | undefined;
}

function resolveCompilerPath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

export function analyzeCompilerFlags(
  arguments_: readonly string[],
  cwd: string,
): CompilerFlagAnalysis {
  const includePaths: string[] = [];
  const forcedIncludes: string[] = [];
  const defines: string[] = [];
  let standard: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index] ?? "";
    if (argument === "-I" || argument === "-isystem" || argument === "-iquote") {
      const value = arguments_[index + 1];
      if (value !== undefined) {
        includePaths.push(resolveCompilerPath(cwd, value));
        index += 1;
      }
    } else if (argument.startsWith("-I") && argument.length > 2) {
      includePaths.push(resolveCompilerPath(cwd, argument.slice(2)));
    } else if (argument.startsWith("-isystem") && argument.length > 8) {
      includePaths.push(resolveCompilerPath(cwd, argument.slice(8)));
    } else if (argument.startsWith("-iquote") && argument.length > 7) {
      includePaths.push(resolveCompilerPath(cwd, argument.slice(7)));
    } else if (argument === "-include") {
      const value = arguments_[index + 1];
      if (value !== undefined) {
        forcedIncludes.push(resolveCompilerPath(cwd, value));
        index += 1;
      }
    } else if (argument.startsWith("-include") && argument.length > 8) {
      forcedIncludes.push(resolveCompilerPath(cwd, argument.slice(8)));
    } else if (argument === "-D") {
      const value = arguments_[index + 1];
      if (value !== undefined) {
        defines.push(value);
        index += 1;
      }
    } else if (argument.startsWith("-D") && argument.length > 2) {
      defines.push(argument.slice(2));
    } else if (argument.startsWith("-std=")) {
      standard = argument.slice(5);
    }
  }

  return {
    includePaths: [...new Set(includePaths)],
    forcedIncludes: [...new Set(forcedIncludes)],
    defines: [...new Set(defines)],
    standard,
  };
}
