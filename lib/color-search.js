/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [Emitter, CompositeDisposable, ColorContext] = Array.from([]);

// Offsets at which each line of `text` begins, so a match offset can be turned
// into a row and column without re-scanning the file per match.
function offsetsOfLineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

function rowForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

module.exports = class ColorSearch {
  static deserialize(state) {
    return new ColorSearch(state.options);
  }

  constructor(options = {}) {
    this.options = options;
    ({
      sourceNames: this.sourceNames,
      ignoredNames: this.ignoredNameSources,
      context: this.context,
      project: this.project,
    } = this.options);
    if (Emitter == null) {
      ({ Emitter, CompositeDisposable } = require("lumine"));
    }
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();

    if (this.project != null) {
      this.init();
    } else {
      var subscription = lumine.packages.onDidActivatePackage((pkg) => {
        if (this.destroyed) return;
        if (pkg.name === "color-inline") {
          subscription.dispose();
          this.project = pkg.mainModule.getProject();
          return this.init();
        }
      });
      this.subscriptions.add(subscription);
    }
  }

  init() {
    if (this.destroyed || this.project.isDestroyed()) return;
    this.subscriptions.add(this.project.onDidDestroy(() => this.destroy()));
    if (ColorContext == null) {
      ColorContext = require("./color-context");
    }

    if (this.context == null) {
      this.context = new ColorContext({ registry: this.project.getColorExpressionsRegistry() });
    }

    this.parser = this.context.parser;
    this.variables = this.context.getVariables();
    if (this.sourceNames == null) {
      this.sourceNames = [];
    }
    if (this.ignoredNameSources == null) {
      this.ignoredNameSources = [];
    }

    this.matchesIgnoredName = lumine.project.compileIgnoredNames(this.ignoredNameSources, {
      useCoreIgnoredNames: false,
    });

    if (this.searchRequested) {
      return this.search();
    }
  }

  getTitle() {
    return "Color Inline Find Results";
  }

  getURI() {
    return "color-inline://search";
  }

  getIconName() {
    return "color-inline";
  }

  onDidFindMatches(callback) {
    return this.emitter.on("did-find-matches", callback);
  }

  onDidCompleteSearch(callback) {
    return this.emitter.on("did-complete-search", callback);
  }

  onDidStartSearch(callback) {
    return this.emitter.on("did-start-search", callback);
  }

  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const request = this.request;
    this.request = null;
    request?.controller.abort();
    this.subscriptions.dispose();
    this.emitter.emit("did-destroy");
    this.emitter.dispose();
  }

  // Scans the project's stylesheets for colours.
  //
  // This used to hand the combined colour expression to `workspace.scan`. That
  // search is ripgrep-backed now, and ripgrep's regex engine has no look-around
  // at all -- almost every colour expression ends in a `(?!...)` guard, so the
  // search failed outright with a regex parse error rather than finding
  // anything. Files are read and matched here instead, with the same engine
  // that marks colours in an open buffer, so the two can never disagree.
  async search() {
    if (this.destroyed) return;
    if (this.project == null) {
      this.searchRequested = true;
      return undefined;
    }

    const fs = require("fs/promises");
    const ColorScanner = require("./color-scanner");
    const { loadPaths } = require("./paths-loader");
    const previous = this.request;
    const request = (this.request = { controller: new AbortController() });
    const project = this.project;
    const current = () =>
      !this.destroyed &&
      this.request === request &&
      this.project === project &&
      !project.isDestroyed();
    previous?.controller.abort();
    if (!current()) return;
    this.results = [];
    this.emitter.emit("did-start-search");
    if (!current()) return;

    try {
      const { dirtied: paths } = await loadPaths({
        paths: lumine.project.getPaths().slice(),
        sourceNames: this.sourceNames.slice(),
        ignoreVcsIgnores: Boolean(lumine.config.get("color-inline.ignoreVcsIgnoredPaths")),
        signal: request.controller.signal,
      });
      if (!current()) return;

      const scanner = new ColorScanner({ context: this.context });
      const results = [];

      for (const filePath of paths) {
        if (!current()) return;
        const relativePath = lumine.project.relativize(filePath);
        if (this.isIgnored(relativePath)) continue;

        let text;
        try {
          text = await fs.readFile(filePath, {
            encoding: "utf8",
            signal: request.controller.signal,
          });
        } catch {
          if (!current()) return;
          continue;
        }
        if (!current()) return;

        const scope = project.scopeFromFileName(relativePath);
        const lineStarts = offsetsOfLineStarts(text);
        const matches = [];
        let lastIndex = 0;
        let found;

        while ((found = scanner.search(text, scope, lastIndex))) {
          if (!current()) return;
          ({ lastIndex } = found);
          if (!found.color?.isValid()) continue;

          const start = found.range[0];
          const row = rowForOffset(lineStarts, start);
          const lineStart = lineStarts[row];
          const lineEnd = text.indexOf("\n", lineStart);
          const column = start - lineStart;

          matches.push({
            matchText: found.match,
            color: found.color,
            lineText: text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd),
            lineTextOffset: 0,
            range: [
              [row, column],
              [row, column + found.match.length],
            ],
          });
        }

        if (matches.length === 0) continue;
        results.push(...matches);
        this.emitter.emit("did-find-matches", { filePath, matches });
        if (!current()) return;
      }

      this.results = results;
      return this.emitter.emit("did-complete-search", results);
    } catch (error) {
      if (current()) throw error;
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  isIgnored(relativePath) {
    return this.matchesIgnoredName.matches(relativePath);
  }

  serialize() {
    return {
      deserializer: "ColorSearch",
      options: {
        sourceNames: this.sourceNames,
        ignoredNames: this.ignoredNameSources,
      },
    };
  }
};
