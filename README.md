# hard Build System for Visual Studio Code

This extension connects Visual Studio Code to the hard C and C++ build system.
It uses hard's own public commands and test-selector syntax; it does not expose
GoogleTest command-line arguments.

## Requirements

- Visual Studio Code 1.125 or newer.
- hard available on PATH, or an explicit **hard.executable** setting.
- Microsoft C/C++ (ms-vscode.cpptools), installed as an extension dependency.
- GoogleTest and its pkg-config metadata for projects that use hard test.

## Features

- Commands for format, build, fetch, and test.
- C and C++ document formatting, including format-on-save.
- A hard task type with generated Format, Build, Fetch, and Test tasks.
- GCC/Clang diagnostics in the Problems view.
- Test Explorer discovery at workspace, source, suite, and case level.
- Normal and no-cache Test Explorer profiles.
- hard-aware Microsoft C/C++ configurations, including HARD_CFLAGS,
  HARD_ROOT/source, the environment hard.h, and a generated source forward.
- Automatic selection as the default Microsoft C/C++ configuration provider.
- Multi-root workspace support.
- Process cancellation without invoking a shell.

## Commands

| Command | Behavior |
| --- | --- |
| **hard: Format** | Formats the active hard source, or the workspace when no source is active. |
| **hard: Build** | Builds the active hard source, or the workspace. |
| **hard: Rebuild Without Cache** | Builds with --no-cache. |
| **hard: Fetch Dependencies** | Runs hard fetch. |
| **hard: Test** | Tests the active hard test source, or the workspace. |
| **hard: Test Without Cache** | Tests with --no-cache. |
| **hard: Test Current File** | Tests the active test source. |
| **hard: List Tests** | Shows hard's normalized --list-tests output. |
| **hard: Refresh Test Explorer** | Rediscovers test source files and invalidates case lists. |
| **hard: Show Output** | Opens the hard Output channel. |
| **hard: Refresh IntelliSense** | Requests fresh source and browse configurations from Microsoft C/C++. |

Editor-title buttons are contributed for Build and Test Current File.

## Formatting

The extension registers `hard-build.hard-vscode` as a document formatter for
file-backed C and C++ documents and supplies it as their default formatter.
With `editor.formatOnSave` enabled, saving a document therefore formats it
through the configured hard executable and style.

The provider writes the current editor text, including unsaved changes, to an
isolated temporary file with the original basename and extension. It runs
`hard format` only on that file, reads the formatted result, deletes the
temporary directory, and returns one text edit to VS Code. The external process
never rewrites the open source file directly. A stale result is discarded if
the document changes again before formatting finishes.

An explicit user or workspace `editor.defaultFormatter` overrides the supplied
default. Use **Format Document With...: Configure Default Formatter** and choose
**hard Build System** to switch back. Format-on-save itself remains controlled
by `editor.formatOnSave`.

## Test Explorer

The explorer first discovers test sources with the configured glob. Expanding
a source performs:

    hard test --silent --no-color --list-tests <source>

This can parse, compile, and link the test source; those preparation steps use
hard's normal caches. The normalized names are shown as suites and cases.

Running a case passes one exact hard selector. Running a suite passes its known
cases as repeated exact selectors. Running a source or workspace runs all
selected tests. The **Run Without Cache** profile adds --no-cache. A cached
successful result is shown as passed after hard reports Testing ... (CACHED).

Selectors remain hard selectors. An asterisk means zero or more characters and
a question mark means exactly one character. The extension never constructs or
accepts a raw GoogleTest negative filter.

## Tasks

The extension contributes detected tasks for all four public hard commands.
Custom tasks use type hard:

    {
      "version": "2.0.0",
      "tasks": [
        {
          "type": "hard",
          "command": "build",
          "paths": ["src/main.cpp"],
          "noCache": true,
          "group": "build",
          "problemMatcher": ["$gcc"],
          "label": "hard: rebuild application"
        },
        {
          "type": "hard",
          "command": "test",
          "paths": ["tests"],
          "tests": ["Random.*", "Parser.Test?"],
          "group": "test",
          "problemMatcher": ["$gcc"],
          "label": "hard: selected tests"
        }
      ]
    }

Supported task properties are command, paths, tests, listTests, noCache,
silent, output, and format. Task arguments are passed directly to the process;
JSON wildcard values do not need shell quoting.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| **hard.executable** | hard | Executable path or command name. |
| **hard.environment** | empty object | Environment overrides such as HARD_ROOT, HARD_ENV, HARD_CC, HARD_CFLAGS, and HARD_LDFLAGS. |
| **hard.jobs** | 0 | Parallel jobs; zero means every logical CPU. |
| **hard.noCache** | false | Default --no-cache for build and test. |
| **hard.noColor** | true | Stable Output and diagnostic text. |
| **hard.output** | empty | Default build output. |
| **hard.format** | empty | Format style below HARD_ROOT/format. |
| **hard.testSourcePattern** | case-insensitive hard test-source glob | Test-source discovery glob. |
| **hard.testExcludePattern** | VCS and node_modules directories | Discovery exclusion glob. |
| **hard.intelliSense.enabled** | true | Enables the cpptools provider. |
| **hard.intelliSense.compilerPath** | empty | Compiler override; otherwise HARD_CC, then c++. |
| **hard.intelliSense.cppStandard** | c++20 | Fallback when HARD_CFLAGS has no -std option. |
| **hard.intelliSense.extraIncludePaths** | empty array | Extra workspace-relative or absolute include paths. |
| **hard.intelliSense.extraDefines** | empty array | Extra preprocessor definitions. |
| **hard.intelliSense.extraCompilerArguments** | empty array | Extra cpptools compiler arguments. |

The hard.environment object is merged over the extension-host environment for
commands, tasks, discovery, and IntelliSense.

## IntelliSense details

The extension supplies `hard-build.hard-vscode` as the default value of
`C_Cpp.default.configurationProvider`. This makes `HARD_ROOT/source` available
to includes such as `#include <hard/application/application.h>` without a
manual provider-selection step. An explicit user or workspace value continues
to override this default. Use **C/C++: Change Configuration Provider** to
switch back to hard after selecting another provider.

The provider mirrors hard's defaults when HARD_CFLAGS is unset. When it is set,
the extension parses the value with POSIX-like quoting and extracts -I,
-isystem, -iquote, -include, -D, and -std options. The complete compiler
argument vector is also passed to Microsoft C/C++.

For a source file, the provider force-includes this generated path only when it
exists:

    HARD_ROOT/env/HARD_ENV/build/<mirrored-absolute-source>.fwd.h

Build and test commands refresh the provider so a newly generated forward
becomes visible without reloading the window.

## Diagnostics and output

Commands write their exact executable and argument vector to the **hard**
Output channel. GCC/Clang error, warning, and note records are published to the
Problems view. Tasks additionally use VS Code's built-in $gcc problem matcher.

## Workspace trust

The extension is disabled in untrusted and virtual workspaces because hard
compiles, links, and executes workspace code.

## Development

    npm install
    npm run check
    npm run package

The check script performs typed linting, TypeScript compilation, and Node unit
tests. The package script also creates hard-vscode-0.1.0.vsix. Use the
**Run hard Extension** launch configuration to open an Extension Development
Host.
