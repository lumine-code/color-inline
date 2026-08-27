const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { ripgrepPath } = require("lumine");
const { compile, compileForPathOrAncestor } = require("./globs");

// Finds the stylesheet files a project's variables can be scanned out of.
//
// This replaced a forked Task that walked the tree itself with `fs.readdir` and
// `async.each`. That walker could not work any more regardless: it asked
// `lumine.project.repositories[0].getRepo()` for the VCS ignore rules, from
// inside a child process where there is no `lumine` global at all -- and both
// of those APIs have since been removed from the editor. The editor's bundled
// ripgrep does the same walk far faster and honours `.gitignore` itself.

// Lists every file under `root`. Include/exclude globs are applied in JS rather
// than passed as `-g`: a *positive* ripgrep glob overrides `.gitignore`, so
// `-g **/*.css` would resurrect exactly the ignored files the setting says to
// skip.
function listFiles(root, { ignoreVcsIgnores }) {
  return new Promise((resolve) => {
    const args = ["--files", "--null", "--no-messages", "--hidden", "-g", "!.git", "-g", "!.hg"];
    if (!ignoreVcsIgnores) args.push("--no-ignore");

    let child;
    try {
      child = spawn(ripgrepPath, args, { cwd: root });
    } catch {
      resolve([]);
      return;
    }

    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolve([]));
    child.on("close", () => {
      // Records are NUL-terminated rather than separated, so the trailing empty
      // element falls out with the filter.
      resolve(output.split("\0").filter(Boolean));
    });
  });
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
} = {}) {
  const isSource = compile(sourceNames);
  const matchesIgnored = isIgnored || compileForPathOrAncestor(ignoredNames);

  const found = new Set();
  for (const root of paths) {
    for (const relativePath of await listFiles(root, { ignoreVcsIgnores })) {
      if (!isSource(relativePath) || matchesIgnored(relativePath)) continue;
      found.add(path.resolve(root, relativePath));
    }
  }

  const known = new Set(knownPaths);
  const dirtied = [];
  // Sorted, because ripgrep reports files in traversal order and the previous
  // walker reported them in directory order. Neither is stable across
  // platforms, and the project's path list is serialized and compared.
  for (const filePath of [...found].sort()) {
    if (!known.has(filePath) || (await hasChangedSince(filePath, timestamp))) {
      dirtied.push(filePath);
    }
  }

  // A known path only counts as lost when it sits under a root we just walked;
  // a path from a project root that has since been removed is not this scan's
  // business.
  const removed = knownPaths.filter(
    (filePath) => !found.has(filePath) && paths.some((root) => filePath.startsWith(root)),
  );

  return { dirtied, removed };
}

module.exports = { loadPaths, listFiles };
