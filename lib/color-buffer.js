/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [Color, ColorMarker, VariablesCollection, Emitter, CompositeDisposable, Range, fs] = Array.from(
  [],
);

const ExpressionsRegistry = require("./expressions-registry");
const { scanTextForColors, scanTextForVariables } = require("./buffer-scanner");

// A registry holding every expression of `registry` except one. Scanning a file
// that is not itself a variables source must not resolve project-wide
// variables, and the old code achieved that by deleting a key out of the
// *serialized* registry on its way to the child process. There is no copy to
// mutate now, and mutating the shared registry would leak into every other
// buffer, so the exclusion builds a throwaway registry instead.
function registryWithout(registry, excludedName) {
  const filtered = new ExpressionsRegistry(registry.expressionsType);
  for (const expression of registry.getExpressions()) {
    if (expression.name === excludedName) continue;
    filtered.addExpression(expression, true);
  }
  return filtered;
}

module.exports = class ColorBuffer {
  constructor(params = {}) {
    let colorMarkers;
    if (Emitter == null) {
      ({ Emitter, CompositeDisposable, Range } = require("lumine"));
    }

    ({ editor: this.editor, project: this.project, colorMarkers } = params);
    ({ id: this.id } = this.editor);
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.ignoredScopes = [];

    this.colorMarkersByMarkerId = {};

    this.subscriptions.add(this.editor.onDidDestroy(() => this.destroy()));

    const tokenized = () => {
      return __guard__(this.getColorMarkers(), (x) =>
        x.forEach((marker) => marker.checkMarkerScope(true)),
      );
    };

    if (this.editor.onDidTokenize != null) {
      this.subscriptions.add(this.editor.onDidTokenize(tokenized));
    } else {
      this.subscriptions.add(this.editor.displayBuffer.onDidTokenize(tokenized));
    }

    this.subscriptions.add(
      this.editor.onDidChange(() => {
        if (this.initialized && this.variableInitialized) {
          this.terminateRunningTask();
        }
        if (this.timeout != null) {
          return clearTimeout(this.timeout);
        }
      }),
    );

    this.subscriptions.add(
      this.editor.onDidStopChanging(() => {
        if (this.delayBeforeScan === 0) {
          return this.update();
        } else {
          if (this.timeout != null) {
            clearTimeout(this.timeout);
          }
          return (this.timeout = setTimeout(() => {
            this.update();
            return (this.timeout = null);
          }, this.delayBeforeScan));
        }
      }),
    );

    this.subscriptions.add(
      this.editor.onDidChangePath((path) => {
        if (this.isVariablesSource()) {
          this.project.appendPath(path);
        }
        return this.update();
      }),
    );

    if (
      this.project.getPaths() != null &&
      this.isVariablesSource() &&
      !this.project.hasPath(this.editor.getPath())
    ) {
      if (fs == null) {
        fs = require("fs");
      }

      if (fs.existsSync(this.editor.getPath())) {
        this.project.appendPath(this.editor.getPath());
      } else {
        var saveSubscription = this.editor.onDidSave(({ path }) => {
          this.project.appendPath(path);
          this.update();
          saveSubscription.dispose();
          return this.subscriptions.remove(saveSubscription);
        });

        this.subscriptions.add(saveSubscription);
      }
    }

    this.subscriptions.add(
      this.project.onDidUpdateVariables(() => {
        if (!this.variableInitialized) {
          return;
        }
        return this.scanBufferForColors().then((results) => {
          if (this.destroyed) {
            return;
          }
          return this.updateColorMarkers(results);
        });
      }),
    );

    this.subscriptions.add(
      this.project.onDidChangeIgnoredScopes(() => {
        return this.updateIgnoredScopes();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("colors.delayBeforeScan", (delayBeforeScan = 0) => {
        this.delayBeforeScan = delayBeforeScan;
      }),
    );

    if (this.editor.addMarkerLayer != null) {
      this.markerLayer = this.editor.addMarkerLayer();
    } else {
      this.markerLayer = this.editor;
    }

    if (colorMarkers != null) {
      this.restoreMarkersState(colorMarkers);
      this.cleanUnusedTextEditorMarkers();
    }

    this.updateIgnoredScopes();
    this.initialize();
  }

  onDidUpdateColorMarkers(callback) {
    return this.emitter.on("did-update-color-markers", callback);
  }

  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }

  initialize() {
    if (this.colorMarkers != null) {
      return Promise.resolve();
    }
    if (this.initializePromise != null) {
      return this.initializePromise;
    }

    this.updateVariableRanges();

    this.initializePromise = this.scanBufferForColors()
      .then((results) => {
        return this.createColorMarkers(results);
      })
      .then((results) => {
        this.colorMarkers = results;
        return (this.initialized = true);
      });

    this.initializePromise.then(() => this.variablesAvailable());

    return this.initializePromise;
  }

  restoreMarkersState(colorMarkers) {
    if (Color == null) {
      Color = require("./color");
    }
    if (ColorMarker == null) {
      ColorMarker = require("./color-marker");
    }

    this.updateVariableRanges();

    return (this.colorMarkers = colorMarkers
      .filter((state) => state != null)
      .map((state) => {
        let left;
        const marker =
          (left = this.editor.getMarker(state.markerId)) != null
            ? left
            : this.markerLayer.markBufferRange(state.bufferRange, { invalidate: "touch" });
        const color = new Color(state.color);
        color.variables = state.variables;
        color.invalid = state.invalid;
        return (this.colorMarkersByMarkerId[marker.id] = new ColorMarker({
          marker,
          color,
          text: state.text,
          colorBuffer: this,
        }));
      }));
  }

  cleanUnusedTextEditorMarkers() {
    return this.markerLayer.findMarkers().forEach((m) => {
      if (this.colorMarkersByMarkerId[m.id] == null) {
        return m.destroy();
      }
    });
  }

  variablesAvailable() {
    if (this.variablesPromise != null) {
      return this.variablesPromise;
    }

    return (this.variablesPromise = this.project
      .initialize()
      .then((results) => {
        if (this.destroyed) {
          return;
        }
        if (results == null) {
          return;
        }

        if (this.isIgnored() && this.isVariablesSource()) {
          return this.scanBufferForVariables();
        }
      })
      .then((results) => {
        // The editor can be closed at any point of this chain — a `return` in
        // one step only resolves that step, it does not skip the rest.
        if (this.destroyed) {
          return;
        }
        return this.scanBufferForColors({ variables: results });
      })
      .then((results) => {
        if (this.destroyed || results == null) {
          return;
        }
        return this.updateColorMarkers(results);
      })
      .then(() => {
        return (this.variableInitialized = true);
      })
      .catch((reason) => console.log(reason)));
  }

  update() {
    if (this.destroyed) {
      return Promise.resolve();
    }

    this.terminateRunningTask();

    const promise = this.isIgnored()
      ? this.scanBufferForVariables()
      : !this.isVariablesSource()
        ? Promise.resolve([])
        : this.project.reloadVariablesForPath(this.editor.getPath());

    return promise
      .then((results) => {
        if (this.destroyed) {
          return;
        }
        return this.scanBufferForColors({ variables: results });
      })
      .then((results) => {
        if (this.destroyed || results == null) {
          return;
        }
        return this.updateColorMarkers(results);
      })
      .catch((reason) => console.log(reason));
  }

  // Kept as the seam the change/destroy paths already call. Scanning no longer
  // forks a process, so there is nothing to kill: the debounce timer those
  // callers clear alongside this is what actually cancels pending work.
  terminateRunningTask() {}

  destroy() {
    if (this.destroyed) {
      return;
    }

    // Set first: everything below can run a callback that reaches back here,
    // and every asynchronous step of a scan reads this flag to bail out.
    this.destroyed = true;

    this.terminateRunningTask();
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.subscriptions.dispose();
    if (this.colorMarkers != null) {
      this.colorMarkers.forEach((marker) => marker.destroy());
    }
    // The layer outlives the buffer when the editor does — a path that becomes
    // ignored destroys the color buffer and leaves the editor open.
    if (this.markerLayer !== this.editor) {
      this.markerLayer.destroy();
    }
    this.emitter.emit("did-destroy");
    return this.emitter.dispose();
  }

  isVariablesSource() {
    return this.project.isVariablesSourcePath(this.editor.getPath());
  }

  isIgnored() {
    const p = this.editor.getPath();
    return this.project.isIgnoredPath(p) || !lumine.project.contains(p);
  }

  isDestroyed() {
    return this.destroyed;
  }

  getPath() {
    return this.editor.getPath();
  }

  getScope() {
    return this.project.scopeFromFileName(this.getPath());
  }

  updateIgnoredScopes() {
    this.ignoredScopes = this.project
      .getIgnoredScopes()
      .map(function (scope) {
        try {
          return new RegExp(scope);
        } catch {
          // Already destroyed with the editor.
        }
      })
      .filter((re) => re != null);

    __guard__(this.getColorMarkers(), (x) => x.forEach((marker) => marker.checkMarkerScope(true)));
    return this.emitter.emit("did-update-color-markers", { created: [], destroyed: [] });
  }

  //#    ##     ##    ###    ########   ######
  //#    ##     ##   ## ##   ##     ## ##    ##
  //#    ##     ##  ##   ##  ##     ## ##
  //#    ##     ## ##     ## ########   ######
  //#     ##   ##  ######### ##   ##         ##
  //#      ## ##   ##     ## ##    ##  ##    ##
  //#       ###    ##     ## ##     ##  ######

  updateVariableRanges() {
    const variablesForBuffer = this.project.getVariablesForPath(this.editor.getPath());
    return variablesForBuffer.forEach((variable) => {
      return variable.bufferRange != null
        ? variable.bufferRange
        : (variable.bufferRange = Range.fromObject([
            this.editor.getBuffer().positionForCharacterIndex(variable.range[0]),
            this.editor.getBuffer().positionForCharacterIndex(variable.range[1]),
          ]));
    });
  }

  scanBufferForVariables() {
    // A destroyed buffer holds no variables. Rejecting here only ever reached
    // a `.catch(console.log)`, so closing an editor mid-scan printed to the
    // dev console; the callers bail out on `destroyed` themselves now.
    if (this.destroyed) {
      return Promise.resolve([]);
    }
    if (!this.editor.getPath()) {
      return Promise.resolve([]);
    }

    const editor = this.editor;
    const buffer = this.editor.getBuffer();

    const results = scanTextForVariables(this.editor.getText(), {
      registry: this.project.getVariableExpressionsRegistry(),
      scope: this.getScope(),
    }).map((variable) => {
      variable.path = editor.getPath();
      variable.bufferRange = Range.fromObject([
        buffer.positionForCharacterIndex(variable.range[0]),
        buffer.positionForCharacterIndex(variable.range[1]),
      ]);
      return variable;
    });

    // Still a promise: the callers chain on it, and the scan used to cross a
    // process boundary. It just resolves on the spot now.
    return Promise.resolve(results);
  }

  //#     ######   #######  ##        #######  ########
  //#    ##    ## ##     ## ##       ##     ## ##     ##
  //#    ##       ##     ## ##       ##     ## ##     ##
  //#    ##       ##     ## ##       ##     ## ########
  //#    ##       ##     ## ##       ##     ## ##   ##
  //#    ##    ## ##     ## ##       ##     ## ##    ##
  //#     ######   #######  ########  #######  ##     ##
  //#
  //#    ##     ##    ###    ########  ##    ## ######## ########   ######
  //#    ###   ###   ## ##   ##     ## ##   ##  ##       ##     ## ##    ##
  //#    #### ####  ##   ##  ##     ## ##  ##   ##       ##     ## ##
  //#    ## ### ## ##     ## ########  #####    ######   ########   ######
  //#    ##     ## ######### ##   ##   ##  ##   ##       ##   ##         ##
  //#    ##     ## ##     ## ##    ##  ##   ##  ##       ##    ##  ##    ##
  //#    ##     ## ##     ## ##     ## ##    ## ######## ##     ##  ######

  getMarkerLayer() {
    return this.markerLayer;
  }

  getColorMarkers() {
    return this.colorMarkers;
  }

  getValidColorMarkers() {
    let left;
    return (left = __guard__(this.getColorMarkers(), (x) =>
      x.filter((m) => (m.color != null ? m.color.isValid() : undefined) && !m.isIgnored()),
    )) != null
      ? left
      : [];
  }

  getColorMarkerAtBufferPosition(bufferPosition) {
    const markers = this.markerLayer.findMarkers({
      containsBufferPosition: bufferPosition,
    });

    for (var marker of markers) {
      if (this.colorMarkersByMarkerId[marker.id] != null) {
        return this.colorMarkersByMarkerId[marker.id];
      }
    }
  }

  createColorMarkers(results) {
    if (this.destroyed) {
      return Promise.resolve([]);
    }

    if (ColorMarker == null) {
      ColorMarker = require("./color-marker");
    }

    return new Promise((resolve, _reject) => {
      const newResults = [];

      var processResults = () => {
        const startDate = new Date();

        if (this.destroyed || this.editor.isDestroyed()) {
          return resolve([]);
        }

        while (results.length) {
          var result = results.shift();

          var marker = this.markerLayer.markBufferRange(result.bufferRange, {
            invalidate: "touch",
          });
          newResults.push(
            (this.colorMarkersByMarkerId[marker.id] = new ColorMarker({
              marker,
              color: result.color,
              text: result.match,
              colorBuffer: this,
            })),
          );

          if (new Date() - startDate > 10) {
            requestAnimationFrame(processResults);
            return;
          }
        }

        return resolve(newResults);
      };

      return processResults();
    });
  }

  findExistingMarkers(results) {
    const newMarkers = [];
    const toCreate = [];

    return new Promise((resolve, _reject) => {
      var processResults = () => {
        const startDate = new Date();

        if (this.destroyed) {
          return resolve({ newMarkers: [], toCreate: [] });
        }

        while (results.length) {
          var marker;
          var result = results.shift();

          if ((marker = this.findColorMarker(result))) {
            newMarkers.push(marker);
          } else {
            toCreate.push(result);
          }

          if (new Date() - startDate > 10) {
            requestAnimationFrame(processResults);
            return;
          }
        }

        return resolve({ newMarkers, toCreate });
      };

      return processResults();
    });
  }

  updateColorMarkers(results) {
    let newMarkers = null;
    let createdMarkers = null;

    if (this.destroyed) {
      return Promise.resolve();
    }

    return this.findExistingMarkers(results)
      .then(({ newMarkers: markers, toCreate }) => {
        newMarkers = markers;
        return this.createColorMarkers(toCreate);
      })
      .then((results) => {
        let toDestroy;
        if (this.destroyed) {
          return;
        }
        createdMarkers = results;
        newMarkers = newMarkers.concat(results);

        if (this.colorMarkers != null) {
          toDestroy = this.colorMarkers.filter((marker) => !newMarkers.includes(marker));
          toDestroy.forEach((marker) => {
            delete this.colorMarkersByMarkerId[marker.id];
            return marker.destroy();
          });
        } else {
          toDestroy = [];
        }

        this.colorMarkers = newMarkers;
        return this.emitter.emit("did-update-color-markers", {
          created: createdMarkers,
          destroyed: toDestroy,
        });
      });
  }

  findColorMarker(properties = {}) {
    if (this.colorMarkers == null) {
      return;
    }
    for (var marker of this.colorMarkers) {
      if (marker != null ? marker.match(properties) : undefined) {
        return marker;
      }
    }
  }

  findColorMarkers(properties = {}) {
    const markers = this.markerLayer.findMarkers(properties);
    return markers
      .map((marker) => {
        return this.colorMarkersByMarkerId[marker.id];
      })
      .filter((marker) => marker != null);
  }

  findValidColorMarkers(properties) {
    return this.findColorMarkers(properties).filter((marker) => {
      return (
        marker != null &&
        (marker.color != null ? marker.color.isValid() : undefined) &&
        !(marker != null ? marker.isIgnored() : undefined)
      );
    });
  }

  selectColorMarkerAndOpenPicker(colorMarker) {
    if (this.destroyed) {
      return;
    }

    this.editor.setSelectedBufferRange(colorMarker.marker.getBufferRange());

    // For the moment it seems only colors in #RRGGBB format are detected
    // by the color picker, so we'll exclude anything else
    if (!__guard__(this.editor.getSelectedText(), (x) => x.match(/^#[0-9a-fA-F]{3,8}$/))) {
      return;
    }

    if (this.project.colorPickerAPI != null) {
      return this.project.colorPickerAPI.open(this.editor, this.editor.getLastCursor());
    }
  }

  scanBufferForColors(options = {}) {
    let left, left1, left2;
    // As in `scanBufferForVariables`: nothing to scan, not an error.
    if (this.destroyed) {
      return Promise.resolve([]);
    }

    if (Color == null) {
      Color = require("./color");
    }

    const buffer = this.editor.getBuffer();
    let registry = this.project.getColorExpressionsRegistry();

    if (options.variables != null) {
      if (VariablesCollection == null) {
        VariablesCollection = require("./variables-collection");
      }

      const collection = new VariablesCollection();
      collection.addMany(options.variables);
      options.variables = collection;
    }

    const variables = this.isVariablesSource()
      ? // In the case of files considered as source, the variables in the project
        // are needed when parsing the files.
        ((left = options.variables != null ? options.variables.getVariables() : undefined) != null
          ? left
          : []
        ).concat((left1 = this.project.getVariables()) != null ? left1 : [])
      : // Files that are not part of the sources will only use the variables
        // defined in them and so the global variables expression must be
        // discarded before sending the registry to the child process.
        (left2 = options.variables != null ? options.variables.getVariables() : undefined) != null
        ? left2
        : [];

    // A file that is not a variables source resolves only the variables it
    // declares itself, so the project-wide variable expression is withheld.
    if (!this.isVariablesSource()) registry = registryWithout(registry, "colors:variables");

    const results = scanTextForColors(this.editor.getText(), {
      registry,
      scope: this.getScope(),
      bufferPath: this.getPath(),
      variables,
      colorVariables: variables.filter((v) => v.isColor),
    }).map((res) => {
      if (!(res.color instanceof Color)) res.color = new Color(res.color);
      res.bufferRange = Range.fromObject([
        buffer.positionForCharacterIndex(res.range[0]),
        buffer.positionForCharacterIndex(res.range[1]),
      ]);
      return res;
    });

    return Promise.resolve(results);
  }

  serialize() {
    return {
      id: this.id,
      path: this.editor.getPath(),
      colorMarkers:
        this.colorMarkers != null
          ? this.colorMarkers.map((marker) => marker.serialize())
          : undefined,
    };
  }
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
