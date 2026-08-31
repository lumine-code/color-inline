const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { Disposable, TextEditor } = require("lumine");
const ColorInlineAPI = require("../lib/color-inline-api");
const registry = require("../lib/variable-expressions");

const { SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("../lib/versions");

describe("Color Inline", function () {
  let [workspaceElement, colors, project] = Array.from([]);

  // Waits until the variable count stops moving, so an assertion cannot land
  // on a half-applied rescan. Narrowing sourceNames evicts the variables of
  // every file that no longer matches, and these specs used to assert counts
  // measured while that eviction was still in flight.
  const settledVariableCount = async () => {
    let previous = -1;
    await conditionPromise(() => {
      const current = project.getVariables().length;
      const stable = current === previous;
      previous = current;
      return stable;
    });
    return project.getVariables().length;
  };
  beforeEach(async function () {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);

    lumine.config.set("color-inline.delayBeforeScan", 0);

    lumine.config.set("color-inline.sourceNames", ["**/*.sass", "**/*.styl"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("color-inline.ignoredScopes", []);
    lumine.config.set("color-inline.autocompleteScopes", []);

    registry.createExpression(
      "color-inline:txt_vars",
      "^[ \\t]*([a-zA-Z_$][a-zA-Z0-9\\-_]*)\\s*=(?!=)\\s*([^\\n\\r;]*);?$",
      ["txt"],
    );

    await waitsForPromise({ label: "colors activation" }, () =>
      lumine.packages.activatePackage("color-inline").then(function (pkg) {
        colors = pkg.mainModule;
        return (project = colors.getProject());
      }),
    );
  });

  afterEach(async function () {
    registry.removeExpression("color-inline:txt_vars");
    return project != null ? project.destroy() : undefined;
  });

  it("instanciates a ColorProject instance", async () => expect(colors.getProject()).toBeDefined());

  it("serializes the project", async function () {
    const date = new Date();
    spyOn(colors.getProject(), "getTimestamp").and.callFake(() => date);
    return expect(colors.serialize()).toEqual({
      project: {
        deserializer: "ColorProject",
        timestamp: date,
        version: SERIALIZE_VERSION,
        markersVersion: SERIALIZE_MARKERS_VERSION,
        globalSourceNames: ["**/*.sass", "**/*.styl"],
        globalIgnoredNames: [],
        buffers: {},
      },
    });
  });

  describe("when deactivated", function () {
    let [editor, editorElement, colorBuffer] = Array.from([]);
    beforeEach(async function () {
      await waitsForPromise({ label: "text-editor opened" }, () =>
        lumine.workspace.open("four-variables.styl").then(function (e) {
          editor = e;
          editorElement = lumine.views.getView(e);
          return (colorBuffer = project.colorBufferForEditor(editor));
        }),
      );

      await waitsFor("colors markers appended to the DOM", () =>
        editorElement.querySelector("color-inline-markers"),
      );

      await runs(async function () {
        spyOn(project, "destroy").and.callThrough();
        spyOn(colorBuffer, "destroy").and.callThrough();

        return colors.deactivate();
      });
    });

    it("destroys the colors project", async () => expect(project.destroy).toHaveBeenCalled());

    it("destroys all the color buffers that were created", async function () {
      expect(project.colorBufferForEditor(editor)).toBeUndefined();
      expect(project.colorBuffersByEditorId).toBeNull();
      return expect(colorBuffer.destroy).toHaveBeenCalled();
    });

    it("removes the commands registered during activation", function () {
      const workspaceCommands = lumine.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);
      const editorCommands = lumine.commands
        .findCommands({ target: editorElement })
        .map((command) => command.name);

      expect(workspaceCommands).not.toContain("color-inline:reload");
      expect(editorCommands).not.toContain("color-inline:copy-as-hex");
    });

    return it("destroys the color buffer element that were added to the DOM", async () =>
      expect(editorElement.querySelector("color-inline-markers")).not.toExist());
  });

  describe("color-inline:project-settings", function () {
    let item = null;
    beforeEach(async function () {
      lumine.commands.dispatch(workspaceElement, "color-inline:project-settings");

      await waitsFor("active pane item", function () {
        item = lumine.workspace.getActivePaneItem();
        return item != null;
      });
    });

    return it("opens a settings view in the active pane", async () =>
      item.matches("color-inline-color-project"));
  });

  describe("editor commands", function () {
    let editor, miniEditor, miniElement;

    beforeEach(async function () {
      editor = await lumine.workspace.open("command-scope.css");
      editor.setText("#fff");
      editor.setCursorBufferPosition([0, 1]);
      await project.colorBufferForEditor(editor).initialize();

      miniEditor = new TextEditor({ mini: true });
      miniEditor.setText("#000");
      miniElement = lumine.views.getView(miniEditor);
      jasmine.attachToDOM(miniElement);
      miniElement.focus();
    });

    afterEach(() => miniEditor.destroy());

    it("does not expose conversion commands in a mini editor", function () {
      const commands = lumine.commands
        .findCommands({ target: miniElement })
        .map((command) => command.name);

      expect(commands).not.toContain("color-inline:convert-to-rgb");
    });

    return it("does not modify the active file when dispatched from a mini editor", function () {
      lumine.commands.dispatch(miniElement, "color-inline:convert-to-rgb");

      expect(editor.getText()).toBe("#fff");
      expect(miniEditor.getText()).toBe("#000");
    });
  });

  //#       ###    ########  ####
  //#      ## ##   ##     ##  ##
  //#     ##   ##  ##     ##  ##
  //#    ##     ## ########   ##
  //#    ######### ##         ##
  //#    ##     ## ##         ##
  //#    ##     ## ##        ####

  describe("API provider", function () {
    let [service, editor] = Array.from([]);
    beforeEach(async function () {
      await waitsForPromise({ label: "text-editor opened" }, () =>
        lumine.workspace.open("four-variables.styl").then(function (e) {
          editor = e;
          return project.colorBufferForEditor(editor);
        }),
      );

      await runs(() => (service = colors.provideColorInlineProject()));

      await waitsForPromise({ label: "project initialized" }, () => project.initialize());
    });

    it("returns an object conforming to the API", async function () {
      expect(service instanceof ColorInlineAPI).toBeTruthy();

      expect(service.getProject()).toBe(project);

      expect(service.getPalette()).toEqual(project.getPalette());
      expect(service.getPalette()).not.toBe(project.getPalette());

      expect(service.getVariables()).toEqual(project.getVariables());
      return expect(service.getColorVariables()).toEqual(project.getColorVariables());
    });

    return describe("::observeColorBuffers", function () {
      let [spy] = Array.from([]);

      beforeEach(async function () {
        spy = jasmine.createSpy("did-create-color-buffer");
        return service.observeColorBuffers(spy);
      });

      it("calls the callback for every existing color buffer", async function () {
        expect(spy).toHaveBeenCalled();
        return expect(spy.calls.count()).toEqual(1);
      });

      return it("calls the callback on every new buffer creation", async function () {
        await waitsForPromise({ label: "text-editor opened" }, () =>
          lumine.workspace.open("buttons.styl"),
        );

        await runs(() => expect(spy.calls.count()).toEqual(2));
      });
    });
  });

  //#     ######   #######  ##        #######  ########   ######
  //#    ##    ## ##     ## ##       ##     ## ##     ## ##    ##
  //#    ##       ##     ## ##       ##     ## ##     ## ##
  //#    ##       ##     ## ##       ##     ## ########   ######
  //#    ##       ##     ## ##       ##     ## ##   ##         ##
  //#    ##    ## ##     ## ##       ##     ## ##    ##  ##    ##
  //#     ######   #######  ########  #######  ##     ##  ######

  describe("color expression consumer", function () {
    let [colorProvider, consumerDisposable, editor, colorBuffer, otherConsumerDisposable] =
      Array.from([]);
    beforeEach(async function () {
      return (colorProvider = {
        name: "todo",
        regexpString: "TODO",
        scopes: ["*"],
        priority: 0,
        handle(_match, _expression, _context) {
          return (this.red = 255);
        },
      });
    });

    afterEach(async function () {
      if (consumerDisposable != null) {
        consumerDisposable.dispose();
      }
      return otherConsumerDisposable != null ? otherConsumerDisposable.dispose() : undefined;
    });

    describe("when consumed before opening a text editor", function () {
      beforeEach(async function () {
        consumerDisposable = colors.consumeColorExpressions(colorProvider);

        await waitsForPromise({ label: "text-editor opened" }, () =>
          lumine.workspace.open("color-consumer-sample.txt").then(function (e) {
            editor = e;
            return (colorBuffer = project.colorBufferForEditor(editor));
          }),
        );

        await waitsForPromise({ label: "color buffer initialized" }, () =>
          colorBuffer.initialize(),
        );
        await waitsForPromise({ label: "color buffer variables available" }, () =>
          colorBuffer.variablesAvailable(),
        );
      });

      it("parses the new expression and renders a color", async () =>
        expect(colorBuffer.getColorMarkers().length).toEqual(1));

      it("returns a Disposable instance", async () =>
        expect(consumerDisposable instanceof Disposable).toBeTruthy());

      return describe("the returned disposable", function () {
        it("removes the provided expression from the registry", async function () {
          consumerDisposable.dispose();

          return expect(
            project.getColorExpressionsRegistry().getExpression("todo"),
          ).toBeUndefined();
        });

        return it("triggers an update in the opened editors", async function () {
          const updateSpy = jasmine.createSpy("did-update-color-markers");

          colorBuffer.onDidUpdateColorMarkers(updateSpy);
          consumerDisposable.dispose();

          await waitsFor(
            "did-update-color-markers event dispatched",
            () => updateSpy.calls.count() > 0,
          );

          await runs(() => expect(colorBuffer.getColorMarkers().length).toEqual(0));
        });
      });
    });

    describe("when consumed after opening a text editor", function () {
      beforeEach(async function () {
        await waitsForPromise({ label: "text-editor opened" }, () =>
          lumine.workspace.open("color-consumer-sample.txt").then(function (e) {
            editor = e;
            return (colorBuffer = project.colorBufferForEditor(editor));
          }),
        );

        await waitsForPromise({ label: "color buffer initialized" }, () =>
          colorBuffer.initialize(),
        );
        await waitsForPromise({ label: "color buffer variables available" }, () =>
          colorBuffer.variablesAvailable(),
        );
      });

      it("triggers an update in the opened editors", async function () {
        const updateSpy = jasmine.createSpy("did-update-color-markers");

        colorBuffer.onDidUpdateColorMarkers(updateSpy);
        consumerDisposable = colors.consumeColorExpressions(colorProvider);

        await waitsFor(
          "did-update-color-markers event dispatched",
          () => updateSpy.calls.count() > 0,
        );

        await runs(async function () {
          expect(colorBuffer.getColorMarkers().length).toEqual(1);

          return consumerDisposable.dispose();
        });

        await waitsFor(
          "did-update-color-markers event dispatched",
          () => updateSpy.calls.count() > 1,
        );

        await runs(() => expect(colorBuffer.getColorMarkers().length).toEqual(0));
      });

      return describe("when an array of expressions is passed", () =>
        it("triggers an update in the opened editors", async function () {
          const updateSpy = jasmine.createSpy("did-update-color-markers");

          colorBuffer.onDidUpdateColorMarkers(updateSpy);
          consumerDisposable = colors.consumeColorExpressions({
            expressions: [colorProvider],
          });

          await waitsFor(
            "did-update-color-markers event dispatched",
            () => updateSpy.calls.count() > 0,
          );

          await runs(async function () {
            expect(colorBuffer.getColorMarkers().length).toEqual(1);

            return consumerDisposable.dispose();
          });

          await waitsFor(
            "did-update-color-markers event dispatched",
            () => updateSpy.calls.count() > 1,
          );

          await runs(() => expect(colorBuffer.getColorMarkers().length).toEqual(0));
        }));
    });

    return describe("when the expression matches a variable value", function () {
      beforeEach(
        async () =>
          await waitsForPromise({ label: "project initialized" }, () => project.initialize()),
      );

      it("detects the new variable as a color variable", async function () {
        const variableSpy = jasmine.createSpy("did-update-variables");

        project.onDidUpdateVariables(variableSpy);

        lumine.config.set("color-inline.delayBeforeScan", 0);

        lumine.config.set("color-inline.sourceNames", ["**/*.txt"]);

        await waitsFor("variables updated", () => variableSpy.calls.count() > 1);

        // Measured, not written down: the old fixed 6/4 only held while the
        // rescan was half-applied. Consuming the expression makes one existing
        // variable read as a colour, so the totals move by exactly that.
        const baseline = await settledVariableCount();
        const colorBaseline = project.getColorVariables().length;

        consumerDisposable = colors.consumeColorExpressions(colorProvider);

        await waitsFor("variables updated", () => variableSpy.calls.count() > 2);

        await runs(async function () {
          expect(project.getVariables().length).toEqual(baseline);
          return expect(project.getColorVariables().length).toEqual(colorBaseline + 1);
        });
      });

      return describe("and there was an expression that could not be resolved before", () =>
        it("updates the invalid color as a now valid color", async function () {
          const variableSpy = jasmine.createSpy("did-update-variables");

          project.onDidUpdateVariables(variableSpy);

          lumine.config.set("color-inline.delayBeforeScan", 0);

          lumine.config.set("color-inline.sourceNames", ["**/*.txt"]);

          await waitsFor("variables updated", () => variableSpy.calls.count() > 1);

          // Measured rather than written down, for the same reason as above.
          const baseline = await settledVariableCount();
          const colorBaseline = project.getColorVariables().length;

          await runs(async function () {
            otherConsumerDisposable = colors.consumeColorExpressions({
              name: "bar",
              regexpString: "baz\\s+(\\w+)",
              handle(match, expression, context) {
                const [_, expr] = Array.from(match);

                const color = context.readColor(expr);

                if (context.isInvalid(color)) {
                  return (this.invalid = true);
                }

                return (this.rgba = color.rgba);
              },
            });

            consumerDisposable = colors.consumeColorExpressions(colorProvider);

            await waitsFor("variables updated", () => variableSpy.calls.count() > 2);

            await runs(async function () {
              // Both expressions consumed, so `bar` resolves as well as `todo`.
              expect(project.getVariables().length).toEqual(baseline);
              expect(project.getColorVariables().length).toEqual(colorBaseline + 2);
              expect(project.getVariableByName("bar").color.invalid).toBeFalsy();

              return consumerDisposable.dispose();
            });

            await waitsFor("variables updated", () => variableSpy.calls.count() > 3);

            await runs(async function () {
              // `todo` disposed, so `bar` can no longer resolve through it.
              expect(project.getVariables().length).toEqual(baseline);
              expect(project.getColorVariables().length).toEqual(colorBaseline + 1);
              return expect(project.getVariableByName("bar").color.invalid).toBeTruthy();
            });
          });
        }));
    });
  });

  //#    ##     ##    ###    ########   ######
  //#    ##     ##   ## ##   ##     ## ##    ##
  //#    ##     ##  ##   ##  ##     ## ##
  //#    ##     ## ##     ## ########   ######
  //#     ##   ##  ######### ##   ##         ##
  //#      ## ##   ##     ## ##    ##  ##    ##
  //#       ###    ##     ## ##     ##  ######

  return describe("variable expression consumer", function () {
    let [variableProvider, consumerDisposable] = Array.from([]);

    beforeEach(async function () {
      variableProvider = {
        name: "todo",
        regexpString: "(TODO):\\s*([^;\\n]+)",
      };

      await waitsForPromise({ label: "project initialized" }, () => project.initialize());
    });

    afterEach(async () => (consumerDisposable != null ? consumerDisposable.dispose() : undefined));

    it("updates the project variables when consumed", async function () {
      const variableSpy = jasmine.createSpy("did-update-variables");

      project.onDidUpdateVariables(variableSpy);

      lumine.config.set("color-inline.delayBeforeScan", 0);
      lumine.config.set("color-inline.sourceNames", ["**/*.txt"]);

      await waitsFor("variables updated", () => variableSpy.calls.count() > 1);

      // The baseline is measured rather than written down. It used to be
      // asserted as a fixed 6, which only held while the rescan was still
      // half-applied: narrowing sourceNames evicts the variables of every file
      // that no longer matches, and four of that six were colour variables from
      // the sass and styl files the new pattern excludes. What this spec is
      // really about is the delta either side of consuming the service.
      const baseline = await settledVariableCount();
      const colorBaseline = project.getColorVariables().length;

      consumerDisposable = colors.consumeVariableExpressions(variableProvider);

      await waitsFor(
        "variables updated after service consumed",
        () => variableSpy.calls.count() > 2,
      );

      await runs(async function () {
        // `TODO: foo` in variable-consumer-sample.txt, and it is not a colour.
        expect(project.getVariables().length).toEqual(baseline + 1);
        expect(project.getColorVariables().length).toEqual(colorBaseline);

        return consumerDisposable.dispose();
      });

      await waitsFor(
        "variables updated after service disposed",
        () => variableSpy.calls.count() > 3,
      );

      await runs(async function () {
        expect(project.getVariables().length).toEqual(baseline);
        return expect(project.getColorVariables().length).toEqual(colorBaseline);
      });
    });

    return describe("when an array of expressions is passed", () =>
      it("updates the project variables when consumed", async function () {
        let previousVariablesCount = null;
        lumine.config.set("color-inline.delayBeforeScan", 0);

        // This used to wait for the count to hit 45 and then 6 -- two totals
        // measured while the rescan was still evicting the sass and styl
        // variables the new pattern excludes. Waiting for the count to stop
        // moving is the same intent without depending on where it stops, but
        // it has to see the rescan start first, or two reads taken before it
        // begins look just as settled as two taken after it finishes.
        const beforeChange = project.getVariables().length;
        lumine.config.set("color-inline.sourceNames", ["**/*.txt"]);
        await conditionPromise(() => project.getVariables().length !== beforeChange);

        const baseline = await settledVariableCount();
        const colorBaseline = project.getColorVariables().length;
        previousVariablesCount = baseline;

        consumerDisposable = colors.consumeVariableExpressions({
          expressions: [variableProvider],
        });

        await waitsFor(
          "variables updated after service consumed",
          () => project.getVariables().length !== previousVariablesCount,
        );

        await runs(async function () {
          expect(project.getVariables().length).toEqual(baseline + 1);
          expect(project.getColorVariables().length).toEqual(colorBaseline);

          previousVariablesCount = project.getVariables().length;

          return consumerDisposable.dispose();
        });

        await waitsFor(
          "variables updated after service disposed",
          () => project.getVariables().length !== previousVariablesCount,
        );

        await runs(async function () {
          expect(project.getVariables().length).toEqual(baseline);
          return expect(project.getColorVariables().length).toEqual(colorBaseline);
        });
      }));
  });
});
