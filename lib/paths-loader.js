const path = require("path");
const timers = require("node:timers");

// Ripgrep traversal, path decoding, source matching, sorting and timestamp
// checks all run in a Task. The renderer receives only stylesheet candidates.
function discover(options, { signal, cancelledResult }) {
  if (signal?.aborted) return Promise.resolve(cancelledResult);
  const matcher = lumine.project.compileIgnoredNames(options.ignoredNames ?? [], {
    useCoreIgnoredNames: false,
  });
  const caseInsensitive = lumine.project
    .compileIgnoredNames(["color-inline-case-probe"], { useCoreIgnoredNames: false })
    .matches("COLOR-INLINE-CASE-PROBE");

  return new Promise((resolve, reject) => {
    let task, child, errors, cancelTimer;
    let settled = false;
    let cancelled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", cancel);
      errors?.dispose();
      child?.removeListener("exit", exited);
      child?.removeListener("error", failed);
      if (cancelTimer) timers.clearTimeout(cancelTimer);
      task?.terminate();
    };
    const finish = (result, error) => {
      cleanup();
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    };
    const failed = (error) => finish(cancelledResult, cancelled ? null : error);
    const exited = (code, signalName) =>
      failed(new Error(`Color Inline path worker exited (${signalName ?? code}).`));
    const cancel = () => {
      cancelled = true;
      if (!settled) {
        settled = true;
        resolve(cancelledResult);
      }
      // Let the worker kill its own ripgrep before exiting, so cancelling a
      // project does not orphan an expensive directory crawl on Windows.
      try {
        task.send({ event: "color-inline:cancel-paths", args: [] });
        cancelTimer = timers.setTimeout(cleanup, 1000);
      } catch {
        cleanup();
      }
    };

    try {
      const { Task } = require("lumine");
      task = new Task(require.resolve("./paths-worker"));
      errors = task.on("task:error", (message) => failed(new Error(message)));
      task.start({ ...options, ignoredNames: matcher.patterns, caseInsensitive }, (result) => {
        if (cancelled) return finish(cancelledResult);
        if (result?.error) return failed(new Error(result.error));
        finish(result);
      });
      child = task.childProcess;
      child?.once("exit", exited);
      child?.once("error", failed);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    } catch (error) {
      failed(error);
    }
  });
}

async function listFiles(
  root,
  {
    ignoreVcsIgnores = true,
    ignoredNames = [],
    traverseIntoSymlinkDirectories = false,
    signal,
    onFound,
  } = {},
) {
  const result = await discover(
    {
      kind: "list",
      paths: [root],
      ignoredNames,
      ignoreVcsIgnores,
      traverseIntoSymlinkDirectories,
    },
    { signal, cancelledResult: { files: [] } },
  );
  if (onFound) {
    for (const filePath of result.files) onFound(filePath);
    return [];
  }
  return result.files;
}

async function loadPaths({ signal, isIgnored, ...options } = {}) {
  const result = await discover(
    { kind: "load", ...options, includeFound: Boolean(isIgnored) },
    { signal, cancelledResult: { dirtied: [], removed: [] } },
  );
  if (isIgnored) {
    // Private callers that supplied an extra live predicate receive only the
    // already-filtered source candidates. Bulk filesystem work stays in Task.
    const roots = options.paths ?? [];
    const ignored = (filePath) => roots.some((root) => isIgnored(path.relative(root, filePath)));
    const rejected = (result.found ?? result.dirtied).filter(ignored);
    const known = new Set(options.knownPaths ?? []);
    result.dirtied = result.dirtied.filter((filePath) => !ignored(filePath));
    result.removed = [
      ...new Set([...result.removed, ...rejected.filter((filePath) => known.has(filePath))]),
    ];
  }
  return { dirtied: result.dirtied, removed: result.removed };
}

module.exports = { loadPaths, listFiles };
