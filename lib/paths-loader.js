const fs = require("fs/promises");
const path = require("path");
const { compile, compileForPathOrAncestor } = require("./globs");

// Finds the stylesheet files a project's variables can be scanned out of.
//
// This replaced a forked Task that walked the tree itself with `fs.readdir` and
// `async.each`. That walker could not work any more regardless: it asked
// `lumine.project.repositories[0].getRepo()` for the VCS ignore rules, from
// inside a child process where there is no `lumine` global at all -- and both
// of those APIs have since been removed from the editor. The editor's bundled
// ripgrep does the same walk far faster and honours `.gitignore` itself.

// Exclusions reach the editor's crawler before it descends into directories.
// Filtering only after collecting ripgrep's entire output still walked every
// ignored dependency tree and split its paths in one renderer-blocking pass.
// Inclusions stay in JS: a positive ripgrep glob overrides VCS ignore files.
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
  if (signal?.aborted) return [];

  const files = [];
  let crawl;
  const cancel = () => crawl?.cancel();
  try {
    crawl = lumine.project.crawl({
      directoryPaths: [root],
      ignoredNames,
      useCoreIgnoredNames: false,
      followSymlinks: traverseIntoSymlinkDirectories,
      excludeVcsIgnoredPaths: ignoreVcsIgnores,
      didFindPaths: (paths) => {
        if (signal?.aborted) return;
        for (const filePath of paths) {
          const relativePath = path.relative(root, filePath);
          if (onFound) onFound(relativePath);
          else files.push(relativePath);
        }
      },
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    await crawl;
  } catch {
    // A missing or unreadable root contributes no paths, as before.
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return signal?.aborted ? [] : files;
}

async function hasChangedSince(filePath, timestamp) {
  if (!timestamp) return true;
  try {
    const stats = await fs.stat(filePath);
    return stats.ctime >= timestamp;
  } catch {
    return false;
  }
}

// Resolves to the paths that need scanning and the known paths that no longer
// qualify, matching the shape the previous task emitted.
async function loadPaths({
  paths = [],
  sourceNames = [],
  ignoredNames = [],
  isIgnored = null,
  ignoreVcsIgnores = true,
  knownPaths = [],
  timestamp = null,
  traverseIntoSymlinkDirectories = false,
  signal,
} = {}) {
  const isSource = compile(sourceNames);
  const matchesIgnored = isIgnored || compileForPathOrAncestor(ignoredNames);

  const found = new Set();
  for (const root of paths) {
    if (signal?.aborted) return { dirtied: [], removed: [] };
    await listFiles(root, {
      ignoreVcsIgnores,
      ignoredNames,
      traverseIntoSymlinkDirectories,
      signal,
      onFound: (relativePath) => {
        if (isSource(relativePath) && !matchesIgnored(relativePath)) {
          found.add(path.resolve(root, relativePath));
        }
      },
    });
  }
  if (signal?.aborted) return { dirtied: [], removed: [] };

  const known = new Set(knownPaths);
  const dirtied = [];
  // Sorted, because ripgrep reports files in traversal order and the previous
  // walker reported them in directory order. Neither is stable across
  // platforms, and the project's path list is serialized and compared.
  for (const filePath of [...found].sort()) {
    if (signal?.aborted) return { dirtied: [], removed: [] };
    if (!known.has(filePath) || (await hasChangedSince(filePath, timestamp))) {
      dirtied.push(filePath);
    }
  }
  if (signal?.aborted) return { dirtied: [], removed: [] };

  // A known path only counts as lost when it sits under a root we just walked;
  // a path from a project root that has since been removed is not this scan's
  // business.
  const removed = knownPaths.filter(
    (filePath) => !found.has(filePath) && paths.some((root) => filePath.startsWith(root)),
  );

  return { dirtied, removed };
}

module.exports = { loadPaths, listFiles };
