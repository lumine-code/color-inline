const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const picomatch = require("picomatch");
const { ripgrepPath } = require("lumine");
const { compile } = require("./globs");

let cancelled = false;
const children = new Set();
process.on("message", ({ event } = {}) => {
  if (event !== "color-inline:cancel-paths") return;
  cancelled = true;
  for (const child of children) child.kill();
});

// Patterns are validated/normalized by the public editor API before IPC. This
// predicate mirrors its rooted-name and ancestor semantics inside the worker.
function ignoredMatcher(patterns, nocase) {
  const entries = patterns.map((pattern) => ({
    anchored: pattern.includes("/"),
    match: picomatch(pattern.replace(/^\/+/, ""), {
      dot: true,
      nocase,
      noext: true,
      nonegate: true,
      strictBrackets: true,
    }),
  }));
  return (relativePath) => {
    let prefix = "";
    for (const part of relativePath.replace(/\\/g, "/").split("/")) {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (entries.some((entry) => entry.match(entry.anchored ? prefix : part))) return true;
    }
    return false;
  };
}

function crawl(root, options, onFound) {
  return new Promise((resolve) => {
    if (cancelled) return resolve();
    const args = ["--files", "--hidden", "--null", "--no-messages"];
    if (!options.ignoreVcsIgnores) args.push("--no-ignore-vcs");
    if (options.traverseIntoSymlinkDirectories) args.push("--follow");
    const flag = options.caseInsensitive ? "--iglob" : "--glob";
    for (const pattern of [...options.ignoredNames, ".git", ".hg", ".svn"]) {
      args.push(flag, `!${pattern}`);
    }
    // Positive globs override VCS rules, so source inclusion remains below in
    // this worker rather than resurrecting gitignored stylesheets in ripgrep.
    let child;
    try {
      child = spawn(ripgrepPath, args, { cwd: root, windowsHide: true });
    } catch {
      resolve();
      return;
    }
    children.add(child);
    let remainder = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (cancelled) return;
      const paths = (remainder + chunk).split("\0");
      remainder = paths.pop();
      for (const relativePath of paths) {
        if (relativePath) onFound(relativePath);
      }
    });
    child.stderr.on("data", () => {});
    const complete = () => {
      children.delete(child);
      resolve();
    };
    child.on("error", complete);
    child.on("close", complete);
  });
}

function isUnderRoot(root, filePath) {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

async function discover({
  kind,
  paths = [],
  sourceNames = [],
  ignoredNames = [],
  ignoreVcsIgnores = true,
  traverseIntoSymlinkDirectories = false,
  caseInsensitive = false,
  knownPaths = [],
  timestamp,
  includeFound = false,
}) {
  const isSource = compile(sourceNames);
  const isIgnored = ignoredMatcher(ignoredNames, caseInsensitive);
  const found = new Set();
  const files = [];
  const options = {
    ignoredNames,
    ignoreVcsIgnores,
    traverseIntoSymlinkDirectories,
    caseInsensitive,
  };
  for (const root of paths) {
    await crawl(root, options, (relativePath) => {
      if (kind !== "list" && !isSource(relativePath)) return;
      if (isIgnored(relativePath)) return;
      if (kind === "list") files.push(relativePath);
      else found.add(path.resolve(root, relativePath));
    });
    if (cancelled) return kind === "list" ? { files: [] } : { dirtied: [], removed: [] };
  }
  if (kind === "list") return { files };

  const known = new Set(knownPaths);
  const since = timestamp ? new Date(timestamp) : null;
  const dirtied = [];
  for (const filePath of [...found].sort()) {
    if (cancelled) return { dirtied: [], removed: [] };
    if (!known.has(filePath) || !since) {
      dirtied.push(filePath);
      continue;
    }
    try {
      if ((await fs.stat(filePath)).ctime >= since) dirtied.push(filePath);
    } catch {
      // A file can disappear between ripgrep's listing and the timestamp check.
    }
  }
  if (cancelled) return { dirtied: [], removed: [] };
  return {
    dirtied,
    removed: knownPaths.filter(
      (filePath) => !found.has(filePath) && paths.some((root) => isUnderRoot(root, filePath)),
    ),
    ...(includeFound ? { found: [...found] } : {}),
  };
}

module.exports = function (options) {
  const complete = this.async();
  discover(options).then(complete, (error) => complete({ error: error.message }));
};
