# IgnoreLens Codebase Review
<!-- Date: 10/06/2026 -->

**Reviewer:** Principal Engineer review (architecture, performance/efficiency, reliability only)
**Version reviewed:** 1.0.0 (branch `dev`)
**Status:** COMPLETE

## Scope and Assumptions

- Focus areas: architecture, performance/efficiency, reliability.
- Explicitly out of scope: style, formatting, naming, cosmetic refactors, minor debt, non-reliability testing, non-critical security.
- The codebase is small (around 10 source modules under `src/`), so the entire runtime path was reviewed: activation (`extension.ts`), scanning (`workspaceScanner.ts`), the parser/matcher/count strategies, the decoration provider, the decoration cache, and the logger. Test suites were skimmed only for reliability relevance.
- The dominant cost model of this extension is: (number of files in the workspace) x (number of patterns in the open ignore file), recomputed from scratch on every refresh. All of the highest value findings flow from that.

## Summary of Findings

| # | Finding | Area | Effort | Priority |
|---|---------|------|--------|----------|
| 1 | Full workspace re-enumeration on every refresh, no file list cache | Performance | Medium | Highest |
| 2 | Synchronous O(patterns x files) matching blocks the extension host, no mid-work cancellation | Performance/Reliability | Medium | High |
| 3 | No error handling on the async update path, decorations can silently freeze | Reliability | Small | High |
| 4 | Always-on `**/*` file watcher does per-event work and triggers refresh storms | Performance/Operational | Small | Medium |
| 5 | 45 `workspaceContains:**/...` activation events cost every workspace at startup | Architecture/Operational | Small | Medium |

---

## Finding 1: Full workspace re-enumeration on every refresh

**Problem.** Every decoration update re-enumerates the entire workspace folder from scratch. There is no caching of the file list between updates, even though the extension already owns a `FileSystemWatcher` that is told about every create and delete.

**Evidence.**
- `src/workspaceScanner.ts:30` calls `vscode.workspace.findFiles(pattern, null)` with excludes disabled (deliberately, so `node_modules` and similar are included in counts).
- `src/decorationProvider.ts:335` calls `getFilesInFolder` inside `updateDecorations`, which runs on every editor switch, every debounced keystroke in an ignore file, every config change, and every file create/delete event (`extension.ts:74-84`).
- For nested ignore files, the whole folder is scanned first and then filtered down by prefix in JavaScript (`decorationProvider.ts:351-356`), so a `.gitignore` deep inside a monorepo still pays for the full repository scan.

**Impact.** On a large workspace (a monorepo, or anything with a populated `node_modules`), `findFiles` over everything with no excludes can take seconds and significant I/O. That cost is paid per keystroke (after the 500 ms debounce) and per watcher event. It is the single biggest scalability limit of the extension, and it also inflates the latency window during which users see stale (darker) decorations.

**Fix.** Cache the normalised file list per workspace folder in `WorkspaceScanner`. Maintain it incrementally from the existing watcher: add the relative path on `onDidCreate`, remove it on `onDidDelete`. Do one full `findFiles` per folder on first use (or on activation), and re-scan fully only on workspace folder changes or as a rare consistency fallback. The nested ignore file prefix filter can then run against the cached list at near zero cost.

**Effort.** Medium. The scanner is already a seam (one class, one method), and the watcher already exists. Main care points: multi-root keying, renames arriving as delete+create, and invalidation on `vscode.workspace.onDidChangeWorkspaceFolders`.

**Expected benefit.** Refresh latency drops from O(workspace scan) to O(matching only) for the common case. This is an order of magnitude improvement on large workspaces and removes most of the disk I/O the extension generates.

---

## Finding 2: Synchronous O(patterns x files) matching with no mid-work cancellation

**Problem.** Pattern matching runs synchronously on the extension host event loop, with cost proportional to patterns x files, and cannot be cancelled once started.

**Evidence.**
- `src/decorationProvider.ts:463-516` (`collectLineData`) loops over every pattern line and calls `matcher.findMatches(pattern, workspaceFiles)` for each, fully synchronously.
- Each `findMatches` iterates every workspace file: `src/matcherStrategy.ts:141-147` (gitignore path, one `ig.ignores(file)` call per file), `src/matcherStrategy.ts:259-263` (minimatch path).
- The superseded-update guard (`updateVersion`) is checked only before matching starts (`decorationProvider.ts:338`) and after it finishes (`decorationProvider.ts:374`). A superseded update still completes 100% of its matching work before its result is thrown away.
- `GitignoreMatcher.findMatches` also constructs a fresh `ignore()` instance per pattern per refresh (`matcherStrategy.ts:138-139`); compiled patterns are never reused across refreshes even though the pattern text rarely changes between keystrokes.

**Impact.** A 100 line ignore file against a 100k file workspace is roughly 10 million glob tests in one synchronous burst. While that runs, the extension host is blocked: this extension's own debounce timers, other extensions, and language features all stall. Rapid typing makes it worse, because each superseded update still runs to completion (the work is wasted, but the blocking is not avoided).

**Fix.** Three incremental steps, in value order:
1. Make `collectLineData` cooperatively async: every N patterns (or N x 10k file tests), `await` a microtask/`setImmediate` and check `thisVersion !== this.updateVersion`, returning early if superseded. This bounds wasted work and unblocks the event loop.
2. Reuse compiled matchers across refreshes keyed by (file type, pattern text), since edits typically change one line while the other patterns are unchanged.
3. Optionally, exploit the cumulative structure: lines above the edited line have unchanged match results for an unchanged file list, so per-line match results can be cached and only recomputed from the first edited line downward.

**Effort.** Medium. Step 1 alone is small (a yield plus a version check inside the loop) and delivers most of the responsiveness win. Steps 2 and 3 add bookkeeping and need cache invalidation when the file list changes.

**Expected benefit.** The extension host stays responsive on large inputs, wasted work on superseded updates is bounded, and steady-state editing cost drops sharply when combined with Finding 1.

---

## Finding 3: No error handling on the async update path

**Problem.** `updateDecorations` is async and is invoked fire-and-forget everywhere, with no try/catch anywhere on the path. A single thrown error becomes an unhandled promise rejection and the user-visible failure mode is that decorations silently stop updating, potentially stuck in the stale (darker) colours forever.

**Evidence.**
- `src/decorationProvider.ts:711-716` and `:721`: `this.updateDecorations(editor)` called inside `setTimeout` and directly, no `await`, no `.catch`.
- `src/extension.ts:100`: same fire-and-forget call during activation.
- Inside the path, several operations can realistically throw or reject: `findFiles` (workspace disposed mid-scan, editor closed), `new Minimatch(...)` (minimatch throws on patterns longer than 64 KB, and pathological brace expansions are possible since user-typed pattern text is passed straight in), and `editor.setDecorations` on a disposed editor.
- There is also no recovery signal: because the cache is "overwrite, never clear" (`src/decorationCache.ts:43`), a failure after stale decorations were painted (`decorationProvider.ts:299-305`) leaves stale visuals applied with nothing to replace them.

**Impact.** Low frequency but bad failure mode: the extension appears to work (old numbers shown in darker colours) while actually displaying wrong counts indefinitely, with no log, no message, and no self-healing until the next successful update. For a tool whose entire purpose is showing correct counts, silently wrong output is the worst reliability outcome.

**Fix.** Wrap the body of `updateDecorations` in try/catch: log the error via the existing logger, clear the stale decoration types so wrong data is not left painted, and leave the version counter consistent so the next trigger retries cleanly. Add `.catch` (or `void` with an internal catch) at the three call sites. Consider a per-line guard so one malformed pattern yields a "?" count for that line instead of aborting the whole file.

**Effort.** Small. A few localised changes, no design impact.

**Expected benefit.** Eliminates the silent permanent freeze failure mode and makes failures observable through the existing debug channel.

---

## Finding 4: Always-on `**/*` watcher with per-event overhead and refresh storms

**Problem.** The extension registers a workspace-wide `**/*` watcher at activation and does non-trivial work on every create and delete event in the workspace, whether or not an ignore file is even open.

**Evidence.**
- `src/extension.ts:70` creates `createFileSystemWatcher('**/*')` unconditionally at activation, and combined with Finding 5 the extension activates in essentially every workspace.
- `src/extension.ts:74-84`: every create/delete event calls `logger.log('File created: ' + uri.fsPath)`. `Logger.log` calls `isDebugEnabled()` which calls `vscode.workspace.getConfiguration('ignorelens')` per event (`src/logger.ts:26-29`), plus the string concatenation happens before the debug check, so this cost is paid even with debug off.
- Each event then calls `refreshActiveEditor`, and if an ignore file happens to be the active editor, schedules a debounced full refresh (full workspace scan plus full matching, per Findings 1 and 2). Bulk operations such as `git checkout`, `npm install`, or a build emitting output fire hundreds to thousands of events; with an ignore file open, the user gets repeated full rescans as the debounce window keeps closing and reopening.
- Events are not filtered by workspace folder, so changes in an unrelated folder of a multi-root workspace also trigger refreshes of the active ignore file.

**Impact.** Constant background overhead in every workspace where the extension is installed, and refresh storms exactly when the machine is already busy (checkouts, installs, builds). This is operational cost imposed on all users, not just those with large ignore files.

**Fix.** Three cheap changes:
1. Hoist the debug-enabled check (or move the concatenation inside `log` after the check) so disabled logging costs one boolean.
2. In the watcher handlers, do nothing unless the active editor is a supported ignore file, and the changed URI belongs to that editor's workspace folder. (With Finding 1 implemented, the handler instead becomes "update the cached file list", which is the right shape anyway.)
3. Ignore events for paths that cannot affect counts for the open file (different folder root, or outside the nested ignore file's directory prefix).

**Effort.** Small.

**Expected benefit.** Near zero idle cost, and no repeated full rescans during bulk file operations.

---

## Finding 5: 45 `workspaceContains:**/...` activation events tax every workspace at startup

**Problem.** `package.json` declares 45 `workspaceContains:**/<name>` activation events. Each `workspaceContains` glob triggers a workspace file search when any folder is opened, in every workspace, for every user, before the extension has done anything useful. The VS Code documentation explicitly warns that `workspaceContains` patterns with `**` are expensive and degrade startup.

**Evidence.**
- `package.json:27-75` (activation events list, `workspaceContains:**/.aiderignore` through `workspaceContains:**/.yarnignore`).
- Consequence chaining: because almost any real project contains at least one of these files (`.gitignore` alone), the extension activates eagerly almost everywhere, which in turn installs the global watcher from Finding 4 even when no ignore file is ever opened.

**Impact.** Startup cost in every workspace plus permanent activation (watcher, listeners) in workspaces where the user never opens an ignore file. For a published extension this is the kind of cost that shows up in VS Code's startup performance attribution and in marketplace reviews.

**Fix.** Drop all `workspaceContains` entries. The extension only does anything when an ignore file is the active editor, so activation can be driven entirely by file open: keep `onLanguage:ignore`, and add a `contributes.languages` entry that associates the supported filenames (the same list as `supportedFiles.ts`) with the `ignore` language id (filename associations, no new language needed). Files then activate the extension the moment one is opened, which is the only moment activation matters. The initial decoration on open is already handled by the `onDidOpenTextDocument` and active editor paths.

**Effort.** Small. One `package.json` change plus verification that decorations still appear on first open for each file family (the language association also improves syntax highlighting for these files as a side effect).

**Expected benefit.** Zero startup cost for workspaces, no eager activation, and the Finding 4 watcher only exists in sessions that actually use the extension.

---

## Further Observations (not in the top 5)

These were noted but judged lower value or lower confidence. Listed for completeness, no action required.

- **`findFiles` semantics are load-bearing and under-verified.** The scan passes `null` excludes to include everything, yet the project's own CLAUDE.md states that `findFiles` respects the project's `.gitignore` (the reason the manual test directory is kept external). Those two statements are in tension. If ignore files are ever respected, counts are systematically wrong in any real repository; if `.git` contents are included (which `null` excludes implies), counts and the "N files" summary include `.git` internals that git itself never considers. Worth pinning down with a small integration test against a fixture repo, since the entire product output depends on this one API's behaviour.
- **Unbounded decoration cache.** `decorationCache` (`src/decorationCache.ts:46`) grows per document URI and is never evicted, including for closed documents. Entries are small, so this is minor; an `onDidCloseTextDocument` eviction or a simple LRU cap would close it.
- **Shared debounce timer.** `DecorationProvider` holds a single `updateTimeout`, which is correct while updates only ever target the active editor, but it is an implicit invariant; a comment or an assertion would prevent a future regression if split editors are ever supported.
- **`isUnderIgnoredDir` is O(files x ignoredDirs)** (`src/countStrategy.ts:33-40`). Fine at current scale; a sorted prefix array or trie would help only on pathological inputs, so not worth it now.
