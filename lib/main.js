/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [
  Palette,
  PaletteElement,
  ColorSearch,
  ColorResultsElement,
  ColorProject,
  ColorProjectElement,
  ColorBuffer,
  ColorBufferElement,
  VariablesCollection,
  ColorInlineProvider,
  ColorInlineAPI,
  Disposable,
  CompositeDisposable,
  uris,
] = Array.from([]);

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "color-inline",
      tips: [
        "{% if keys['color-inline:show-palette'] %}See every colour a project defines with {{ 'color-inline:show-palette' | keystroke }}.{% else %}Use Color Inline's palette to see every colour a project defines.{% endif %}",
        "{% if keys['color-inline:find-colors'] %}Find every use of a colour across the project with {{ 'color-inline:find-colors' | keystroke }}.{% else %}Color Inline can find every use of a colour across the project.{% endif %}",
      ],
    };
  },

  activate(state) {
    if (CompositeDisposable == null) {
      ({ CompositeDisposable } = require("lumine"));
    }

    const owner = (this.subscriptions = new CompositeDisposable());
    this.projectState = state?.project ?? null;
    this.project = null;
    this.autocompleteProvider = null;
    this.autocompleteProviderValue = null;
    this.colorInlineProjectService = null;

    const workspaceCommands = lumine.commands.add("lumine-workspace", {
      "color-inline:find-colors": {
        description: "Scan the project for colour values and index what it finds.",
        didDispatch: () => this.findColors(),
      },
      "color-inline:show-palette": {
        description: "List the colours the project defines, with their variables.",
        didDispatch: () => this.showPalette(),
      },
      "color-inline:project-settings": {
        description: "Open the settings that decide which files are scanned.",
        didDispatch: () => this.showSettings(),
      },
      "color-inline:reload": {
        description: "Read the project's colour variables again from disk.",
        didDispatch: () => this.reloadProjectVariables(),
      },
      "color-inline:report": {
        description: "Open a report of every colour the project defines.",
        didDispatch: () => this.createColorsReport(),
      },
    });
    this.subscriptions.add(workspaceCommands);

    const convertMethod = (action) => {
      return (event) => {
        if (event.detail?.colorInlineTarget) {
          action(this.colorMarkerForCommandEvent(event));
        } else {
          const editor = this.editorForEvent(event);
          if (editor == null) {
            return;
          }
          const colorBuffer = this.getProject().colorBufferForEditor(editor);
          if (colorBuffer == null) {
            return;
          }

          editor.getCursors().forEach((cursor) => {
            const marker = colorBuffer.getColorMarkerAtBufferPosition(cursor.getBufferPosition());
            return action(marker);
          });
        }
      };
    };

    const copyMethod = (action) => {
      return (event) => {
        if (event.detail?.colorInlineTarget) {
          action(this.colorMarkerForCommandEvent(event));
        } else {
          const editor = this.editorForEvent(event);
          if (editor == null) {
            return;
          }
          const colorBuffer = this.getProject().colorBufferForEditor(editor);
          if (colorBuffer == null) {
            return;
          }
          const cursor = editor.getLastCursor();
          const marker = colorBuffer.getColorMarkerAtBufferPosition(cursor.getBufferPosition());
          action(marker);
        }
      };
    };

    const editorCommands = lumine.commands.add("lumine-text-editor:not([mini])", {
      "color-inline:convert-to-hex": convertMethod(function (marker) {
        if (marker != null) {
          return marker.convertContentToHex();
        }
      }),

      "color-inline:convert-to-rgb": convertMethod(function (marker) {
        if (marker != null) {
          return marker.convertContentToRGB();
        }
      }),

      "color-inline:convert-to-rgba": convertMethod(function (marker) {
        if (marker != null) {
          return marker.convertContentToRGBA();
        }
      }),

      "color-inline:convert-to-hsl": convertMethod(function (marker) {
        if (marker != null) {
          return marker.convertContentToHSL();
        }
      }),

      "color-inline:convert-to-hsla": convertMethod(function (marker) {
        if (marker != null) {
          return marker.convertContentToHSLA();
        }
      }),

      "color-inline:copy-as-hex": copyMethod(function (marker) {
        if (marker != null) {
          return marker.copyContentAsHex();
        }
      }),

      "color-inline:copy-as-rgb": copyMethod(function (marker) {
        if (marker != null) {
          return marker.copyContentAsRGB();
        }
      }),

      "color-inline:copy-as-rgba": copyMethod(function (marker) {
        if (marker != null) {
          return marker.copyContentAsRGBA();
        }
      }),

      "color-inline:copy-as-hsl": copyMethod(function (marker) {
        if (marker != null) {
          return marker.copyContentAsHSL();
        }
      }),

      "color-inline:copy-as-hsla": copyMethod(function (marker) {
        if (marker != null) {
          return marker.copyContentAsHSLA();
        }
      }),
    });
    this.subscriptions.add(editorCommands);

    const opener = lumine.workspace.addOpener((uriToOpen) => {
      // `url.parse` has been deprecated since Node 11 and, worse for an opener,
      // it accepts anything: a Windows path like `C:\x` parses as a URL whose
      // protocol is `c:`. The WHATWG parser throws on what is not a URL, which
      // is exactly the answer an opener wants for an ordinary file path.
      let protocol, host;
      try {
        ({ protocol, host } = new URL(uriToOpen));
      } catch {
        return;
      }

      if (protocol !== "color-inline:") {
        return;
      }

      switch (host) {
        case "search":
          return this.getProject().findAllColors();
        case "palette":
          return this.getProject().getPalette();
        case "settings": {
          const project = this.getProject();
          const view = lumine.views.getView(project);
          return view.destroyed ? this.colorInlineViewProvider(project) : view;
        }
      }
    });
    this.subscriptions.add(opener);

    // The application menu lives in `menus/main.json`, but this one stays
    // here: `shouldDisplay` is a function, so it cannot be expressed in JSON,
    // and it is what keeps the submenu off a right-click that has no colour
    // under it. `:not([mini])` because these rewrite the buffer.
    const colorInline = this;
    const contextMenu = lumine.contextMenu.add({
      "lumine-text-editor:not([mini])": [
        { type: "separator" },
        {
          label: "Color Inline",
          submenu: [
            { label: "Convert to Hexadecimal", command: "color-inline:convert-to-hex" },
            { label: "Convert to RGB", command: "color-inline:convert-to-rgb" },
            { label: "Convert to RGBA", command: "color-inline:convert-to-rgba" },
            { label: "Convert to HSL", command: "color-inline:convert-to-hsl" },
            { label: "Convert to HSLA", command: "color-inline:convert-to-hsla" },
            { type: "separator" },
            { label: "Copy as Hexadecimal", command: "color-inline:copy-as-hex" },
            { label: "Copy as RGB", command: "color-inline:copy-as-rgb" },
            { label: "Copy as RGBA", command: "color-inline:copy-as-rgba" },
            { label: "Copy as HSL", command: "color-inline:copy-as-hsl" },
            { label: "Copy as HSLA", command: "color-inline:copy-as-hsla" },
          ].map((item) => {
            if (!item.command) return item;
            return {
              ...item,
              created(event) {
                const marker = colorInline.colorMarkerForMouseEvent(event);
                this.commandDetail = {
                  colorInlineTarget: {
                    editorId: marker?.colorBuffer.editor.id,
                    markerId: marker?.marker.id,
                  },
                };
              },
            };
          }),
          shouldDisplay: (event) => this.shouldDisplayContextMenu(event),
        },
        { type: "separator" },
      ],
    });
    this.subscriptions.add(contextMenu);

    // An empty workspace needs no colour project. Restoring a saved project
    // also restores its variable index and rescans its source paths, which can
    // be substantial even when no document is open. Start on the first real
    // editor, including an untitled document; commands and service operations
    // use the same ensure boundary.
    queueMicrotask(() => {
      if (this.subscriptions !== owner || owner.disposed) return;
      owner.add(
        lumine.workspace.observeTextEditors((editor) => {
          if (this.subscriptions === owner && !owner.disposed && !editor.isMini()) {
            this.ensureProject();
          }
        }),
      );
    });
    return this.subscriptions;
  },

  deactivate() {
    const subscriptions = this.subscriptions;
    const provider = this.autocompleteProviderValue;
    const project = this.project;
    this.subscriptions = null;
    this.autocompleteProvider = null;
    this.autocompleteProviderValue = null;
    this.colorInlineProjectService = null;
    this.project = null;
    this.projectState = null;
    subscriptions?.dispose();
    provider?.dispose?.();
    return __guardMethod__(project, "destroy", (o) => o.destroy());
  },

  provideAutocomplete() {
    this.autocompleteProviderValue?.dispose?.();
    this.autocompleteProviderValue = null;
    const main = this;
    const owner = this.subscriptions;
    const proxy = new Proxy(
      {},
      {
        get(_target, property) {
          if (
            !owner ||
            owner.disposed ||
            main.subscriptions !== owner ||
            main.autocompleteProvider !== proxy
          ) {
            return property === "getSuggestions" ? () => [] : undefined;
          }
          if (!main.autocompleteProviderValue) {
            if (ColorInlineProvider == null) {
              ColorInlineProvider = require("./autocomplete-provider");
            }
            main.autocompleteProviderValue = new ColorInlineProvider(main);
          }
          const value = main.autocompleteProviderValue[property];
          return typeof value === "function" ? value.bind(main.autocompleteProviderValue) : value;
        },
        has(_target, property) {
          if (
            !owner ||
            owner.disposed ||
            main.subscriptions !== owner ||
            main.autocompleteProvider !== proxy
          )
            return false;
          if (!main.autocompleteProviderValue) return true;
          return property in main.autocompleteProviderValue;
        },
      },
    );
    return (this.autocompleteProvider = proxy);
  },

  provideColorInlineProject() {
    if (!this.colorInlineProjectService) {
      if (ColorInlineAPI == null) {
        ColorInlineAPI = require("./color-inline-api");
      }
      const owner = this.subscriptions;
      this.colorInlineProjectService = new ColorInlineAPI(
        () => this.getProject(),
        () => owner != null && !owner.disposed && this.subscriptions === owner,
      );
    }
    return this.colorInlineProjectService;
  },

  consumeColorExpressions(options = {}) {
    if (Disposable == null) {
      ({ Disposable } = require("lumine"));
    }

    const project = this.getProject();
    return project
      ? expressionLease(project.getColorExpressionsRegistry(), options)
      : new Disposable();
  },

  consumeVariableExpressions(options = {}) {
    if (Disposable == null) {
      ({ Disposable } = require("lumine"));
    }

    const project = this.getProject();
    return project
      ? expressionLease(project.getVariableExpressionsRegistry(), options)
      : new Disposable();
  },

  deserializePalette(state) {
    if (Palette == null) {
      Palette = require("./palette");
    }
    return Palette.deserialize(state);
  },

  deserializeColorSearch(state) {
    if (ColorSearch == null) {
      ColorSearch = require("./color-search");
    }
    return ColorSearch.deserialize(state);
  },

  deserializeColorProject(state) {
    if (ColorProject == null) {
      ColorProject = require("./color-project");
    }
    return ColorProject.deserialize(state);
  },

  deserializeColorProjectElement(_state) {
    if (ColorProjectElement == null) {
      ColorProjectElement = require("./color-project-element");
    }
    const element = new ColorProjectElement();

    element.setModel(this.getProject());

    return element;
  },

  deserializeVariablesCollection(state) {
    if (VariablesCollection == null) {
      VariablesCollection = require("./variables-collection");
    }
    return VariablesCollection.deserialize(state);
  },

  colorInlineViewProvider(model) {
    let element;
    element = (() => {
      if (
        model instanceof
        (ColorBuffer != null ? ColorBuffer : (ColorBuffer = require("./color-buffer")))
      ) {
        if (ColorBufferElement == null) {
          ColorBufferElement = require("./color-buffer-element");
        }
        return (element = new ColorBufferElement());
      } else if (
        model instanceof
        (ColorSearch != null ? ColorSearch : (ColorSearch = require("./color-search")))
      ) {
        if (ColorResultsElement == null) {
          ColorResultsElement = require("./color-results-element");
        }
        return (element = new ColorResultsElement());
      } else if (
        model instanceof
        (ColorProject != null ? ColorProject : (ColorProject = require("./color-project")))
      ) {
        if (ColorProjectElement == null) {
          ColorProjectElement = require("./color-project-element");
        }
        return (element = new ColorProjectElement());
      } else if (model instanceof (Palette != null ? Palette : (Palette = require("./palette")))) {
        if (PaletteElement == null) {
          PaletteElement = require("./palette-element");
        }
        return (element = new PaletteElement());
      }
    })();

    if (element != null) {
      element.setModel(model);
    }
    return element;
  },

  shouldDisplayContextMenu(event) {
    return this.colorMarkerForMouseEvent(event) != null;
  },

  colorMarkerForCommandEvent(event) {
    const { editorId, markerId } = event.detail.colorInlineTarget;
    return this.getProject()?.colorBuffersByEditorId[editorId]?.colorMarkersByMarkerId[markerId];
  },

  editorForEvent(event) {
    const target = event?.target;
    if (target?.closest?.("lumine-text-editor[mini]")) {
      return null;
    }

    const element = target?.closest?.("lumine-text-editor:not([mini])");
    return element?.getModel?.() ?? lumine.workspace.getActiveTextEditor() ?? null;
  },

  colorMarkerForMouseEvent(event) {
    const editor = this.editorForEvent(event);
    if (editor == null) {
      return;
    }
    const colorBuffer = this.getProject().colorBufferForEditor(editor);
    if (colorBuffer == null) {
      return;
    }
    const colorBufferElement = lumine.views.getView(colorBuffer);
    return colorBufferElement != null
      ? colorBufferElement.colorMarkerForMouseEvent(event)
      : undefined;
  },

  serialize() {
    return {
      project:
        this.project?.serialize?.() ??
        serializeProjectSettings(this.projectState) ??
        serializeProjectFallback(),
    };
  },

  getProject() {
    return this.ensureProject();
  },

  ensureProject() {
    const owner = this.subscriptions;
    if (!owner || owner.disposed) return;
    if (this.project) return this.project;
    if (ColorProject == null) ColorProject = require("./color-project");
    const state = this.projectState;
    this.projectState = null;
    const project = state != null ? ColorProject.deserialize(state) : new ColorProject();
    if (this.subscriptions !== owner || owner.disposed) {
      project.destroy();
      return;
    }
    return (this.project = project);
  },

  findColors() {
    if (uris == null) {
      uris = require("./uris");
    }

    return lumine.workspace.open(uris.SEARCH, { searchAllPanes: true });
  },

  showPalette() {
    if (uris == null) {
      uris = require("./uris");
    }

    return this.getProject()
      .initialize()
      .then(function () {
        return lumine.workspace.open(uris.PALETTE, { searchAllPanes: true });
      })
      .catch((reason) => console.error(reason));
  },

  showSettings() {
    if (uris == null) {
      uris = require("./uris");
    }

    return this.getProject()
      .initialize()
      .then(function () {
        return lumine.workspace.open(uris.SETTINGS, { searchAllPanes: true });
      })
      .catch((reason) => console.error(reason));
  },

  reloadProjectVariables() {
    return this.getProject().reload();
  },

  createColorsReport() {
    return lumine.workspace.open("color-inline-report.json").then((editor) => {
      return editor.setText(this.createReport());
    });
  },

  createReport() {
    const o = {
      lumine: lumine.application.getVersion(),
      "color-inline": lumine.packages.getLoadedPackage("color-inline").metadata.version,
      platform: require("os").platform(),
      config: lumine.config.get("color-inline"),
      project: {
        config: {
          sourceNames: this.getProject().sourceNames,
          searchNames: this.getProject().searchNames,
          ignoredNames: this.getProject().ignoredNames,
          ignoredScopes: this.getProject().ignoredScopes,
          includeThemes: this.getProject().includeThemes,
          ignoreGlobalSourceNames: this.getProject().ignoreGlobalSourceNames,
          ignoreGlobalSearchNames: this.getProject().ignoreGlobalSearchNames,
          ignoreGlobalIgnoredNames: this.getProject().ignoreGlobalIgnoredNames,
          ignoreGlobalIgnoredScopes: this.getProject().ignoreGlobalIgnoredScopes,
        },
        paths: this.getProject().getPaths(),
        variables: {
          colors: this.getProject().getColorVariables().length,
          total: this.getProject().getVariables().length,
        },
      },
    };

    // Project paths are literals, not patterns: on Windows they carry
    // backslashes (`\D` would read as a class) and may contain `[`, which
    // throws outright. They also appear JSON-escaped in the report, so match
    // the encoded form rather than the raw path.
    const paths = lumine.project
      .getPaths()
      .map((p) => require("./utils").escapeRegExp(JSON.stringify(p).slice(1, -1)))
      .join("|");

    const json = JSON.stringify(o, null, 2);
    return paths.length ? json.replace(new RegExp(paths, "g"), "<root>") : json;
  },
};

function expressionLease(registry, options) {
  let expressions;
  if (options.expressions != null) {
    // Capture the instances before synchronous registry events can replace them.
    // Keep the array form's existing defaults and single batch-update event.
    expressions = options.expressions.map(
      ({ name, regexpString, handle, priority = 0, scopes = ["*"] }) => {
        const expression = new registry.expressionsType({ name, regexpString, scopes, handle });
        expression.priority = priority;
        return expression;
      },
    );
    registry.addExpressions(expressions);
  } else {
    const { name, regexpString, handle, scopes, priority } = options;
    expressions = [registry.createExpression(name, regexpString, priority, scopes, handle)];
  }
  return new Disposable(() => {
    for (const expression of expressions) {
      if (registry.getExpression(expression.name) === expression)
        registry.removeExpression(expression.name);
    }
  });
}

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== "undefined" && obj !== null && typeof obj[methodName] === "function") {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}

function serializeProjectFallback() {
  const { SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("./versions");
  return {
    deserializer: "ColorProject",
    timestamp: new Date(),
    version: SERIALIZE_VERSION,
    markersVersion: SERIALIZE_MARKERS_VERSION,
    globalSourceNames: lumine.config.get("color-inline.sourceNames"),
    globalIgnoredNames: lumine.config.get("color-inline.ignoredNames"),
  };
}

function serializeProjectSettings(state) {
  if (state == null) return null;
  // A lazy project can still hold an old session's derived cache. Saving its
  // settings must not construct it or copy that cache into the next session.
  const settings = { ...state };
  delete settings.paths;
  delete settings.variables;
  delete settings.buffers;
  return settings;
}
