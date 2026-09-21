const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise, waitsForQuiet } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const os = require("os");
const fs = require("fs");
const path = require("path");

const { SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("../lib/versions");
const jsonFixture = require("./helpers/fixtures").jsonFixture(__dirname, "fixtures");
const { _click } = require("./helpers/events");
require("./helpers/matchers");

let ColorProject, ColorBuffer;

const TOTAL_VARIABLES_IN_PROJECT = 12;
const TOTAL_COLORS_VARIABLES_IN_PROJECT = 10;

describe("ColorProject", function () {
  let [project, baseProject, _promise, rootPath, paths, eventSpy] = Array.from([]);

  // The project stores native paths, because they have to compare equal to
  // editor.getPath() when a buffer is looked up by path, so expectations are
  // built that way too rather than joined with a forward slash.
  const p = (relative) => path.join(rootPath, ...relative.split("/"));

  // A deserialized project holds exactly the strings it was serialized with,
  // and the JSON fixtures compose theirs as `#{root}` plus a literal `/`. So an
  // expectation about restored state has to be built the fixture's way, not the
  // loader's.
  // The themes the editor ships are not on the spec runner's package path, but
  // core's own theme fixtures are, and what these specs need is a real ui/syntax
  // pair to sample -- not any particular one. The mode is pinned because the
  // default follows the OS, and `theme.dark` would be the live key on a dark
  // machine.
  const FIXTURE_THEMES = ["theme-modern-ui", "theme-modern-syntax"];

  function activateFixtureThemes() {
    lumine.config.set("theme.mode", "light");
    lumine.config.set("theme.light", FIXTURE_THEMES);
  }

  // Resolved, not concatenated: the project holds the paths the scanner found,
  // which are this platform's spelling, and a `/` joined onto a Windows root
  // matches none of them.
  const fromFixture = (relative) => path.resolve(rootPath, relative);

  beforeEach(async function () {
    ColorProject = require("../lib/color-project");
    ColorBuffer = require("../lib/color-buffer");
    registerViewProvider();
    lumine.config.set("color-inline.sourceNames", ["*.styl"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("color-inline.filetypesForColorWords", ["*"]);

    const [fixturesPath] = Array.from(lumine.project.getPaths());
    rootPath = path.join(fixturesPath, "project");
    lumine.project.setPaths([rootPath]);

    return (baseProject = project =
      new ColorProject({
        ignoredNames: ["vendor/*"],
        sourceNames: ["*.less"],
        ignoredScopes: ["\\.comment"],
      }));
  });

  // Describes that restore a project reassign `project`, which used to orphan
  // the one made above: still observing the workspace, still building a color
  // buffer for every editor a later spec opens, and still calling through to
  // prototype spies those specs installed.
  afterEach(async function () {
    await project.destroy();
    if (baseProject !== project) await baseProject.destroy();
  });

  describe(".deserialize", function () {
    it("restores nested variables without re-entering the package deserializer", function () {
      const state = {
        version: SERIALIZE_VERSION,
        markersVersion: SERIALIZE_MARKERS_VERSION,
        globalSourceNames: ["*.styl"],
        globalIgnoredNames: [],
        variables: {
          deserializer: "VariablesCollection",
          content: [
            {
              name: "accent",
              value: "#abc",
              range: [0, 10],
              path: "/path/to/colors.styl",
              line: 1,
              isColor: true,
              color: [170, 187, 204, 1],
              variables: [],
            },
          ],
        },
      };
      spyOn(lumine.deserializers, "deserialize");

      project = ColorProject.deserialize(state);

      expect(lumine.deserializers.deserialize).not.toHaveBeenCalled();
      expect(project.getColorVariables()[0].color).toBeColor(170, 187, 204, 1);
    });

    it("restores the project in its previous state", async function () {
      const data = {
        root: rootPath,
        timestamp: new Date().toJSON(),
        version: SERIALIZE_VERSION,
        markersVersion: SERIALIZE_MARKERS_VERSION,
      };

      const json = jsonFixture("base-project.json", data);
      project = ColorProject.deserialize(json);

      expect(project).toBeDefined();
      expect(project.getPaths()).toEqual([
        fromFixture("styles/buttons.styl"),
        fromFixture("styles/variables.styl"),
      ]);
      expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT);
      return expect(project.getColorVariables().length).toEqual(TOTAL_COLORS_VARIABLES_IN_PROJECT);
    });
  });

  describe("::initialize", function () {
    beforeEach(async function () {
      registerViewProvider();
      eventSpy = jasmine.createSpy("did-initialize");
      project.onDidInitialize(eventSpy);
      await waitsForPromise(() => project.initialize());
    });

    it("loads the paths to scan in the project", async () =>
      expect(project.getPaths()).toEqual([p("styles/buttons.styl"), p("styles/variables.styl")]));

    it("scans the loaded paths to retrieve the variables", async function () {
      expect(project.getVariables()).toBeDefined();
      return expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT);
    });

    return it("dispatches a did-initialize event", async () => expect(eventSpy).toHaveBeenCalled());
  });

  describe("::findAllColors", () =>
    it("returns all the colors in the legibles files of the project", async function () {
      const search = project.findAllColors();
      return expect(search).toBeDefined();
    }));

  //#    ##     ##    ###    ########   ######     ##    ##  #######  ########
  //#    ##     ##   ## ##   ##     ## ##    ##    ###   ## ##     ##    ##
  //#    ##     ##  ##   ##  ##     ## ##          ####  ## ##     ##    ##
  //#    ##     ## ##     ## ########   ######     ## ## ## ##     ##    ##
  //#     ##   ##  ######### ##   ##         ##    ##  #### ##     ##    ##
  //#      ## ##   ##     ## ##    ##  ##    ##    ##   ### ##     ##    ##
  //#       ###    ##     ## ##     ##  ######     ##    ##  #######     ##
  //#
  //#    ##        #######     ###    ########  ######## ########
  //#    ##       ##     ##   ## ##   ##     ## ##       ##     ##
  //#    ##       ##     ##  ##   ##  ##     ## ##       ##     ##
  //#    ##       ##     ## ##     ## ##     ## ######   ##     ##
  //#    ##       ##     ## ######### ##     ## ##       ##     ##
  //#    ##       ##     ## ##     ## ##     ## ##       ##     ##
  //#    ########  #######  ##     ## ########  ######## ########

  describe("when the variables have not been loaded yet", function () {
    describe("::serialize", () =>
      it("returns an object without paths nor variables", async function () {
        const date = new Date();
        spyOn(project, "getTimestamp").and.callFake(() => date);
        const expected = {
          deserializer: "ColorProject",
          timestamp: date,
          version: SERIALIZE_VERSION,
          markersVersion: SERIALIZE_MARKERS_VERSION,
          globalSourceNames: ["*.styl"],
          globalIgnoredNames: [],
          ignoredNames: ["vendor/*"],
          sourceNames: ["*.less"],
          ignoredScopes: ["\\.comment"],
          buffers: {},
        };
        return expect(project.serialize()).toEqual(expected);
      }));

    describe("::getVariablesForPath", () =>
      it("returns undefined", async () =>
        expect(project.getVariablesForPath(p("styles/variables.styl"))).toEqual([])));

    describe("::getVariableByName", () =>
      it("returns undefined", async () =>
        expect(project.getVariableByName("foo")).toBeUndefined()));

    describe("::getVariableById", () =>
      it("returns undefined", async () => expect(project.getVariableById(0)).toBeUndefined()));

    describe("::getContext", () =>
      it("returns an empty context", async function () {
        expect(project.getContext()).toBeDefined();
        return expect(project.getContext().getVariablesCount()).toEqual(0);
      }));

    describe("::getPalette", () =>
      it("returns an empty palette", async function () {
        expect(project.getPalette()).toBeDefined();
        return expect(project.getPalette().getColorsCount()).toEqual(0);
      }));

    describe("::reloadVariablesForPath", function () {
      beforeEach(async function () {
        registerViewProvider();
        spyOn(project, "initialize").and.callThrough();

        await waitsForPromise(() => project.reloadVariablesForPath(p("styles/variables.styl")));
      });

      return it("returns a promise hooked on the initialize promise", async () =>
        expect(project.initialize).toHaveBeenCalled());
    });

    describe("::setIgnoredNames", function () {
      beforeEach(async function () {
        registerViewProvider();
        project.setIgnoredNames([]);

        await waitsForPromise(() => project.initialize());
      });

      return it("initializes the project with the new paths", async () =>
        expect(project.getVariables().length).toEqual(32));
    });

    return describe("::setSourceNames", function () {
      beforeEach(async function () {
        registerViewProvider();
        project.setSourceNames([]);

        await waitsForPromise(() => project.initialize());
      });

      return it("initializes the project with the new paths", async () =>
        expect(project.getVariables().length).toEqual(12));
    });
  });

  //#    ##     ##    ###    ########   ######
  //#    ##     ##   ## ##   ##     ## ##    ##
  //#    ##     ##  ##   ##  ##     ## ##
  //#    ##     ## ##     ## ########   ######
  //#     ##   ##  ######### ##   ##         ##
  //#      ## ##   ##     ## ##    ##  ##    ##
  //#       ###    ##     ## ##     ##  ######
  //#
  //#    ##        #######     ###    ########  ######## ########
  //#    ##       ##     ##   ## ##   ##     ## ##       ##     ##
  //#    ##       ##     ##  ##   ##  ##     ## ##       ##     ##
  //#    ##       ##     ## ##     ## ##     ## ######   ##     ##
  //#    ##       ##     ## ######### ##     ## ##       ##     ##
  //#    ##       ##     ## ##     ## ##     ## ##       ##     ##
  //#    ########  #######  ##     ## ########  ######## ########

  describe("when the project has no variables source files", function () {
    beforeEach(async function () {
      registerViewProvider();
      lumine.config.set("color-inline.sourceNames", ["*.sass"]);

      const [fixturesPath] = Array.from(lumine.project.getPaths());
      rootPath = `${fixturesPath}-no-sources`;
      lumine.project.setPaths([rootPath]);

      project = new ColorProject({});

      await waitsForPromise(() => project.initialize());
    });

    it("initializes the paths with an empty array", async () =>
      expect(project.getPaths()).toEqual([]));

    return it("initializes the variables with an empty array", async () =>
      expect(project.getVariables()).toEqual([]));
  });

  describe("when the project has custom source names defined", function () {
    beforeEach(async function () {
      registerViewProvider();
      lumine.config.set("color-inline.sourceNames", ["*.sass"]);

      const [_fixturesPath] = Array.from(lumine.project.getPaths());

      project = new ColorProject({ sourceNames: ["*.styl"] });

      await waitsForPromise(() => project.initialize());
    });

    it("initializes the paths with an empty array", async () =>
      expect(project.getPaths().length).toEqual(2));

    return it("initializes the variables with an empty array", async function () {
      expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT);
      return expect(project.getColorVariables().length).toEqual(TOTAL_COLORS_VARIABLES_IN_PROJECT);
    });
  });

  describe("when the project has looping variable definition", function () {
    beforeEach(async function () {
      registerViewProvider();
      lumine.config.set("color-inline.sourceNames", ["*.sass"]);

      const [fixturesPath] = Array.from(lumine.project.getPaths());
      rootPath = `${fixturesPath}-with-recursion`;
      lumine.project.setPaths([rootPath]);

      project = new ColorProject({});

      await waitsForPromise(() => project.initialize());
    });

    return it("ignores the looping definition", async function () {
      expect(project.getVariables().length).toEqual(5);
      return expect(project.getColorVariables().length).toEqual(5);
    });
  });

  describe("when the variables have been loaded", function () {
    beforeEach(async () => await waitsForPromise(() => project.initialize()));

    describe("::serialize", () =>
      it("returns an object with project properties", async function () {
        const date = new Date();
        spyOn(project, "getTimestamp").and.callFake(() => date);
        return expect(project.serialize()).toEqual({
          deserializer: "ColorProject",
          ignoredNames: ["vendor/*"],
          sourceNames: ["*.less"],
          ignoredScopes: ["\\.comment"],
          timestamp: date,
          version: SERIALIZE_VERSION,
          markersVersion: SERIALIZE_MARKERS_VERSION,
          paths: [p("styles/buttons.styl"), p("styles/variables.styl")],
          globalSourceNames: ["*.styl"],
          globalIgnoredNames: [],
          buffers: {},
          variables: project.variables.serialize(),
        });
      }));

    describe("::getVariablesForPath", function () {
      it("returns the variables defined in the file", async () =>
        expect(project.getVariablesForPath(p("styles/variables.styl")).length).toEqual(
          TOTAL_VARIABLES_IN_PROJECT,
        ));

      return describe("for a file that was ignored in the scanning process", () =>
        it("returns undefined", async () =>
          expect(project.getVariablesForPath(p("vendor/css/variables.less"))).toEqual([])));
    });

    describe("::deleteVariablesForPath", () =>
      it("removes all the variables coming from the specified file", async function () {
        project.deleteVariablesForPath(p("styles/variables.styl"));

        return expect(project.getVariablesForPath(p("styles/variables.styl"))).toEqual([]);
      }));

    describe("::getContext", () =>
      it("returns a context with the project variables", async function () {
        expect(project.getContext()).toBeDefined();
        return expect(project.getContext().getVariablesCount()).toEqual(TOTAL_VARIABLES_IN_PROJECT);
      }));

    describe("::getPalette", () =>
      it("returns a palette with the colors from the project", async function () {
        expect(project.getPalette()).toBeDefined();
        return expect(project.getPalette().getColorsCount()).toEqual(10);
      }));

    describe("::showVariableInFile", () =>
      it("opens the file where is located the variable", async function () {
        const spy = jasmine.createSpy("did-add-text-editor");
        lumine.workspace.onDidAddTextEditor(spy);

        project.showVariableInFile(project.getVariables()[0]);

        await waitsFor(() => spy.calls.count() > 0);

        await runs(async function () {
          const editor = lumine.workspace.getActiveTextEditor();

          return expect(editor.getSelectedBufferRange()).toEqual([
            [1, 2],
            [1, 14],
          ]);
        });
      }));

    describe("::reloadVariablesForPath", () =>
      describe("for a file that is part of the loaded paths", function () {
        describe("where the reload finds new variables", function () {
          beforeEach(async function () {
            registerViewProvider();
            project.deleteVariablesForPath(p("styles/variables.styl"));

            eventSpy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(eventSpy);
            await waitsForPromise(() => project.reloadVariablesForPath(p("styles/variables.styl")));
          });

          it("scans again the file to find variables", async () =>
            expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));

          return it("dispatches a did-update-variables event", async () =>
            expect(eventSpy).toHaveBeenCalled());
        });

        return describe("where the reload finds nothing new", function () {
          beforeEach(async function () {
            registerViewProvider();
            eventSpy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(eventSpy);
            await waitsForPromise(() => project.reloadVariablesForPath(p("styles/variables.styl")));
          });

          it("leaves the file variables intact", async () =>
            expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));

          return it("does not dispatch a did-update-variables event", async () =>
            expect(eventSpy).not.toHaveBeenCalled());
        });
      }));

    describe("::reloadVariablesForPaths", function () {
      describe("for a file that is part of the loaded paths", function () {
        describe("where the reload finds new variables", function () {
          beforeEach(async function () {
            registerViewProvider();
            project.deleteVariablesForPaths([p("styles/variables.styl"), p("styles/buttons.styl")]);
            eventSpy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(eventSpy);
            await waitsForPromise(() =>
              project.reloadVariablesForPaths([
                p("styles/variables.styl"),
                p("styles/buttons.styl"),
              ]),
            );
          });

          it("scans again the file to find variables", async () =>
            expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));

          return it("dispatches a did-update-variables event", async () =>
            expect(eventSpy).toHaveBeenCalled());
        });

        return describe("where the reload finds nothing new", function () {
          beforeEach(async function () {
            registerViewProvider();
            eventSpy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(eventSpy);
            await waitsForPromise(() =>
              project.reloadVariablesForPaths([
                p("styles/variables.styl"),
                p("styles/buttons.styl"),
              ]),
            );
          });

          it("leaves the file variables intact", async () =>
            expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));

          return it("does not dispatch a did-update-variables event", async () =>
            expect(eventSpy).not.toHaveBeenCalled());
        });
      });

      return describe("for a file that is not part of the loaded paths", function () {
        beforeEach(async function () {
          registerViewProvider();
          spyOn(project, "loadVariablesForPath").and.callThrough();

          await waitsForPromise(() =>
            project.reloadVariablesForPath(p("vendor/css/variables.less")),
          );
        });

        return it("does nothing", async () =>
          expect(project.loadVariablesForPath).not.toHaveBeenCalled());
      });
    });

    describe("when a buffer with variables is open", function () {
      let [editor, colorBuffer] = Array.from([]);

      // The first update to arrive after an edit is not necessarily the one the
      // edit caused: the project reloads several files and emits one of these
      // per collection change, so an update for another path can land first.
      // Waiting on the update that names this buffer's file makes the specs
      // read the collection only once their own edit has been applied to it.
      const updateFor = (key) =>
        eventSpy.calls
          .all()
          .map((call) => call.args[0])
          .find((update) => update[key]?.some((variable) => variable.path === editor.getPath()));
      beforeEach(async function () {
        registerViewProvider();

        await waitsForPromise(() =>
          lumine.workspace.open("styles/variables.styl").then((o) => (editor = o)),
        );

        await runs(async function () {
          colorBuffer = project.colorBufferForEditor(editor);
          return spyOn(colorBuffer, "scanBufferForVariables").and.callThrough();
        });

        await waitsForPromise(() => project.initialize());
        await waitsForPromise(() => colorBuffer.variablesAvailable());

        // Only now: opening the buffer and initializing the project each update
        // the variables themselves. A spy installed before them starts the spec
        // already satisfied, so `waitsFor(count > 0)` returns before the edit
        // below has been processed and `argsFor(0)` describes the wrong update.
        await runs(function () {
          eventSpy = jasmine.createSpy("did-update-variables");
          project.onDidUpdateVariables(eventSpy);
        });
      });

      it("updates the project variable with the buffer ranges", async () =>
        project.getVariables().map((variable) => expect(variable.bufferRange).toBeDefined()));

      describe("when a color is modified that does not affect other variables ranges", function () {
        let [variablesTextRanges] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          variablesTextRanges = {};
          project
            .getVariablesForPath(editor.getPath())
            .forEach((variable) => (variablesTextRanges[variable.name] = variable.range));

          editor.setSelectedBufferRange([
            [1, 7],
            [1, 14],
          ]);
          editor.insertText("#336");
          editor.getBuffer().emitter.emit("did-stop-changing");

          // The edit rewrites a variable's value, so wait for the update that
          // says one was updated rather than for any update at all: a buffer's
          // colors settle over more than one round, and taking the first one to
          // arrive read the ranges from before the edit was applied.
          await waitsFor(() => modificationUpdate() != null);
          await waitsForQuiet(() => eventSpy.calls.count());
        });

        const modificationUpdate = () => updateFor("updated");

        it("reloads the variables with the buffer instead of the file", async function () {
          expect(colorBuffer.scanBufferForVariables).toHaveBeenCalled();
          return expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT);
        });

        it("uses the buffer ranges to detect which variables were really changed", async function () {
          expect(modificationUpdate().destroyed).toBeUndefined();
          expect(modificationUpdate().created).toBeUndefined();
          return expect(modificationUpdate().updated.length).toEqual(1);
        });

        it("updates the text range of the other variables", async () =>
          project.getVariablesForPath(p("styles/variables.styl")).forEach(function (variable) {
            if (variable.name !== "colors.red") {
              expect(variable.range[0]).toEqual(variablesTextRanges[variable.name][0] - 3);
              return expect(variable.range[1]).toEqual(variablesTextRanges[variable.name][1] - 3);
            }
          }));

        return it("dispatches a did-update-variables event", async () =>
          expect(eventSpy).toHaveBeenCalled());
      });

      describe("when a text is inserted that affects other variables ranges", function () {
        let [variablesTextRanges, variablesBufferRanges] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          await runs(async function () {
            variablesTextRanges = {};
            variablesBufferRanges = {};
            project.getVariablesForPath(editor.getPath()).forEach(function (variable) {
              variablesTextRanges[variable.name] = variable.range;
              return (variablesBufferRanges[variable.name] = variable.bufferRange);
            });

            spyOn(project.variables, "addMany").and.callThrough();

            editor.setSelectedBufferRange([
              [0, 0],
              [0, 0],
            ]);
            editor.insertText("\n\n");
            return editor.getBuffer().emitter.emit("did-stop-changing");
          });

          await waitsFor(() => project.variables.addMany.calls.count() > 0);
        });

        it("does not trigger a change event", async () =>
          expect(eventSpy.calls.count()).toEqual(0));

        return it("updates the range of the updated variables", async () =>
          project.getVariablesForPath(p("styles/variables.styl")).forEach(function (variable) {
            if (variable.name !== "colors.red") {
              expect(variable.range[0]).toEqual(variablesTextRanges[variable.name][0] + 2);
              expect(variable.range[1]).toEqual(variablesTextRanges[variable.name][1] + 2);
              return expect(
                variable.bufferRange.isEqual(variablesBufferRanges[variable.name]),
              ).toBeFalsy();
            }
          }));
      });

      describe("when a color is removed", function () {
        let [variablesTextRanges] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          await runs(async function () {
            variablesTextRanges = {};
            project
              .getVariablesForPath(editor.getPath())
              .forEach((variable) => (variablesTextRanges[variable.name] = variable.range));

            editor.setSelectedBufferRange([
              [1, 0],
              [2, 0],
            ]);
            editor.insertText("");
            return editor.getBuffer().emitter.emit("did-stop-changing");
          });

          // The edit removes a variable, so wait for the update that says so
          // rather than for any update at all: a buffer's colors settle over
          // more than one round, and taking the first one to arrive read the
          // collection before the removal had been applied to it.
          await waitsFor(() => removalUpdate() != null);
          await waitsForQuiet(() => eventSpy.calls.count());
        });

        const removalUpdate = () => updateFor("destroyed");

        it("reloads the variables with the buffer instead of the file", async function () {
          expect(colorBuffer.scanBufferForVariables).toHaveBeenCalled();
          return expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT - 1);
        });

        it("uses the buffer ranges to detect which variables were really changed", async function () {
          expect(removalUpdate().destroyed.length).toEqual(1);
          expect(removalUpdate().created).toBeUndefined();
          return expect(removalUpdate().updated).toBeUndefined();
        });

        it("can no longer be found in the project variables", async function () {
          expect(project.getVariables().some((v) => v.name === "colors.red")).toBeFalsy();
          return expect(
            project.getColorVariables().some((v) => v.name === "colors.red"),
          ).toBeFalsy();
        });

        return it("dispatches a did-update-variables event", async () =>
          expect(eventSpy).toHaveBeenCalled());
      });

      return describe("when all the colors are removed", function () {
        let [variablesTextRanges] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          await runs(async function () {
            variablesTextRanges = {};
            project
              .getVariablesForPath(editor.getPath())
              .forEach((variable) => (variablesTextRanges[variable.name] = variable.range));

            editor.setSelectedBufferRange([
              [0, 0],
              [Infinity, Infinity],
            ]);
            editor.insertText("");
            return editor.getBuffer().emitter.emit("did-stop-changing");
          });

          // As above: wait for the update that reports the removals, not for
          // whichever update arrives first.
          await waitsFor(() => removalUpdate() != null);
          await waitsForQuiet(() => eventSpy.calls.count());
        });

        const removalUpdate = () => updateFor("destroyed");

        it("removes every variable from the file", async function () {
          expect(colorBuffer.scanBufferForVariables).toHaveBeenCalled();
          expect(project.getVariables().length).toEqual(0);

          expect(removalUpdate().destroyed.length).toEqual(TOTAL_VARIABLES_IN_PROJECT);
          expect(removalUpdate().created).toBeUndefined();
          return expect(removalUpdate().updated).toBeUndefined();
        });

        it("can no longer be found in the project variables", async function () {
          expect(project.getVariables().some((v) => v.name === "colors.red")).toBeFalsy();
          return expect(
            project.getColorVariables().some((v) => v.name === "colors.red"),
          ).toBeFalsy();
        });

        return it("dispatches a did-update-variables event", async () =>
          expect(eventSpy).toHaveBeenCalled());
      });
    });

    describe("::setIgnoredNames", function () {
      describe("with an empty array", function () {
        beforeEach(async function () {
          registerViewProvider();
          expect(project.getVariables().length).toEqual(12);

          const spy = jasmine.createSpy("did-update-variables");
          project.onDidUpdateVariables(spy);
          project.setIgnoredNames([]);

          await waitsFor(() => spy.calls.count() > 0);
        });

        return it("reloads the variables from the new paths", async () =>
          expect(project.getVariables().length).toEqual(32));
      });

      return describe("with a more restrictive array", function () {
        beforeEach(async function () {
          registerViewProvider();
          expect(project.getVariables().length).toEqual(12);

          const spy = jasmine.createSpy("did-update-variables");
          project.onDidUpdateVariables(spy);
          await waitsForPromise(() => project.setIgnoredNames(["vendor/*", "**/*.styl"]));
        });

        return it("clears all the paths as there is no legible paths", async () =>
          expect(project.getPaths().length).toEqual(0));
      });
    });

    describe("when the project has multiple root directory", function () {
      beforeEach(async function () {
        registerViewProvider();
        lumine.config.set("color-inline.sourceNames", ["**/*.sass", "**/*.styl"]);

        const [fixturesPath] = Array.from(lumine.project.getPaths());
        lumine.project.setPaths([`${fixturesPath}`, `${fixturesPath}-with-recursion`]);

        project = new ColorProject({});

        await waitsForPromise(() => project.initialize());
      });

      return it("finds the variables from the two directories", async () =>
        expect(project.getVariables().length).toEqual(17));
    });

    describe("when the project has VCS ignored files", function () {
      let [projectPath] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        lumine.config.set("color-inline.sourceNames", ["*.sass"]);

        const fixture = path.join(__dirname, "fixtures", "project-with-gitignore");

        projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "color-inline-project"));
        const dotGitFixture = path.join(fixture, "git.git");
        const dotGit = path.join(projectPath, ".git");
        fs.cpSync(dotGitFixture, dotGit, { recursive: true });
        fs.writeFileSync(
          path.join(projectPath, ".gitignore"),
          fs.readFileSync(path.join(fixture, "git.gitignore")),
        );
        fs.writeFileSync(
          path.join(projectPath, "base.sass"),
          fs.readFileSync(path.join(fixture, "base.sass")),
        );
        fs.writeFileSync(
          path.join(projectPath, "ignored.sass"),
          fs.readFileSync(path.join(fixture, "ignored.sass")),
        );
        fs.mkdirSync(path.join(projectPath, "bower_components"));
        fs.writeFileSync(
          path.join(projectPath, "bower_components", "some-ignored-file.sass"),
          fs.readFileSync(path.join(fixture, "bower_components", "some-ignored-file.sass")),
        );

        // FIXME repo.getWorkingDirectory returns the project path prefixed with
        // /private
        return lumine.project.setPaths([projectPath]);
      });

      describe("when the ignoreVcsIgnoredPaths setting is enabled", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.ignoreVcsIgnoredPaths", true);
          project = new ColorProject({});

          await waitsForPromise(() => project.initialize());
        });

        it("finds the variables from the three files", async function () {
          expect(project.getVariables().length).toEqual(3);
          return expect(project.getPaths().length).toEqual(1);
        });

        return describe("and then disabled", function () {
          beforeEach(async function () {
            registerViewProvider();
            const spy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(spy);
            lumine.config.set("color-inline.ignoreVcsIgnoredPaths", false);

            await waitsFor(() => spy.calls.count() > 0);
          });

          it("reloads the paths", async () => expect(project.getPaths().length).toEqual(3));

          return it("reloads the variables", async () =>
            expect(project.getVariables().length).toEqual(10));
        });
      });

      return describe("when the ignoreVcsIgnoredPaths setting is disabled", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.ignoreVcsIgnoredPaths", false);
          project = new ColorProject({});

          await waitsForPromise(() => project.initialize());
        });

        it("finds the variables from the three files", async function () {
          expect(project.getVariables().length).toEqual(10);
          return expect(project.getPaths().length).toEqual(3);
        });

        return describe("and then enabled", function () {
          beforeEach(async function () {
            registerViewProvider();
            const spy = jasmine.createSpy("did-update-variables");
            project.onDidUpdateVariables(spy);
            lumine.config.set("color-inline.ignoreVcsIgnoredPaths", true);

            await waitsFor(() => spy.calls.count() > 0);
          });

          it("reloads the paths", async () => expect(project.getPaths().length).toEqual(1));

          return it("reloads the variables", async () =>
            expect(project.getVariables().length).toEqual(3));
        });
      });
    });

    //#     ######  ######## ######## ######## #### ##    ##  ######    ######
    //#    ##    ## ##          ##       ##     ##  ###   ## ##    ##  ##    ##
    //#    ##       ##          ##       ##     ##  ####  ## ##        ##
    //#     ######  ######      ##       ##     ##  ## ## ## ##   ####  ######
    //#          ## ##          ##       ##     ##  ##  #### ##    ##        ##
    //#    ##    ## ##          ##       ##     ##  ##   ### ##    ##  ##    ##
    //#     ######  ########    ##       ##    #### ##    ##  ######    ######

    describe("when the sourceNames setting is changed", function () {
      let [updateSpy] = Array.from([]);

      beforeEach(async function () {
        registerViewProvider();
        const originalPaths = project.getPaths();
        lumine.config.set("color-inline.sourceNames", []);

        await waitsFor(() => project.getPaths().join(",") !== originalPaths.join(","));
      });

      it("updates the variables using the new pattern", async () =>
        expect(project.getVariables().length).toEqual(0));

      return describe("so that new paths are found", function () {
        beforeEach(async function () {
          registerViewProvider();
          updateSpy = jasmine.createSpy("did-update-variables");

          const originalPaths = project.getPaths();
          project.onDidUpdateVariables(updateSpy);

          lumine.config.set("color-inline.sourceNames", ["**/*.styl"]);

          await waitsFor(() => project.getPaths().join(",") !== originalPaths.join(","));
          await waitsFor(() => updateSpy.calls.count() > 0);
        });

        return it("loads the variables from these new paths", async () =>
          expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));
      });
    });

    describe("when the ignoredNames setting is changed", function () {
      let [updateSpy] = Array.from([]);

      beforeEach(async function () {
        registerViewProvider();
        const originalPaths = project.getPaths();
        lumine.config.set("color-inline.ignoredNames", ["**/*.styl"]);

        await waitsFor(() => project.getPaths().join(",") !== originalPaths.join(","));
      });

      it("updates the found using the new pattern", async () =>
        expect(project.getVariables().length).toEqual(0));

      return describe("so that new paths are found", function () {
        beforeEach(async function () {
          registerViewProvider();
          updateSpy = jasmine.createSpy("did-update-variables");

          const originalPaths = project.getPaths();
          project.onDidUpdateVariables(updateSpy);

          lumine.config.set("color-inline.ignoredNames", []);

          await waitsFor(() => project.getPaths().join(",") !== originalPaths.join(","));
          await waitsFor(() => updateSpy.calls.count() > 0);
        });

        return it("loads the variables from these new paths", async () =>
          expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));
      });
    });

    describe("when the extendedSearchNames setting is changed", function () {
      const [_updateSpy] = Array.from([]);

      beforeEach(async () => project.setSearchNames(["*.foo"]));

      it("updates the search names", async () =>
        expect(project.getSearchNames().length).toEqual(3));

      return it("serializes the setting", async () =>
        expect(project.serialize().searchNames).toEqual(["*.foo"]));
    });

    describe("when the ignore global config settings are enabled", function () {
      describe("for the sourceNames field", function () {
        beforeEach(async function () {
          registerViewProvider();
          project.sourceNames = ["*.foo"];
          await waitsForPromise(() => project.setIgnoreGlobalSourceNames(true));
        });

        it("ignores the content of the global config", async () =>
          expect(project.getSourceNames()).toEqual([".color-inline", "*.foo"]));

        return it("serializes the project setting", async () =>
          expect(project.serialize().ignoreGlobalSourceNames).toBeTruthy());
      });

      describe("for the ignoredNames field", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.ignoredNames", ["*.foo"]);
          project.ignoredNames = ["*.bar"];

          return project.setIgnoreGlobalIgnoredNames(true);
        });

        it("ignores the content of the global config", async () =>
          expect(project.getIgnoredNames()).toEqual(["*.bar"]));

        return it("serializes the project setting", async () =>
          expect(project.serialize().ignoreGlobalIgnoredNames).toBeTruthy());
      });

      describe("for the ignoredScopes field", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.ignoredScopes", ["\\.comment"]);
          project.ignoredScopes = ["\\.source"];

          return project.setIgnoreGlobalIgnoredScopes(true);
        });

        it("ignores the content of the global config", async () =>
          expect(project.getIgnoredScopes()).toEqual(["\\.source"]));

        return it("serializes the project setting", async () =>
          expect(project.serialize().ignoreGlobalIgnoredScopes).toBeTruthy());
      });

      return describe("for the searchNames field", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.extendedSearchNames", ["*.css"]);
          project.searchNames = ["*.foo"];

          return project.setIgnoreGlobalSearchNames(true);
        });

        it("ignores the content of the global config", async () =>
          expect(project.getSearchNames()).toEqual(["*.less", "*.foo"]));

        return it("serializes the project setting", async () =>
          expect(project.serialize().ignoreGlobalSearchNames).toBeTruthy());
      });
    });

    describe("::loadThemesVariables", function () {
      beforeEach(async function () {
        registerViewProvider();
        // A theme switch waits on real timers, and the spec clock is frozen.
        jasmine.useRealClock();
        activateFixtureThemes();

        await waitsForPromise(() => lumine.themes.activateThemes());

        await waitsForPromise(() => lumine.packages.activatePackage("color-inline"));
      });

      afterEach(async function () {
        lumine.themes.deactivateThemes();
        return lumine.themes.unwatchUserStylesheet();
      });

      return it("returns an array of 62 variables", async function () {
        const themeVariables = project.loadThemesVariables();
        return expect(themeVariables.length).toEqual(62);
      });
    });

    return describe("when the includeThemes setting is enabled", function () {
      let spy;
      [paths, spy] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        paths = project.getPaths();
        expect(project.getColorVariables().length).toEqual(10);

        jasmine.useRealClock();
        activateFixtureThemes();

        await waitsForPromise(() => lumine.themes.activateThemes());

        await waitsForPromise(() => lumine.packages.activatePackage("color-inline"));

        await waitsForPromise(() => project.initialize());

        await runs(async function () {
          spy = jasmine.createSpy("did-change-active-themes");
          lumine.themes.onDidChangeActiveThemes(spy);
          return project.setIncludeThemes(true);
        });
      });

      afterEach(async function () {
        lumine.themes.deactivateThemes();
        return lumine.themes.unwatchUserStylesheet();
      });

      it("includes the variables set for ui and syntax themes in the palette", async () =>
        expect(project.getColorVariables().length).toEqual(72));

      it("still includes the paths from the project", async () =>
        paths.map((p) => expect(project.getPaths().indexOf(p)).not.toEqual(-1)));

      it("serializes the setting with the project", async function () {
        const serialized = project.serialize();

        return expect(serialized.includeThemes).toEqual(true);
      });

      describe("and then disabled", function () {
        beforeEach(async () => project.setIncludeThemes(false));

        it("removes all the paths to the themes stylesheets", async () =>
          expect(project.getColorVariables().length).toEqual(10));

        return describe("when the active themes setting is modified", function () {
          beforeEach(async function () {
            registerViewProvider();
            spyOn(project, "loadThemesVariables").and.callThrough();
            lumine.config.set("theme.light", [FIXTURE_THEMES[0]]);

            await waitsFor(() => spy.calls.count() > 0);
          });

          return it("does not trigger a paths update", async () =>
            expect(project.loadThemesVariables).not.toHaveBeenCalled());
        });
      });

      return describe("when the active themes setting is modified", function () {
        beforeEach(async function () {
          registerViewProvider();
          spyOn(project, "loadThemesVariables").and.callThrough();
          lumine.config.set("theme.light", [FIXTURE_THEMES[0]]);

          await waitsFor(() => spy.calls.count() > 0);
        });

        return it("triggers a paths update", async () =>
          expect(project.loadThemesVariables).toHaveBeenCalled());
      });
    });
  });

  //#    ########  ########  ######  ########  #######  ########  ########
  //#    ##     ## ##       ##    ##    ##    ##     ## ##     ## ##
  //#    ##     ## ##       ##          ##    ##     ## ##     ## ##
  //#    ########  ######    ######     ##    ##     ## ########  ######
  //#    ##   ##   ##             ##    ##    ##     ## ##   ##   ##
  //#    ##    ##  ##       ##    ##    ##    ##     ## ##    ##  ##
  //#    ##     ## ########  ######     ##     #######  ##     ## ########

  return describe("when restored", function () {
    const createProject = function (params = {}) {
      const { stateFixture } = params;
      delete params.stateFixture;

      if (params.root == null) {
        params.root = rootPath;
      }
      if (params.timestamp == null) {
        params.timestamp = new Date().toJSON();
      }
      if (params.variableMarkers == null) {
        params.variableMarkers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      }
      if (params.colorMarkers == null) {
        params.colorMarkers = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
      }
      if (params.version == null) {
        params.version = SERIALIZE_VERSION;
      }
      if (params.markersVersion == null) {
        params.markersVersion = SERIALIZE_MARKERS_VERSION;
      }

      return ColorProject.deserialize(jsonFixture(stateFixture, params));
    };

    describe("with a timestamp more recent than the files last modification date", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          stateFixture: "empty-project.json",
        });

        await waitsForPromise(() => project.initialize());
      });

      return it("does not rescans the files", async () =>
        expect(project.getVariables().length).toEqual(1));
    });

    describe("with a version different that the current one", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          stateFixture: "empty-project.json",
          version: "0.0.0",
        });

        await waitsForPromise(() => project.initialize());
      });

      return it("drops the whole serialized state and rescans all the project", async () =>
        expect(project.getVariables().length).toEqual(12));
    });

    describe("with a serialized path that no longer exist", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          stateFixture: "rename-file-project.json",
        });

        await waitsForPromise(() => project.initialize());
      });

      it("drops drops the non-existing and reload the paths", async () =>
        expect(project.getPaths()).toEqual([p("styles/buttons.styl"), p("styles/variables.styl")]));

      it("drops the variables from the removed paths", async () =>
        expect(project.getVariablesForPath(p("styles/foo.styl")).length).toEqual(0));

      return it("loads the variables from the new file", async () =>
        expect(project.getVariablesForPath(p("styles/variables.styl")).length).toEqual(12));
    });

    describe("with a sourceNames setting value different than when serialized", function () {
      beforeEach(async function () {
        registerViewProvider();
        lumine.config.set("color-inline.sourceNames", []);

        project = createProject({
          stateFixture: "empty-project.json",
        });

        await waitsForPromise(() => project.initialize());
      });

      return it("drops the whole serialized state and rescans all the project", async () =>
        expect(project.getVariables().length).toEqual(0));
    });

    describe("with a markers version different that the current one", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          stateFixture: "empty-project.json",
          markersVersion: "0.0.0",
        });

        await waitsForPromise(() => project.initialize());
      });

      it("keeps the project related data", async function () {
        expect(project.ignoredNames).toEqual(["vendor/*"]);
        return expect(project.getPaths()).toEqual([
          p("styles/buttons.styl"),
          p("styles/variables.styl"),
        ]);
      });

      return it("drops the variables and buffers data", async () =>
        expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));
    });

    describe("with a timestamp older than the files last modification date", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          timestamp: new Date(0).toJSON(),
          stateFixture: "empty-project.json",
        });

        await waitsForPromise(() => project.initialize());
      });

      return it("scans again all the files that have a more recent modification date", async () =>
        expect(project.getVariables().length).toEqual(TOTAL_VARIABLES_IN_PROJECT));
    });

    describe("with some files not saved in the project state", function () {
      beforeEach(async function () {
        registerViewProvider();
        project = createProject({
          stateFixture: "partial-project.json",
        });

        await waitsForPromise(() => project.initialize());
      });

      return it("detects the new files and scans them", async () =>
        expect(project.getVariables().length).toEqual(12));
    });

    describe("with an open editor and the corresponding buffer state", function () {
      let [editor, colorBuffer] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        // The suite's own project observes the workspace as well, and would
        // build a second color buffer for the editor opened below -- one with
        // no restored state, which does have to ask for the project variables.
        // The spy is on the prototype and cannot tell the two apart.
        await baseProject.destroy();

        await waitsForPromise(() =>
          lumine.workspace.open("variables.styl").then((o) => (editor = o)),
        );

        await runs(async function () {
          project = createProject({
            stateFixture: "open-buffer-project.json",
            id: editor.id,
          });

          return spyOn(ColorBuffer.prototype, "variablesAvailable").and.callThrough();
        });

        await runs(() => (colorBuffer = project.colorBuffersByEditorId[editor.id]));
      });

      it("restores the color buffer in its previous state", async function () {
        expect(colorBuffer).toBeDefined();
        return expect(colorBuffer.getColorMarkers().length).toEqual(
          TOTAL_COLORS_VARIABLES_IN_PROJECT,
        );
      });

      return it("does not wait for the project variables", async () =>
        expect(colorBuffer.variablesAvailable).not.toHaveBeenCalled());
    });

    return describe("with an open editor, the corresponding buffer state and a old timestamp", function () {
      let [editor, colorBuffer] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() =>
          lumine.workspace.open("variables.styl").then((o) => (editor = o)),
        );

        await runs(async function () {
          spyOn(ColorBuffer.prototype, "updateVariableRanges").and.callThrough();
          return (project = createProject({
            timestamp: new Date(0).toJSON(),
            stateFixture: "open-buffer-project.json",
            id: editor.id,
          }));
        });

        await runs(() => (colorBuffer = project.colorBuffersByEditorId[editor.id]));

        await waitsFor(() => colorBuffer.updateVariableRanges.calls.count() > 0);
      });

      return it("invalidates the color buffer markers as soon as the dirty paths have been determined", async () =>
        expect(colorBuffer.updateVariableRanges).toHaveBeenCalled());
    });
  });
});

//#    ########  ######## ########    ###    ##     ## ##       ########
//#    ##     ## ##       ##         ## ##   ##     ## ##          ##
//#    ##     ## ##       ##        ##   ##  ##     ## ##          ##
//#    ##     ## ######   ######   ##     ## ##     ## ##          ##
//#    ##     ## ##       ##       ######### ##     ## ##          ##
//#    ##     ## ##       ##       ##     ## ##     ## ##          ##
//#    ########  ######## ##       ##     ##  #######  ########    ##

describe("ColorProject defaults file", function () {
  let [project, rootPath] = Array.from([]);
  return describe("when the project has a color-inline defaults file", function () {
    beforeEach(async function () {
      ColorProject = require("../lib/color-project");
      registerViewProvider();
      lumine.config.set("color-inline.sourceNames", ["*.sass"]);

      const [fixturesPath] = Array.from(lumine.project.getPaths());
      rootPath = `${fixturesPath}/project-with-defaults`;
      lumine.project.setPaths([rootPath]);

      project = new ColorProject({});

      await waitsForPromise(() => project.initialize());
    });

    return it("loads the defaults file content", async () =>
      expect(project.getColorVariables().length).toEqual(12));
  });
});
