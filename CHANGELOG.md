# Changelog

## 0.1.4 - 2026-08-26

- Resolve vendor library headers from hard parse-cache metadata for IntelliSense.
- Use a PNG extension icon for VSIX packaging compatibility.

## 0.1.3 - 2026-08-26

- Rename extension display name to `Hard Build`.
- Add `hard-build-square.svg` as the extension icon.

## 0.1.2 - 2026-08-23

- Register hard as a C and C++ document formatter and select it by default.
- Format the current editor text through an isolated temporary file so
  format-on-save never lets the external process rewrite the open source file.
- Preserve explicit formatter overrides and clean temporary files after
  successful, failed, or cancelled formatting.

## 0.1.1 - 2026-08-23

- Select `hard-build.hard-vscode` as the default Microsoft C/C++ configuration
  provider so hard include paths are active without manual provider selection.
- Preserve explicit user or workspace configuration-provider overrides.

## 0.1.0 - 2026-08-23

- Add hard format, build, fetch, test, no-cache, list, and refresh commands.
- Add cancellable hard tasks and GCC/Clang problem matching.
- Add Problems diagnostics from command output.
- Add lazy Test Explorer discovery through hard's normalized list interface.
- Add exact source, suite, and case execution with cached-result support.
- Add hard-aware Microsoft C/C++ source and browse configurations.
- Add multi-root settings, unit tests, development tasks, and VSIX packaging.
