/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const path = require("path");
require("./helpers/matchers");

const VariablesCollection = require("../lib/variables-collection");

// Variables bucket under their path, and a restored one is normalised to this
// platform's spelling so a rescan -- which reports what the scanner found --
// replaces the right bucket. The expectation is built the same way rather than
// as a POSIX literal that could only ever match on a POSIX machine.
const FOO_PATH = path.normalize("/path/to/foo.styl");

describe("VariablesCollection", function () {
  let [collection, changeSpy] = Array.from([]);

  const createVar = (name, value, range, path, line) => ({
    name,
    value,
    range,
    path,
    line,
  });

  return describe("with an empty collection", function () {
    beforeEach(function () {
      collection = new VariablesCollection();
      changeSpy = jasmine.createSpy("did-change");
      return collection.onDidChange(changeSpy);
    });

    //#       ###    ########  ########
    //#      ## ##   ##     ## ##     ##
    //#     ##   ##  ##     ## ##     ##
    //#    ##     ## ##     ## ##     ##
    //#    ######### ##     ## ##     ##
    //#    ##     ## ##     ## ##     ##
    //#    ##     ## ########  ########

    describe("::addMany", function () {
      beforeEach(() =>
        collection.addMany([
          createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
          createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
          createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
          createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
          createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
        ]),
      );

      it("stores them in the collection", () => expect(collection.length).toEqual(5));

      it("detects that two of the variables are color variables", () =>
        expect(collection.getColorVariables().length).toEqual(2));

      it("dispatches a change event", function () {
        expect(changeSpy).toHaveBeenCalled();

        const arg = changeSpy.calls.mostRecent().args[0];
        expect(arg.created.length).toEqual(5);
        expect(arg.destroyed).toBeUndefined();
        return expect(arg.updated).toBeUndefined();
      });

      it("stores the names of the variables", () =>
        expect(collection.variableNames.sort()).toEqual(
          ["foo", "bar", "baz", "bat", "bab"].sort(),
        ));

      it("builds a dependencies map", () =>
        expect(collection.dependencyGraph).toEqual({
          foo: ["baz"],
          bar: ["bat"],
          bat: ["bab"],
        }));

      describe("appending an already existing variable", function () {
        beforeEach(() =>
          collection.addMany([createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1)]),
        );

        it("leaves the collection untouched", function () {
          expect(collection.length).toEqual(5);
          return expect(collection.getColorVariables().length).toEqual(2);
        });

        return it("does not trigger an update event", () =>
          expect(changeSpy.calls.count()).toEqual(1));
      });

      return describe("appending an already existing variable with a different value", function () {
        describe("that has a different range", function () {
          beforeEach(() =>
            collection.addMany([createVar("foo", "#aabbcc", [0, 14], "/path/to/foo.styl", 1)]),
          );

          it("leaves the collection untouched", function () {
            expect(collection.length).toEqual(5);
            return expect(collection.getColorVariables().length).toEqual(2);
          });

          it("updates the existing variable value", function () {
            const variable = collection.find({
              name: "foo",
              path: "/path/to/foo.styl",
            });
            expect(variable.value).toEqual("#aabbcc");
            expect(variable.isColor).toBeTruthy();
            return expect(variable.color).toBeColor("#aabbcc");
          });

          return it("emits a change event", function () {
            expect(changeSpy.calls.count()).toEqual(2);

            const arg = changeSpy.calls.mostRecent().args[0];
            expect(arg.created).toBeUndefined();
            expect(arg.destroyed).toBeUndefined();
            return expect(arg.updated.length).toEqual(2);
          });
        });

        describe("that has a different range and a different line", function () {
          beforeEach(() =>
            collection.addMany([createVar("foo", "#abc", [52, 64], "/path/to/foo.styl", 6)]),
          );

          it("appends the new variables", function () {
            expect(collection.length).toEqual(6);
            return expect(collection.getColorVariables().length).toEqual(3);
          });

          it("stores the two variables", function () {
            const variables = collection.findAll({
              name: "foo",
              path: "/path/to/foo.styl",
            });
            return expect(variables.length).toEqual(2);
          });

          return it("emits a change event", function () {
            expect(changeSpy.calls.count()).toEqual(2);

            const arg = changeSpy.calls.mostRecent().args[0];
            expect(arg.created.length).toEqual(1);
            expect(arg.destroyed).toBeUndefined();
            return expect(arg.updated.length).toEqual(1);
          });
        });

        describe("that is still a color", function () {
          beforeEach(() =>
            collection.addMany([createVar("foo", "#abc", [0, 10], "/path/to/foo.styl", 1)]),
          );

          it("leaves the collection untouched", function () {
            expect(collection.length).toEqual(5);
            return expect(collection.getColorVariables().length).toEqual(2);
          });

          it("updates the existing variable value", function () {
            const variable = collection.find({
              name: "foo",
              path: "/path/to/foo.styl",
            });
            expect(variable.value).toEqual("#abc");
            expect(variable.isColor).toBeTruthy();
            return expect(variable.color).toBeColor("#abc");
          });

          return it("emits a change event", function () {
            expect(changeSpy.calls.count()).toEqual(2);

            const arg = changeSpy.calls.mostRecent().args[0];
            expect(arg.created).toBeUndefined();
            expect(arg.destroyed).toBeUndefined();
            return expect(arg.updated.length).toEqual(2);
          });
        });

        describe("that is no longer a color", function () {
          beforeEach(() =>
            collection.addMany([createVar("foo", "20px", [0, 10], "/path/to/foo.styl", 1)]),
          );

          it("leaves the collection variables untouched", () =>
            expect(collection.length).toEqual(5));

          it("affects the colors variables within the collection", () =>
            expect(collection.getColorVariables().length).toEqual(0));

          it("updates the existing variable value", function () {
            const variable = collection.find({
              name: "foo",
              path: "/path/to/foo.styl",
            });
            expect(variable.value).toEqual("20px");
            return expect(variable.isColor).toBeFalsy();
          });

          it("updates the variables depending on the changed variable", function () {
            const variable = collection.find({
              name: "baz",
              path: "/path/to/foo.styl",
            });
            return expect(variable.isColor).toBeFalsy();
          });

          return it("emits a change event", function () {
            const arg = changeSpy.calls.mostRecent().args[0];
            expect(changeSpy.calls.count()).toEqual(2);

            expect(arg.created).toBeUndefined();
            expect(arg.destroyed).toBeUndefined();
            return expect(arg.updated.length).toEqual(2);
          });
        });

        describe("that breaks a dependency", function () {
          beforeEach(() =>
            collection.addMany([createVar("baz", "#abc", [22, 30], "/path/to/foo.styl", 3)]),
          );

          it("leaves the collection untouched", function () {
            expect(collection.length).toEqual(5);
            return expect(collection.getColorVariables().length).toEqual(2);
          });

          it("updates the existing variable value", function () {
            const variable = collection.find({
              name: "baz",
              path: "/path/to/foo.styl",
            });
            expect(variable.value).toEqual("#abc");
            expect(variable.isColor).toBeTruthy();
            return expect(variable.color).toBeColor("#abc");
          });

          return it("updates the dependencies graph", () =>
            expect(collection.dependencyGraph).toEqual({
              bar: ["bat"],
              bat: ["bab"],
            }));
        });

        return describe("that adds a dependency", function () {
          beforeEach(() =>
            collection.addMany([
              createVar("baz", "transparentize(foo, bar)", [22, 30], "/path/to/foo.styl", 3),
            ]),
          );

          it("leaves the collection untouched", function () {
            expect(collection.length).toEqual(5);
            return expect(collection.getColorVariables().length).toEqual(2);
          });

          it("updates the existing variable value", function () {
            const variable = collection.find({
              name: "baz",
              path: "/path/to/foo.styl",
            });
            expect(variable.value).toEqual("transparentize(foo, bar)");
            expect(variable.isColor).toBeTruthy();
            return expect(variable.color).toBeColor(255, 255, 255, 0.5);
          });

          return it("updates the dependencies graph", () =>
            expect(collection.dependencyGraph).toEqual({
              foo: ["baz"],
              bar: ["bat", "baz"],
              bat: ["bab"],
            }));
        });
      });
    });

    //#    ########  ######## ##     ##  #######  ##     ## ########
    //#    ##     ## ##       ###   ### ##     ## ##     ## ##
    //#    ##     ## ##       #### #### ##     ## ##     ## ##
    //#    ########  ######   ## ### ## ##     ## ##     ## ######
    //#    ##   ##   ##       ##     ## ##     ##  ##   ##  ##
    //#    ##    ##  ##       ##     ## ##     ##   ## ##   ##
    //#    ##     ## ######## ##     ##  #######     ###    ########

    describe("::removeMany", function () {
      beforeEach(() =>
        collection.addMany([
          createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
          createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
          createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
          createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
          createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
        ]),
      );

      describe("with variables that were not colors", function () {
        beforeEach(() =>
          collection.removeMany([
            createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
            createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
          ]),
        );

        it("removes the variables from the collection", () => expect(collection.length).toEqual(3));

        it("dispatches a change event", function () {
          expect(changeSpy).toHaveBeenCalled();

          const arg = changeSpy.calls.mostRecent().args[0];
          expect(arg.created).toBeUndefined();
          expect(arg.destroyed.length).toEqual(2);
          return expect(arg.updated).toBeUndefined();
        });

        it("stores the names of the variables", () =>
          expect(collection.variableNames.sort()).toEqual(["foo", "bar", "baz"].sort()));

        it("updates the variables per path map", () =>
          expect(collection.variablesByPath["/path/to/foo.styl"].length).toEqual(3));

        return it("updates the dependencies map", () =>
          expect(collection.dependencyGraph).toEqual({
            foo: ["baz"],
          }));
      });

      return describe("with variables that were referenced by a color variable", function () {
        beforeEach(() =>
          collection.removeMany([createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1)]),
        );

        it("removes the variables from the collection", function () {
          expect(collection.length).toEqual(4);
          return expect(collection.getColorVariables().length).toEqual(0);
        });

        it("dispatches a change event", function () {
          expect(changeSpy).toHaveBeenCalled();

          const arg = changeSpy.calls.mostRecent().args[0];
          expect(arg.created).toBeUndefined();
          expect(arg.destroyed.length).toEqual(1);
          return expect(arg.updated.length).toEqual(1);
        });

        it("stores the names of the variables", () =>
          expect(collection.variableNames.sort()).toEqual(["bar", "baz", "bat", "bab"].sort()));

        it("updates the variables per path map", () =>
          expect(collection.variablesByPath["/path/to/foo.styl"].length).toEqual(4));

        return it("updates the dependencies map", () =>
          expect(collection.dependencyGraph).toEqual({
            bar: ["bat"],
            bat: ["bab"],
          }));
      });
    });

    //#    ##     ## ########  ########     ###    ######## ########
    //#    ##     ## ##     ## ##     ##   ## ##      ##    ##
    //#    ##     ## ##     ## ##     ##  ##   ##     ##    ##
    //#    ##     ## ########  ##     ## ##     ##    ##    ######
    //#    ##     ## ##        ##     ## #########    ##    ##
    //#    ##     ## ##        ##     ## ##     ##    ##    ##
    //#     #######  ##        ########  ##     ##    ##    ########

    describe("::updatePathCollection", function () {
      beforeEach(() =>
        collection.addMany([
          createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
          createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
          createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
          createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
          createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
        ]),
      );

      describe("when a new variable is added", function () {
        beforeEach(() =>
          collection.updatePathCollection("/path/to/foo.styl", [
            createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
            createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
            createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
            createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
            createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
            createVar("baa", "#f00", [52, 60], "/path/to/foo.styl", 6),
          ]),
        );

        return it("detects the addition and leave the rest of the collection unchanged", function () {
          expect(collection.length).toEqual(6);
          expect(collection.getColorVariables().length).toEqual(3);
          expect(changeSpy.calls.mostRecent().args[0].created.length).toEqual(1);
          expect(changeSpy.calls.mostRecent().args[0].destroyed).toBeUndefined();
          return expect(changeSpy.calls.mostRecent().args[0].updated).toBeUndefined();
        });
      });

      describe("when a variable is removed", function () {
        beforeEach(() =>
          collection.updatePathCollection("/path/to/foo.styl", [
            createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
            createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
            createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
            createVar("bat", "bar", [32, 40], "/path/to/foo.styl", 4),
          ]),
        );

        return it("removes the variable that is not present in the new array", function () {
          expect(collection.length).toEqual(4);
          expect(collection.getColorVariables().length).toEqual(2);
          expect(changeSpy.calls.mostRecent().args[0].destroyed.length).toEqual(1);
          expect(changeSpy.calls.mostRecent().args[0].created).toBeUndefined();
          return expect(changeSpy.calls.mostRecent().args[0].updated).toBeUndefined();
        });
      });

      return describe("when a new variable is changed", function () {
        beforeEach(() =>
          collection.updatePathCollection("/path/to/foo.styl", [
            createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
            createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2),
            createVar("baz", "foo", [22, 30], "/path/to/foo.styl", 3),
            createVar("bat", "#abc", [32, 40], "/path/to/foo.styl", 4),
            createVar("bab", "bat", [42, 50], "/path/to/foo.styl", 5),
          ]),
        );

        return it("detects the update", function () {
          expect(collection.length).toEqual(5);
          expect(collection.getColorVariables().length).toEqual(4);
          expect(changeSpy.calls.mostRecent().args[0].updated.length).toEqual(2);
          expect(changeSpy.calls.mostRecent().args[0].destroyed).toBeUndefined();
          return expect(changeSpy.calls.mostRecent().args[0].created).toBeUndefined();
        });
      });
    });

    describe("project collection updates", function () {
      it("keeps defaults-file color words available when named colors are scoped to sources", function () {
        const registry = require("../lib/color-expressions");
        const namedColors = registry.getExpression("color-inline:named_colors");
        const scopes = namedColors.scopes;
        namedColors.scopes = ["css", "less"];
        try {
          collection.add({
            ...createVar("@accent", "red", [0, 10], path.normalize("/path/to/.color-inline"), 1),
            scope: "color-inline",
          });
          expect(collection.getVariableByName("@accent").color).toBeColor(255, 0, 0);
          expect(collection.getContext().scopeFromFileName("/path/to/.color-inline")).toEqual("*");
        } finally {
          namedColors.scopes = scopes;
        }
      });

      it("evaluates source functions in their language and configured Sass dialect", function () {
        const sassPath = path.normalize("/path/to/colors.scss");
        collection.sassScopeSuffix = "compass";
        collection.addMany([
          createVar("$base", "#ff0000", [0, 10], sassPath, 1),
          createVar("$tint", "tint(tint($base, 25%), 25%)", [12, 22], sassPath, 2),
        ]);

        expect(collection.getVariableByName("$tint").color).toBeColor(255, 239, 239);
        collection.sassScopeSuffix = "bourbon";
        collection.evaluateVariableColor(collection.getVariableByName("$tint"), true);
        expect(collection.getVariableByName("$tint").color).toBeColor(255, 111, 111);
      });

      it("uses a scanner's explicit source scope while resolving nested aliases", function () {
        const fixturePath = path.normalize("/path/to/source.txt");
        collection.addMany([
          { ...createVar("$base", "#ff0000", [0, 10], fixturePath, 1), scope: "scss:compass" },
          {
            ...createVar("$tint", "tint($base, 25%)", [12, 22], fixturePath, 2),
            scope: "scss:compass",
          },
        ]);

        expect(collection.getVariableByName("$tint").color).toBeColor(255, 191, 191);
        collection.addMany([
          { ...createVar("$base", "#ff0000", [0, 10], fixturePath, 1), scope: "scss:bourbon" },
          {
            ...createVar("$tint", "tint($base, 25%)", [12, 22], fixturePath, 2),
            scope: "scss:bourbon",
          },
        ]);
        collection.evaluateVariableColor(collection.getVariableByName("$tint"), true);
        expect(collection.getVariableByName("$tint").color).toBeColor(255, 63, 63);
      });

      it("removes variables from a rescanned path that now contains none", function () {
        const otherPath = path.normalize("/path/to/other.styl");
        collection.addMany([
          createVar("removed", "#fff", [0, 10], FOO_PATH, 1),
          createVar("retained", "#000", [0, 10], otherPath, 1),
        ]);

        collection.updateCollection(
          [createVar("retained", "#000", [0, 10], otherPath, 1)],
          [FOO_PATH, otherPath],
        );

        expect(collection.getVariablesForPath(FOO_PATH)).toEqual([]);
        expect(collection.getVariablesForPath(otherPath).map((v) => v.name)).toEqual(["retained"]);
        expect(collection.getVariables().map((v) => v.name)).toEqual(["retained"]);
      });

      it("keeps last-definition and default precedence when a definition is removed", function () {
        const first = createVar("shared", "#f00", [0, 10], FOO_PATH, 1);
        const second = createVar("shared", "#0f0", [12, 22], FOO_PATH, 2);
        const fallback = createVar("shared", "#00f", [0, 10], "/path/to/.color-inline", 1);
        fallback.default = true;
        collection.addMany([first, second, fallback]);
        collection.add(createVar("alias", "shared", [24, 34], FOO_PATH, 3));
        expect(collection.getVariableByName("alias").color).toBeColor("#0f0");

        collection.remove(second);
        expect(collection.getVariableByName("alias").color).toBeColor("#f00");
        collection.remove(first);
        expect(collection.getVariableByName("alias").color).toBeColor("#00f");
        collection.remove(fallback);
        expect(collection.getVariableByName("alias").isColor).toBeFalsy();
      });

      it("does not scan every declaration for each unique name in a large source", function () {
        const variables = Array.from({ length: 512 }, (_, index) =>
          createVar(`color${index}`, "#abcdef", [index * 20, index * 20 + 18], FOO_PATH, index),
        );
        collection.updateCollection(variables);
        spyOn(collection, "compareVariables").and.callThrough();
        collection.updateCollection(variables.map((variable) => ({ ...variable })));

        expect(collection.getColorVariables().length).toEqual(512);
        expect(collection.compareVariables.calls.count()).toBeLessThan(2048);
        expect(changeSpy.calls.count()).toEqual(1);
      });

      it("replaces an alias dependency even when both declarations have the same color", function () {
        collection.addMany([
          createVar("first", "#f00", [0, 10], FOO_PATH, 1),
          createVar("second", "#f00", [12, 22], FOO_PATH, 2),
          createVar("alias", "first", [24, 34], FOO_PATH, 3),
        ]);
        collection.add(createVar("alias", "second", [24, 34], FOO_PATH, 3));

        expect(collection.dependencyGraph.first).toBeUndefined();
        expect(collection.dependencyGraph.second).toEqual(["alias"]);
        expect(collection.getVariableByName("alias").color.variables).toEqual(["second"]);
        collection.add(createVar("first", "#00f", [0, 10], FOO_PATH, 1));
        expect(collection.getVariableByName("alias").color).toBeColor("#f00");
        collection.add(createVar("second", "#0f0", [12, 22], FOO_PATH, 2));
        expect(collection.getVariableByName("alias").color).toBeColor("#0f0");
      });

      it("retains a shared dependency while another declaration still references it", function () {
        const first = createVar("alias", "base", [12, 22], FOO_PATH, 2);
        const second = createVar("alias", "base", [24, 34], "/path/to/other.styl", 3);
        collection.addMany([createVar("base", "#f00", [0, 10], FOO_PATH, 1), first, second]);

        collection.remove(first);
        expect(collection.dependencyGraph.base).toEqual(["alias"]);
        collection.add(createVar("base", "#00f", [0, 10], FOO_PATH, 1));
        expect(second.color).toBeColor("#00f");
        collection.remove(second);
        expect(collection.dependencyGraph.base).toBeUndefined();
      });

      it("yields during a project update and publishes the completed batch once", async function () {
        const timers = [];
        spyOn(window, "setTimeout").and.callFake((callback) => timers.push(callback));
        spyOn(Date, "now").and.returnValues(0, 0, 9);
        const pending = collection.updateCollectionAsync([
          createVar("base", "#abcdef", [0, 10], FOO_PATH, 1),
          createVar("alias", "base", [12, 22], FOO_PATH, 2),
          createVar("literal", "2px", [24, 34], FOO_PATH, 3),
        ]);

        expect(timers.length).toEqual(1);
        expect(changeSpy).not.toHaveBeenCalled();
        Date.now.and.returnValue(9);
        timers.shift()();
        await pending;

        expect(collection.length).toEqual(3);
        expect(collection.getVariableByName("alias").color).toBeColor("#abcdef");
        expect(changeSpy.calls.count()).toEqual(1);
        expect(changeSpy.calls.mostRecent().args[0].created.length).toEqual(3);
      });

      it("cancels a yielded project update without publishing a partial batch", async function () {
        const timers = [];
        let abort = false;
        spyOn(window, "setTimeout").and.callFake((callback) => timers.push(callback));
        spyOn(Date, "now").and.returnValues(0, 0, 9);
        const pending = collection.updateCollectionAsync(
          [
            createVar("base", "#abcdef", [0, 10], FOO_PATH, 1),
            createVar("alias", "base", [12, 22], FOO_PATH, 2),
          ],
          undefined,
          { shouldAbort: () => abort },
        );

        expect(timers.length).toEqual(1);
        abort = true;
        timers.shift()();

        expect(await pending).toBeNull();
        expect(changeSpy).not.toHaveBeenCalled();
      });

      it("mirrors worker colors and references without reevaluating or replacing variables", async function () {
        collection.addMany([
          createVar("base", "#f00", [0, 10], FOO_PATH, 1),
          createVar("alias", "base", [12, 22], FOO_PATH, 2),
        ]);
        const base = collection.getVariableByName("base");
        const alias = collection.getVariableByName("alias");
        const aliasId = alias.id;
        spyOn(collection, "evaluateVariableColor").and.callThrough();
        const content = [
          {
            ...createVar("base", "#00f", [0, 10], FOO_PATH, 1),
            isColor: true,
            color: [0, 0, 255, 1],
            variables: [],
          },
          {
            ...createVar("alias", "base", [12, 22], FOO_PATH, 2),
            isColor: true,
            color: [0, 0, 255, 1],
            variables: ["base"],
          },
        ];

        await collection.updateCollectionAsync(content, [FOO_PATH], { preEvaluated: true });

        expect(collection.getVariableByName("base")).toBe(base);
        expect(collection.getVariableByName("alias")).toBe(alias);
        expect(alias.id).toEqual(aliasId);
        expect(alias.color).toBeColor("#00f");
        expect(alias.color.variables).toEqual(["base"]);
        expect(collection.dependencyGraph.base).toEqual(["alias"]);
        expect(collection.evaluateVariableColor).not.toHaveBeenCalled();
        expect(content[0].color).toEqual([0, 0, 255, 1]);
        expect(content[1].variables).toEqual(["base"]);

        await collection.updateCollectionAsync(
          [createVar("alias", "base", [12, 22], FOO_PATH, 2)],
          [FOO_PATH],
          { preEvaluated: true },
        );
        expect(collection.getVariableByName("base")).toBeUndefined();
        expect(collection.getVariableByName("alias")).toBe(alias);
        expect(alias.isColor).toBeFalsy();
        expect(collection.getColorVariables()).toEqual([]);
        expect(collection.evaluateVariableColor).not.toHaveBeenCalled();
      });
    });

    //#    ########  ########  ######  ########  #######  ########  ########
    //#    ##     ## ##       ##    ##    ##    ##     ## ##     ## ##
    //#    ##     ## ##       ##          ##    ##     ## ##     ## ##
    //#    ########  ######    ######     ##    ##     ## ########  ######
    //#    ##   ##   ##             ##    ##    ##     ## ##   ##   ##
    //#    ##    ##  ##       ##    ##    ##    ##     ## ##    ##  ##
    //#    ##     ## ########  ######     ##     #######  ##     ## ########

    describe("::initialize", function () {
      it("restores dependency references without scanning the growing name array", function () {
        spyOn(collection.variableNames, "includes").and.callThrough();
        for (let index = 0; index < 2048; index++) {
          collection.restoreVariable(createVar(`name${index}`, "literal", [0, 1], FOO_PATH, index));
        }
        collection.restoreVariable(createVar("alias", "name0", [0, 1], FOO_PATH, 2048));

        expect(collection.dependencyGraph.name0).toEqual(["alias"]);
        expect(collection.variableNames.includes).not.toHaveBeenCalled();
      });

      it("keeps a dependency name until its last definition has been removed", function () {
        const first = createVar("shared", "1", [0, 1], FOO_PATH, 1);
        const second = createVar("shared", "2", [2, 3], FOO_PATH, 2);
        collection.addMany([first, second]);

        collection.remove(first);
        expect(collection.getVariableDependencies({ value: "shared" })).toEqual(["shared"]);
        collection.remove(second);
        expect(collection.getVariableDependencies({ value: "shared" })).toEqual([]);

        collection.restoreVariable(createVar("shared", "1", [0, 1], FOO_PATH, 1));
        collection.reset();
        expect(collection.getVariableDependencies({ value: "shared" })).toEqual([]);
      });

      it("yields while restoring a collection that exceeds one frame", function () {
        const frames = [];
        const content = [
          createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
          createVar("bar", "foo", [12, 20], "/path/to/foo.styl", 2),
          createVar("baz", "0.5", [22, 30], "/path/to/foo.styl", 3),
        ];

        spyOn(window, "requestAnimationFrame").and.callFake((callback) => {
          frames.push(callback);
        });
        spyOn(Date, "now").and.returnValues(0, 0, 17);

        collection.initialized = false;
        collection.initialize(content);

        expect(collection.length).toEqual(1);
        expect(collection.initialized).toBeFalsy();
        expect(content.length).toEqual(3);
        expect(frames.length).toEqual(1);

        Date.now.and.returnValue(17);
        frames.shift()();

        expect(collection.length).toEqual(3);
        expect(collection.initialized).toBeTruthy();
      });
    });

    describe("::evaluateVariables", function () {
      it("yields while reevaluating stable variables that exceed one frame", function () {
        const frames = [];
        collection.addMany([
          createVar("foo", "#fff", [0, 10], "/path/to/foo.styl", 1),
          createVar("bar", "#000", [12, 22], "/path/to/foo.styl", 2),
          createVar("baz", "#abc", [24, 34], "/path/to/foo.styl", 3),
        ]);
        spyOn(window, "requestAnimationFrame").and.callFake((callback) => {
          frames.push(callback);
        });
        spyOn(Date, "now").and.returnValues(0, 0, 17);
        spyOn(collection, "evaluateVariableColor");
        const complete = jasmine.createSpy("complete");

        collection.evaluateVariables(collection.getVariables(), complete);

        expect(collection.evaluateVariableColor.calls.count()).toEqual(1);
        expect(frames.length).toEqual(1);
        expect(complete).not.toHaveBeenCalled();

        Date.now.and.returnValue(17);
        frames.shift()();

        expect(collection.evaluateVariableColor.calls.count()).toEqual(3);
        expect(complete).toHaveBeenCalledWith([]);
      });
    });

    describe("::dispose", function () {
      it("stops restoration after its collection has been disposed", function () {
        const frames = [];
        spyOn(window, "requestAnimationFrame").and.callFake((callback) => frames.push(callback));
        spyOn(Date, "now").and.returnValues(0, 0, 17);
        collection.initialized = false;
        const initialized = jasmine.createSpy("initialized");
        collection.onceInitialized(initialized);
        collection.initialize([
          createVar("first", "1px", [0, 10], FOO_PATH, 1),
          createVar("second", "2px", [12, 22], FOO_PATH, 2),
        ]);
        expect(collection.length).toEqual(1);
        expect(frames.length).toEqual(1);

        collection.dispose();
        frames.shift()();

        expect(collection.length).toEqual(1);
        expect(initialized).not.toHaveBeenCalled();
      });

      it("stops pending reevaluation without registering colors or invoking completion", function () {
        collection.addMany([
          createVar("first", "1px", [0, 10], FOO_PATH, 1),
          createVar("second", "2px", [12, 22], FOO_PATH, 2),
        ]);
        const frames = [];
        spyOn(window, "requestAnimationFrame").and.callFake((callback) => frames.push(callback));
        spyOn(Date, "now").and.returnValues(0, 0, 17);
        spyOn(collection, "evaluateVariableColor").and.callFake((variable) => {
          variable.isColor = true;
        });
        spyOn(collection, "updateColorVariablesExpression").and.callThrough();
        const complete = jasmine.createSpy("complete");
        collection.evaluateVariables(collection.getVariables(), complete);
        expect(collection.evaluateVariableColor.calls.count()).toEqual(1);
        expect(frames.length).toEqual(1);

        collection.dispose();
        frames.shift()();

        expect(collection.evaluateVariableColor.calls.count()).toEqual(1);
        expect(collection.updateColorVariablesExpression).not.toHaveBeenCalled();
        expect(complete).not.toHaveBeenCalled();
      });

      it("stops a pending worker-state update without emitting a change", async function () {
        const timers = [];
        spyOn(window, "setTimeout").and.callFake((callback) => timers.push(callback));
        spyOn(Date, "now").and.returnValues(0, 0, 9);
        const pending = collection.updateCollectionAsync([
          createVar("first", "1px", [0, 10], FOO_PATH, 1),
          createVar("second", "2px", [12, 22], FOO_PATH, 2),
        ]);
        expect(timers.length).toEqual(1);

        collection.dispose();
        timers.shift()();

        expect(await pending).toBeNull();
        expect(changeSpy).not.toHaveBeenCalled();
      });
    });

    describe("::serialize", function () {
      describe("with an empty collection", () =>
        it("returns an empty serialized collection", () =>
          expect(collection.serialize()).toEqual({
            deserializer: "VariablesCollection",
            content: [],
          })));

      describe("with a collection that contains a non-color variable", function () {
        beforeEach(() => collection.add(createVar("bar", "0.5", [12, 20], "/path/to/foo.styl", 2)));

        return it("returns the serialized collection", () =>
          expect(collection.serialize()).toEqual({
            deserializer: "VariablesCollection",
            content: [
              {
                name: "bar",
                value: "0.5",
                range: [12, 20],
                path: "/path/to/foo.styl",
                line: 2,
              },
            ],
          }));
      });

      describe("with a collection that contains a color variable", function () {
        beforeEach(() =>
          collection.add(createVar("bar", "#abc", [12, 20], "/path/to/foo.styl", 2)),
        );

        return it("returns the serialized collection", () =>
          expect(collection.serialize()).toEqual({
            deserializer: "VariablesCollection",
            content: [
              {
                name: "bar",
                value: "#abc",
                range: [12, 20],
                path: "/path/to/foo.styl",
                line: 2,
                isColor: true,
                color: [170, 187, 204, 1],
                variables: [],
              },
            ],
          }));
      });

      return describe("with a collection that contains color variables with references", function () {
        beforeEach(function () {
          collection.add(createVar("foo", "#abc", [0, 10], "/path/to/foo.styl", 1));
          return collection.add(createVar("bar", "foo", [12, 20], "/path/to/foo.styl", 2));
        });

        return it("returns the serialized collection", () =>
          expect(collection.serialize()).toEqual({
            deserializer: "VariablesCollection",
            content: [
              {
                name: "foo",
                value: "#abc",
                range: [0, 10],
                path: "/path/to/foo.styl",
                line: 1,
                isColor: true,
                color: [170, 187, 204, 1],
                variables: [],
              },
              {
                name: "bar",
                value: "foo",
                range: [12, 20],
                path: "/path/to/foo.styl",
                line: 2,
                isColor: true,
                color: [170, 187, 204, 1],
                variables: ["foo"],
              },
            ],
          }));
      });
    });

    return describe(".deserialize", function () {
      beforeEach(
        () =>
          (collection = VariablesCollection.deserialize({
            deserializer: "VariablesCollection",
            content: [
              {
                name: "foo",
                value: "#abc",
                range: [0, 10],
                path: "/path/to/foo.styl",
                line: 1,
                isColor: true,
                color: [170, 187, 204, 1],
                variables: [],
              },
              {
                name: "bar",
                value: "foo",
                range: [12, 20],
                path: "/path/to/foo.styl",
                line: 2,
                isColor: true,
                color: [170, 187, 204, 1],
                variables: ["foo"],
              },
              {
                name: "baz",
                value: "0.5",
                range: [22, 30],
                path: "/path/to/foo.styl",
                line: 3,
              },
            ],
          })),
      );

      it("restores the variables", function () {
        expect(collection.length).toEqual(3);
        return expect(collection.getColorVariables().length).toEqual(2);
      });

      it("leaves serialized variables reusable by another restoration", function () {
        const state = {
          content: [
            {
              name: "accent",
              value: "#abc",
              range: [0, 10],
              path: "/path/to/foo.styl",
              line: 1,
              isColor: true,
              color: [170, 187, 204, 1],
              variables: [],
            },
          ],
        };

        const first = VariablesCollection.deserialize(state);
        const second = VariablesCollection.deserialize(state);

        expect(first.getColorVariables()[0].color).toBeColor(170, 187, 204, 1);
        expect(second.getColorVariables()[0].color).toBeColor(170, 187, 204, 1);
        expect(state.content[0].color).toEqual([170, 187, 204, 1]);
        expect(state.content[0].variables).toEqual([]);
      });

      return it("restores all the denormalized data in the collection", function () {
        expect(collection.variableNames).toEqual(["foo", "bar", "baz"]);
        expect(Object.keys(collection.variablesByPath)).toEqual([FOO_PATH]);
        expect(collection.variablesByPath[FOO_PATH].length).toEqual(3);
        return expect(collection.dependencyGraph).toEqual({
          foo: ["bar"],
        });
      });
    });
  });
});
