/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [
  ColorBuffer,
  ColorSearch,
  Palette,
  VariablesCollection,
  PathsLoader,
  PathsScanner,
  Emitter,
  CompositeDisposable,
  Range,
  SERIALIZE_VERSION,
  SERIALIZE_MARKERS_VERSION,
  THEME_VARIABLES,
  THEME_VARIABLE_NAMES,
  scopeFromFileName,
] = Array.from([]);

const { matchesAny, toNative } = require("./globs");

const compareArray = function (a, b) {
  if (a == null || b == null) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    var v = a[i];
    if (v !== b[i]) {
      return false;
    }
  }
  return true;
};

module.exports = class ColorProject {
  static deserialize(state) {
    if (SERIALIZE_VERSION == null) {
      ({ SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("./versions"));
    }

    let markersVersion = SERIALIZE_MARKERS_VERSION;
    if (
      lumine.window.isDevMode() &&
      lumine.project.getPaths().some((p) => p.match(/[\\/]color-inline$/))
    ) {
      markersVersion += "-dev";
    }

    if ((state != null ? state.version : undefined) !== SERIALIZE_VERSION) {
      state = {};
    }

    if ((state != null ? state.markersVersion : undefined) !== markersVersion) {
      delete state.variables;
      delete state.buffers;
    }

    if (
      !compareArray(state.globalSourceNames, lumine.config.get("color-inline.sourceNames")) ||
      !compareArray(state.globalIgnoredNames, lumine.config.get("color-inline.ignoredNames"))
    ) {
      delete state.variables;
      delete state.buffers;
      delete state.paths;
    }

    return new ColorProject(state);
  }

  constructor(state = {}) {
    let buffers, timestamp, variables;
    if (Emitter == null) {
      ({ Emitter, CompositeDisposable, Range } = require("lumine"));
    }
    if (VariablesCollection == null) {
      VariablesCollection = require("./variables-collection");
    }

    ({
      includeThemes: this.includeThemes,
      ignoredNames: this.ignoredNames,
      sourceNames: this.sourceNames,
      ignoredScopes: this.ignoredScopes,
      paths: this.paths,
      searchNames: this.searchNames,
      ignoreGlobalSourceNames: this.ignoreGlobalSourceNames,
      ignoreGlobalIgnoredNames: this.ignoreGlobalIgnoredNames,
      ignoreGlobalIgnoredScopes: this.ignoreGlobalIgnoredScopes,
      ignoreGlobalSearchNames: this.ignoreGlobalSearchNames,
      ignoreGlobalSupportedFiletypes: this.ignoreGlobalSupportedFiletypes,
      supportedFiletypes: this.supportedFiletypes,
      variables,
      timestamp,
      buffers,
    } = state);

    // State may have been serialized on another platform, and a path in the
    // foreign spelling matches nothing the scanner finds -- so the file is
    // taken for new, scanned again, and both spellings end up in the list.
    if (this.paths != null) this.paths = this.paths.map(toNative);

    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.colorBuffersByEditorId = {};
    this.bufferStates = buffers != null ? buffers : {};

    this.variableExpressionsRegistry = require("./variable-expressions");
    this.colorExpressionsRegistry = require("./color-expressions");

    if (variables != null) {
      // This is nested state owned by ColorProject, not a workspace item. Going
      // through the global deserializer here re-enters this package's deferred
      // activation wrapper while `activate()` is still running. Restore it
      // directly so opening the first editor cannot recursively activate the
      // package and construct projects forever.
      this.variables = VariablesCollection.deserialize(variables);
    } else {
      this.variables = new VariablesCollection();
    }

    this.subscriptions.add(
      this.variables.onDidChange((results) => {
        return this.emitVariablesChangeEvent(results);
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.sourceNames", () => {
        return this.updatePaths();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.ignoredNames", () => {
        return this.updatePaths();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("core.ignoredNames", () => {
        return this.updatePaths();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.ignoredBufferNames", (ignoredBufferNames) => {
        this.ignoredBufferNames = ignoredBufferNames;
        this.ignoredBufferNamesMatcher = lumine.project.compileIgnoredNames(
          ignoredBufferNames || [],
          { useCoreIgnoredNames: false },
        );
        return this.updateColorBuffers();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.ignoredScopes", () => {
        return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.supportedFiletypes", () => {
        this.updateIgnoredFiletypes();
        return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.ignoreVcsIgnoredPaths", () => {
        // Not before the project is initialized, the way the two observers
        // above reach the same work through `updatePaths`. `observe` calls back
        // once during this constructor, and `loadPathsAndVariables` decides
        // whether to rescan every path or only the dirty ones by asking whether
        // the collection holds any variables yet -- which, for a project being
        // restored, it does not until `onceInitialized` has run. Reaching it
        // this early rescanned the whole project over its own restored state.
        if (!this.initialized) {
          return Promise.resolve();
        }
        return this.loadPathsAndVariables();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.sassShadeAndTintImplementation", () => {
        return this.colorExpressionsRegistry.emitter.emit("did-update-expressions", {
          registry: this.colorExpressionsRegistry,
        });
      }),
    );

    const svgColorExpression = this.colorExpressionsRegistry.getExpression(
      "color-inline:named_colors",
    );
    this.subscriptions.add(
      lumine.config.observe("color-inline.filetypesForColorWords", (scopes) => {
        svgColorExpression.scopes = scopes != null ? scopes : [];
        return this.colorExpressionsRegistry.emitter.emit("did-update-expressions", {
          name: svgColorExpression.name,
          registry: this.colorExpressionsRegistry,
        });
      }),
    );

    this.subscriptions.add(
      this.colorExpressionsRegistry.onDidUpdateExpressions(({ name }) => {
        if (this.paths == null || name === "color-inline:variables") {
          return;
        }
        return this.variables.evaluateVariables(this.variables.getVariables(), () => {
          return (() => {
            const result = [];
            for (var id in this.colorBuffersByEditorId) {
              var colorBuffer = this.colorBuffersByEditorId[id];
              result.push(colorBuffer.update());
            }
            return result;
          })();
        });
      }),
    );

    this.subscriptions.add(
      this.variableExpressionsRegistry.onDidUpdateExpressions(() => {
        if (this.paths == null) {
          return;
        }
        return this.reloadVariablesForPaths(this.getPaths());
      }),
    );

    if (timestamp != null) {
      this.timestamp = new Date(Date.parse(timestamp));
    }

    this.updateIgnoredFiletypes();

    if (this.paths != null) {
      this.initialize();
    }
    this.initializeBuffers();
  }

  onDidInitialize(callback) {
    return this.emitter.on("did-initialize", callback);
  }

  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }

  onDidUpdateVariables(callback) {
    return this.emitter.on("did-update-variables", callback);
  }

  onDidCreateColorBuffer(callback) {
    return this.emitter.on("did-create-color-buffer", callback);
  }

  onDidChangeIgnoredScopes(callback) {
    return this.emitter.on("did-change-ignored-scopes", callback);
  }

  onDidChangePaths(callback) {
    return this.emitter.on("did-change-paths", callback);
  }

  observeColorBuffers(callback) {
    for (var id in this.colorBuffersByEditorId) {
      var colorBuffer = this.colorBuffersByEditorId[id];
      callback(colorBuffer);
    }
    return this.onDidCreateColorBuffer(callback);
  }

  isInitialized() {
    return this.initialized;
  }

  isDestroyed() {
    return this.destroyed;
  }

  initialize() {
    if (this.isInitialized()) {
      return Promise.resolve(this.variables.getVariables());
    }
    if (this.initializePromise != null) {
      return this.initializePromise;
    }
    return (this.initializePromise = new Promise((resolve) => {
      return this.variables.onceInitialized(resolve);
    })
      .then(() => {
        return this.loadPathsAndVariables();
      })
      .then(() => {
        if (this.includeThemes) {
          return this.includeThemesVariables();
        }
      })
      .then(() => {
        this.initialized = true;

        const variables = this.variables.getVariables();
        this.emitter.emit("did-initialize", variables);
        return variables;
      }));
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    if (PathsScanner == null) {
      PathsScanner = require("./paths-scanner");
    }

    this.destroyed = true;

    PathsScanner.terminateRunningTask();

    for (var id in this.colorBuffersByEditorId) {
      var buffer = this.colorBuffersByEditorId[id];
      buffer.destroy();
    }
    this.colorBuffersByEditorId = null;

    this.subscriptions.dispose();
    this.subscriptions = null;

    this.emitter.emit("did-destroy", this);
    return this.emitter.dispose();
  }

  reload() {
    return this.initialize()
      .then(() => {
        this.variables.reset();
        this.paths = [];
        return this.loadPathsAndVariables();
      })
      .then(() => {
        if (lumine.config.get("color-inline.notifyReloads")) {
          return lumine.notifications.addSuccess("Color Inline successfully reloaded", {
            dismissable: lumine.config.get("color-inline.dismissableReloadNotifications"),
            description: `Found:
- **${this.paths.length}** path(s)
- **${this.getVariables().length}** variables(s) including **${this.getColorVariables().length}** color(s)\
`,
          });
        } else {
          return console.log(`Found:
- ${this.paths.length} path(s)
- ${this.getVariables().length} variables(s) including ${this.getColorVariables().length} color(s)\
`);
        }
      })
      .catch(function (reason) {
        const detail = reason.message;
        const { stack } = reason;
        lumine.notifications.addError("Color Inline couldn't be reloaded", {
          detail,
          stack,
          dismissable: true,
        });
        return console.error(reason);
      });
  }

  loadPathsAndVariables() {
    return this.loadPaths()
      .then(({ dirtied, removed }) => {
        // We can find removed files only when there's already paths from
        // a serialized state
        if (removed.length > 0) {
          this.paths = this.paths.filter((p) => !removed.includes(p));
          this.deleteVariablesForPaths(removed);
        }

        // There was serialized paths, and the initialization discovered
        // some new or dirty ones.
        if (this.paths != null && dirtied.length > 0) {
          for (var path of dirtied) {
            if (!this.paths.includes(path)) {
              this.paths.push(path);
            }
          }

          // There was also serialized variables, so we'll rescan only the
          // dirty paths
          if (this.variables.length) {
            return dirtied;
            // There was no variables, so it's probably because the markers
            // version changed, we'll rescan all the files
          } else {
            return this.paths;
          }
          // There was no serialized paths, so there's no variables neither
        } else if (this.paths == null) {
          return (this.paths = dirtied);
          // Only the markers version changed, all the paths from the serialized
          // state will be rescanned
        } else if (!this.variables.length) {
          return this.paths;
          // Nothing changed, there's no dirty paths to rescan
        } else {
          return [];
        }
      })
      .then((paths) => {
        return this.loadVariablesForPaths(paths);
      })
      .then((results) => {
        if (results != null) {
          return this.variables.updateCollection(results);
        }
      });
  }

  findAllColors() {
    if (ColorSearch == null) {
      ColorSearch = require("./color-search");
    }

    const patterns = this.getSearchNames();
    return new ColorSearch({
      sourceNames: patterns,
      project: this,
      ignoredNames: this.getIgnoredNames(),
      context: this.getContext(),
    });
  }

  //#    ########  ##     ## ######## ######## ######## ########   ######
  //#    ##     ## ##     ## ##       ##       ##       ##     ## ##    ##
  //#    ##     ## ##     ## ##       ##       ##       ##     ## ##
  //#    ########  ##     ## ######   ######   ######   ########   ######
  //#    ##     ## ##     ## ##       ##       ##       ##   ##         ##
  //#    ##     ## ##     ## ##       ##       ##       ##    ##  ##    ##
  //#    ########   #######  ##       ##       ######## ##     ##  ######

  initializeBuffers() {
    return this.subscriptions.add(
      lumine.workspace.observeTextEditors((editor) => {
        const editorPath = editor.getPath();
        if (editorPath == null || this.isBufferIgnored(editorPath)) {
          return;
        }

        const buffer = this.colorBufferForEditor(editor);
        if (buffer != null) {
          const bufferElement = lumine.views.getView(buffer);
          return bufferElement.attach();
        }
      }),
    );
  }

  hasColorBufferForEditor(editor) {
    if (this.destroyed || editor == null) {
      return false;
    }
    return this.colorBuffersByEditorId[editor.id] != null;
  }

  colorBufferForEditor(editor) {
    let buffer, state, subscription;
    if (this.destroyed) {
      return;
    }
    if (editor == null) {
      return;
    }

    if (ColorBuffer == null) {
      ColorBuffer = require("./color-buffer");
    }

    if (this.colorBuffersByEditorId[editor.id] != null) {
      return this.colorBuffersByEditorId[editor.id];
    }

    if (this.bufferStates[editor.id] != null) {
      state = this.bufferStates[editor.id];
      state.editor = editor;
      state.project = this;
      delete this.bufferStates[editor.id];
    } else {
      state = { editor, project: this };
    }

    this.colorBuffersByEditorId[editor.id] = buffer = new ColorBuffer(state);

    this.subscriptions.add(
      (subscription = buffer.onDidDestroy(() => {
        this.subscriptions.remove(subscription);
        subscription.dispose();
        return delete this.colorBuffersByEditorId[editor.id];
      })),
    );

    this.emitter.emit("did-create-color-buffer", buffer);

    return buffer;
  }

  colorBufferForPath(path) {
    for (var id in this.colorBuffersByEditorId) {
      var colorBuffer = this.colorBuffersByEditorId[id];
      if (colorBuffer.editor.getPath() === path) {
        return colorBuffer;
      }
    }
  }

  updateColorBuffers() {
    let buffer;
    for (var id in this.colorBuffersByEditorId) {
      buffer = this.colorBuffersByEditorId[id];
      if (this.isBufferIgnored(buffer.editor.getPath())) {
        buffer.destroy();
        delete this.colorBuffersByEditorId[id];
      }
    }

    try {
      if (this.colorBuffersByEditorId != null) {
        return (() => {
          const result = [];
          for (var editor of lumine.workspace.getTextEditors()) {
            if (this.hasColorBufferForEditor(editor) || this.isBufferIgnored(editor.getPath())) {
              continue;
            }

            buffer = this.colorBufferForEditor(editor);
            if (buffer != null) {
              var bufferElement = lumine.views.getView(buffer);
              result.push(bufferElement.attach());
            } else {
              result.push(undefined);
            }
          }
          return result;
        })();
      }
    } catch (e) {
      return console.log(e);
    }
  }

  isBufferIgnored(path) {
    if (!path) {
      return false;
    }

    path = lumine.project.relativize(path);
    return this.ignoredBufferNamesMatcher.matches(path);
  }

  //#    ########     ###    ######## ##     ##  ######
  //#    ##     ##   ## ##      ##    ##     ## ##    ##
  //#    ##     ##  ##   ##     ##    ##     ## ##
  //#    ########  ##     ##    ##    #########  ######
  //#    ##        #########    ##    ##     ##       ##
  //#    ##        ##     ##    ##    ##     ## ##    ##
  //#    ##        ##     ##    ##    ##     ##  ######

  getPaths() {
    return this.paths != null ? this.paths.slice() : undefined;
  }

  appendPath(path) {
    if (path != null) {
      return this.paths.push(path);
    }
  }

  hasPath(path) {
    return (this.paths != null ? this.paths : []).includes(path);
  }

  loadPaths(noKnownPaths = false) {
    if (PathsLoader == null) {
      PathsLoader = require("./paths-loader");
    }

    return new Promise((resolve, reject) => {
      const rootPaths = this.getRootPaths();
      const knownPaths = noKnownPaths ? [] : this.paths != null ? this.paths : [];
      const config = {
        knownPaths,
        timestamp: this.timestamp,
        isIgnored: (relativePath) => this.getIgnoredNamesMatcher().matches(relativePath),
        paths: rootPaths,
        traverseIntoSymlinkDirectories: lumine.config.get(
          "color-inline.traverseIntoSymlinkDirectories",
        ),
        sourceNames: this.getSourceNames(),
        ignoreVcsIgnores: lumine.config.get("color-inline.ignoreVcsIgnoredPaths"),
      };
      return PathsLoader.loadPaths(config).then((results) => {
        for (var p of knownPaths) {
          var isDescendentOfRootPaths = rootPaths.some((root) => p.indexOf(root) === 0);

          if (!isDescendentOfRootPaths) {
            if (results.removed == null) {
              results.removed = [];
            }
            results.removed.push(p);
          }
        }

        return resolve(results);
      }, reject);
    });
  }

  updatePaths() {
    if (!this.initialized) {
      return Promise.resolve();
    }

    return this.loadPaths().then(({ dirtied, removed }) => {
      this.deleteVariablesForPaths(removed);

      this.paths = this.paths.filter((p) => !removed.includes(p));
      for (var p of dirtied) {
        if (!this.paths.includes(p)) {
          this.paths.push(p);
        }
      }

      this.emitter.emit("did-change-paths", this.getPaths());
      return this.reloadVariablesForPaths(dirtied);
    });
  }

  isVariablesSourcePath(path) {
    if (!path) {
      return false;
    }

    path = lumine.project.relativize(path);
    return matchesAny(path, this.getSourceNames());
  }

  isIgnoredPath(path) {
    if (!path) {
      return false;
    }

    path = lumine.project.relativize(path);
    return this.getIgnoredNamesMatcher().matches(path);
  }

  scopeFromFileName(path) {
    if (scopeFromFileName == null) {
      scopeFromFileName = require("./scope-from-file-name");
    }

    let scope = scopeFromFileName(path);

    if (scope === "sass" || scope === "scss") {
      scope = [scope, this.getSassScopeSuffix()].join(":");
    }

    return scope;
  }

  //#    ##     ##    ###    ########   ######
  //#    ##     ##   ## ##   ##     ## ##    ##
  //#    ##     ##  ##   ##  ##     ## ##
  //#    ##     ## ##     ## ########   ######
  //#     ##   ##  ######### ##   ##         ##
  //#      ## ##   ##     ## ##    ##  ##    ##
  //#       ###    ##     ## ##     ##  ######

  getPalette() {
    if (Palette == null) {
      Palette = require("./palette");
    }

    if (!this.isInitialized()) {
      return new Palette();
    }
    return new Palette(this.getColorVariables());
  }

  getContext() {
    return this.variables.getContext();
  }

  getVariables() {
    return this.variables.getVariables();
  }

  getVariableExpressionsRegistry() {
    return this.variableExpressionsRegistry;
  }

  getVariableById(id) {
    return this.variables.getVariableById(id);
  }

  getVariableByName(name) {
    return this.variables.getVariableByName(name);
  }

  getColorVariables() {
    return this.variables.getColorVariables();
  }

  getColorExpressionsRegistry() {
    return this.colorExpressionsRegistry;
  }

  showVariableInFile(variable) {
    return lumine.workspace.open(variable.path).then(function (editor) {
      if (Range == null) {
        ({ Emitter, CompositeDisposable, Range } = require("lumine"));
      }

      const buffer = editor.getBuffer();

      const bufferRange = Range.fromObject([
        buffer.positionForCharacterIndex(variable.range[0]),
        buffer.positionForCharacterIndex(variable.range[1]),
      ]);

      return editor.setSelectedBufferRange(bufferRange, { autoscroll: true });
    });
  }

  emitVariablesChangeEvent(results) {
    return this.emitter.emit("did-update-variables", results);
  }

  loadVariablesForPath(path) {
    return this.loadVariablesForPaths([path]);
  }

  loadVariablesForPaths(paths) {
    return new Promise((resolve, _reject) => {
      return this.scanPathsForVariables(paths, (results) => resolve(results));
    });
  }

  getVariablesForPath(path) {
    return this.variables.getVariablesForPath(path);
  }

  getVariablesForPaths(paths) {
    return this.variables.getVariablesForPaths(paths);
  }

  deleteVariablesForPath(path) {
    return this.deleteVariablesForPaths([path]);
  }

  deleteVariablesForPaths(paths) {
    return this.variables.deleteVariablesForPaths(paths);
  }

  reloadVariablesForPath(path) {
    return this.reloadVariablesForPaths([path]);
  }

  reloadVariablesForPaths(paths) {
    let promise = Promise.resolve();
    if (!this.isInitialized()) {
      promise = this.initialize();
    }

    return promise
      .then(() => {
        if (paths.some((path) => !this.paths.includes(path))) {
          return Promise.resolve([]);
        }

        return this.loadVariablesForPaths(paths);
      })
      .then((results) => {
        return this.variables.updateCollection(results, paths);
      });
  }

  scanPathsForVariables(paths, callback) {
    let colorBuffer;
    if (paths.length === 1 && (colorBuffer = this.colorBufferForPath(paths[0]))) {
      return colorBuffer.scanBufferForVariables().then((results) => callback(results));
    } else {
      if (PathsScanner == null) {
        PathsScanner = require("./paths-scanner");
      }

      return PathsScanner.scan(
        paths.map((p) => [p, this.scopeFromFileName(p)]),
        this.variableExpressionsRegistry,
      ).then((results) => callback(results));
    }
  }

  loadThemesVariables() {
    if (THEME_VARIABLES == null) {
      ({ THEME_VARIABLES } = require("./uris"));
    }
    if (THEME_VARIABLE_NAMES == null) {
      THEME_VARIABLE_NAMES = require("./theme-variables");
    }

    let iterator = 0;
    const variables = [];
    let html = "";
    THEME_VARIABLE_NAMES.forEach((v) => (html += `<div class='${v}'>${v}</div>`));

    const div = document.createElement("div");
    div.className = "color-inline-sampler";
    div.innerHTML = html;
    document.body.appendChild(div);

    THEME_VARIABLE_NAMES.forEach(function (v, i) {
      const node = div.children[i];
      const { color } = getComputedStyle(node);
      const end = iterator + v.length + color.length + 4;

      const variable = {
        name: `@${v}`,
        line: i,
        value: color,
        range: [iterator, end],
        path: THEME_VARIABLES,
      };

      iterator = end;
      return variables.push(variable);
    });

    document.body.removeChild(div);
    return variables;
  }

  //#     ######  ######## ######## ######## #### ##    ##  ######    ######
  //#    ##    ## ##          ##       ##     ##  ###   ## ##    ##  ##    ##
  //#    ##       ##          ##       ##     ##  ####  ## ##        ##
  //#     ######  ######      ##       ##     ##  ## ## ## ##   ####  ######
  //#          ## ##          ##       ##     ##  ##  #### ##    ##        ##
  //#    ##    ## ##          ##       ##     ##  ##   ### ##    ##  ##    ##
  //#     ######  ########    ##       ##    #### ##    ##  ######    ######

  getRootPaths() {
    return lumine.project.getPaths();
  }

  getSassScopeSuffix() {
    let left;
    return (left =
      this.sassShadeAndTintImplementation != null
        ? this.sassShadeAndTintImplementation
        : lumine.config.get("color-inline.sassShadeAndTintImplementation")) != null
      ? left
      : "compass";
  }

  setSassShadeAndTintImplementation(sassShadeAndTintImplementation) {
    this.sassShadeAndTintImplementation = sassShadeAndTintImplementation;
    return this.colorExpressionsRegistry.emitter.emit("did-update-expressions", {
      registry: this.colorExpressionsRegistry,
    });
  }

  getSourceNames() {
    let names = [".color-inline"];
    names = names.concat(this.sourceNames != null ? this.sourceNames : []);
    if (!this.ignoreGlobalSourceNames) {
      let left;
      names = names.concat(
        (left = lumine.config.get("color-inline.sourceNames")) != null ? left : [],
      );
    }
    return names;
  }

  setSourceNames(sourceNames = []) {
    this.sourceNames = sourceNames;
    if (this.initialized == null && this.initializePromise == null) {
      return;
    }

    return this.initialize().then(() => this.loadPathsAndVariables(true));
  }

  setIgnoreGlobalSourceNames(ignoreGlobalSourceNames) {
    this.ignoreGlobalSourceNames = ignoreGlobalSourceNames;
    return this.updatePaths();
  }

  getSearchNames() {
    let names = [];
    names = names.concat(this.sourceNames != null ? this.sourceNames : []);
    names = names.concat(this.searchNames != null ? this.searchNames : []);
    if (!this.ignoreGlobalSearchNames) {
      let left, left1;
      names = names.concat(
        (left = lumine.config.get("color-inline.sourceNames")) != null ? left : [],
      );
      names = names.concat(
        (left1 = lumine.config.get("color-inline.extendedSearchNames")) != null ? left1 : [],
      );
    }
    return names;
  }

  setSearchNames(searchNames = []) {
    this.searchNames = searchNames;
  }

  setIgnoreGlobalSearchNames(ignoreGlobalSearchNames) {
    this.ignoreGlobalSearchNames = ignoreGlobalSearchNames;
  }

  getIgnoredNames() {
    let names = this.ignoredNames != null ? this.ignoredNames : [];
    if (!this.ignoreGlobalIgnoredNames) {
      let left, left1;
      names = names.concat((left = this.getGlobalIgnoredNames()) != null ? left : []);
      names = names.concat((left1 = lumine.config.get("core.ignoredNames")) != null ? left1 : []);
    }
    return names;
  }

  getIgnoredNamesMatcher() {
    const names = this.getIgnoredNames();
    const source = names.join("\0");
    if (!this.ignoredNamesMatcher || this.ignoredNamesMatcherSource !== source) {
      this.ignoredNamesMatcherSource = source;
      this.ignoredNamesMatcher = lumine.project.compileIgnoredNames(names, {
        useCoreIgnoredNames: false,
      });
    }
    return this.ignoredNamesMatcher;
  }

  getGlobalIgnoredNames() {
    return __guard__(lumine.config.get("color-inline.ignoredNames"), (x) =>
      x.map(function (p) {
        if (/\/\*$/.test(p)) {
          return p + "*";
        } else {
          return p;
        }
      }),
    );
  }

  setIgnoredNames(ignoredNames = []) {
    this.ignoredNames = ignoredNames;
    if (this.initialized == null && this.initializePromise == null) {
      return Promise.reject("Project is not initialized yet");
    }

    return this.initialize().then(() => {
      const dirtied = this.paths.filter((p) => this.isIgnoredPath(p));
      this.deleteVariablesForPaths(dirtied);

      this.paths = this.paths.filter((p) => !this.isIgnoredPath(p));
      return this.loadPathsAndVariables(true);
    });
  }

  setIgnoreGlobalIgnoredNames(ignoreGlobalIgnoredNames) {
    this.ignoreGlobalIgnoredNames = ignoreGlobalIgnoredNames;
    return this.updatePaths();
  }

  getIgnoredScopes() {
    let scopes = this.ignoredScopes != null ? this.ignoredScopes : [];
    if (!this.ignoreGlobalIgnoredScopes) {
      let left;
      scopes = scopes.concat(
        (left = lumine.config.get("color-inline.ignoredScopes")) != null ? left : [],
      );
    }

    scopes = scopes.concat(this.ignoredFiletypes);
    return scopes;
  }

  setIgnoredScopes(ignoredScopes = []) {
    this.ignoredScopes = ignoredScopes;
    return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
  }

  setIgnoreGlobalIgnoredScopes(ignoreGlobalIgnoredScopes) {
    this.ignoreGlobalIgnoredScopes = ignoreGlobalIgnoredScopes;
    return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
  }

  setSupportedFiletypes(supportedFiletypes = []) {
    this.supportedFiletypes = supportedFiletypes;
    this.updateIgnoredFiletypes();
    return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
  }

  updateIgnoredFiletypes() {
    return (this.ignoredFiletypes = this.getIgnoredFiletypes());
  }

  getIgnoredFiletypes() {
    let filetypes = this.supportedFiletypes != null ? this.supportedFiletypes : [];

    if (!this.ignoreGlobalSupportedFiletypes) {
      let left;
      filetypes = filetypes.concat(
        (left = lumine.config.get("color-inline.supportedFiletypes")) != null ? left : [],
      );
    }

    if (filetypes.length === 0) {
      filetypes = ["*"];
    }

    if (filetypes.some((type) => type === "*")) {
      return [];
    }

    const scopes = filetypes
      .map((ext) =>
        __guard__(lumine.grammars.selectGrammar(`file.${ext}`), (x) =>
          x.scopeName.replace(/\./g, "\\."),
        ),
      )
      .filter((scope) => scope != null);

    return [`^(?!\\.(${scopes.join("|")}))`];
  }

  setIgnoreGlobalSupportedFiletypes(ignoreGlobalSupportedFiletypes) {
    this.ignoreGlobalSupportedFiletypes = ignoreGlobalSupportedFiletypes;
    this.updateIgnoredFiletypes();
    return this.emitter.emit("did-change-ignored-scopes", this.getIgnoredScopes());
  }

  themesIncluded() {
    return this.includeThemes;
  }

  setIncludeThemes(includeThemes) {
    if (includeThemes === this.includeThemes) {
      return Promise.resolve();
    }

    this.includeThemes = includeThemes;
    if (this.includeThemes) {
      return this.includeThemesVariables();
    } else {
      return this.disposeThemesVariables();
    }
  }

  includeThemesVariables() {
    this.themesSubscription = lumine.themes.onDidChangeActiveThemes(() => {
      if (!this.includeThemes) {
        return;
      }

      if (THEME_VARIABLES == null) {
        ({ THEME_VARIABLES } = require("./uris"));
      }

      const variables = this.loadThemesVariables();
      return this.variables.updatePathCollection(THEME_VARIABLES, variables);
    });

    this.subscriptions.add(this.themesSubscription);
    return this.variables.addMany(this.loadThemesVariables());
  }

  disposeThemesVariables() {
    if (THEME_VARIABLES == null) {
      ({ THEME_VARIABLES } = require("./uris"));
    }

    this.subscriptions.remove(this.themesSubscription);
    this.variables.deleteVariablesForPaths([THEME_VARIABLES]);
    return this.themesSubscription.dispose();
  }

  getTimestamp() {
    return new Date();
  }

  serialize() {
    if (SERIALIZE_VERSION == null) {
      ({ SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("./versions"));
    }

    const data = {
      deserializer: "ColorProject",
      timestamp: this.getTimestamp(),
      version: SERIALIZE_VERSION,
      markersVersion: SERIALIZE_MARKERS_VERSION,
      globalSourceNames: lumine.config.get("color-inline.sourceNames"),
      globalIgnoredNames: lumine.config.get("color-inline.ignoredNames"),
    };

    if (this.ignoreGlobalSourceNames != null) {
      data.ignoreGlobalSourceNames = this.ignoreGlobalSourceNames;
    }
    if (this.ignoreGlobalSearchNames != null) {
      data.ignoreGlobalSearchNames = this.ignoreGlobalSearchNames;
    }
    if (this.ignoreGlobalIgnoredNames != null) {
      data.ignoreGlobalIgnoredNames = this.ignoreGlobalIgnoredNames;
    }
    if (this.ignoreGlobalIgnoredScopes != null) {
      data.ignoreGlobalIgnoredScopes = this.ignoreGlobalIgnoredScopes;
    }
    if (this.includeThemes != null) {
      data.includeThemes = this.includeThemes;
    }
    if (this.ignoredScopes != null) {
      data.ignoredScopes = this.ignoredScopes;
    }
    if (this.ignoredNames != null) {
      data.ignoredNames = this.ignoredNames;
    }
    if (this.sourceNames != null) {
      data.sourceNames = this.sourceNames;
    }
    if (this.searchNames != null) {
      data.searchNames = this.searchNames;
    }

    data.buffers = this.serializeBuffers();

    if (this.isInitialized()) {
      data.paths = this.paths;
      data.variables = this.variables.serialize();
    }

    return data;
  }

  serializeBuffers() {
    const out = {};
    for (var id in this.colorBuffersByEditorId) {
      var colorBuffer = this.colorBuffersByEditorId[id];
      out[id] = colorBuffer.serialize();
    }
    return out;
  }
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
