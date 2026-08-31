const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Color = require("../lib/color");
const Palette = require("../lib/palette");
const { THEME_VARIABLES } = require("../lib/uris");
const { change, click } = require("./helpers/events");

describe("PaletteElement", function () {
  let [nextID, palette, paletteElement, workspaceElement, colors, project] = Array.from([0]);

  // The counts in the grouped-palette specs were a census of upstream's fixture
  // tree and went stale as soon as a fixture was added or removed. What the
  // element actually owes is one group per file that has color variables, and,
  // with merging on, one row per distinct color in each of those groups -- plus
  // the group headers, which are list items too. Both are derived from the
  // project rather than restated as a number.
  const colorsByFile = function () {
    const byFile = new Map();
    for (const variable of project.getColorVariables()) {
      if (!byFile.has(variable.path)) byFile.set(variable.path, new Set());
      byFile.get(variable.path).add(variable.color.toCSS());
    }
    return byFile;
  };

  const createVar = (name, color, path, line, isAlternate = false) => ({
    name,
    color,
    path,
    line,
    id: nextID++,
    isAlternate,
  });

  beforeEach(async function () {
    registerViewProvider();
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.sourceNames", ["*.styl", "*.less"]);

    await waitsForPromise(() =>
      lumine.packages.activatePackage("color-inline").then(function (pkg) {
        colors = pkg.mainModule;
        return (project = colors.getProject());
      }),
    );

    await waitsForPromise(() => project.initialize());
  });

  afterEach(async () => project.destroy());

  describe("as a view provider", function () {
    beforeEach(async function () {
      registerViewProvider();
      palette = new Palette([
        createVar("red", new Color("#ff0000"), "file.styl", 0),
        createVar("green", new Color("#00ff00"), "file.styl", 1),
        createVar("blue", new Color("#0000ff"), "file.styl", 2),
        createVar("redCopy", new Color("#ff0000"), "file.styl", 3),
        createVar("red_copy", new Color("#ff0000"), "file.styl", 3, true),
        createVar("red", new Color("#ff0000"), THEME_VARIABLES, 0),
      ]);

      paletteElement = lumine.views.getView(palette);
      return jasmine.attachToDOM(paletteElement);
    });

    it("is associated with the Palette model", async () => expect(paletteElement).toBeDefined());

    it("does not render alernate form of a variable", async () =>
      expect(paletteElement.querySelectorAll("li").length).toEqual(5));

    return it("does not render the file link when the variable comes from a theme", async () =>
      expect(
        paletteElement.querySelectorAll("li")[4].querySelector(" [data-variable-id]"),
      ).not.toExist());
  });

  describe("when color-inline:show-palette command is triggered", function () {
    beforeEach(async function () {
      registerViewProvider();
      lumine.commands.dispatch(workspaceElement, "color-inline:show-palette");

      await waitsFor(
        () => (paletteElement = workspaceElement.querySelector("color-inline-palette")),
      );

      await runs(async function () {
        palette = paletteElement.getModel();
        return jasmine.attachToDOM(paletteElement);
      });
    });

    it("opens a palette element", async () => expect(paletteElement).toBeDefined());

    it("creates as many list item as there is colors in the project", async function () {
      expect(paletteElement.querySelectorAll("li").length).not.toEqual(0);
      return expect(paletteElement.querySelectorAll("li").length).toEqual(
        palette.variables.filter((v) => !v.isAlternate).length,
      );
    });

    it("binds colors with project variables", async function () {
      const projectVariables = project.getColorVariables();

      const li = paletteElement.querySelector("li");
      return expect(li.querySelector(".path").textContent).toEqual(
        lumine.project.relativize(projectVariables[0].path),
      );
    });

    describe("clicking on a result path", () =>
      it("shows the variable in its file", async function () {
        spyOn(project, "showVariableInFile");

        const pathElement = paletteElement.querySelector("[data-variable-id]");

        click(pathElement);

        await waitsFor(() => project.showVariableInFile.calls.count() > 0);
      }));

    describe("when the sortPaletteColors settings is set to color", function () {
      beforeEach(async () => lumine.config.set("color-inline.sortPaletteColors", "by color"));

      return it("reorders the colors", async function () {
        const sortedColors = project
          .getPalette()
          .sortedByColor()
          .filter((v) => !v.isAlternate);
        const lis = paletteElement.querySelectorAll("li");

        return (() => {
          const result = [];
          for (let i = 0; i < sortedColors.length; i++) {
            var { name } = sortedColors[i];
            result.push(expect(lis[i].querySelector(".name").textContent).toEqual(name));
          }
          return result;
        })();
      });
    });

    describe("when the sortPaletteColors settings is set to name", function () {
      beforeEach(async () => lumine.config.set("color-inline.sortPaletteColors", "by name"));

      return it("reorders the colors", async function () {
        const sortedColors = project
          .getPalette()
          .sortedByName()
          .filter((v) => !v.isAlternate);
        const lis = paletteElement.querySelectorAll("li");

        return (() => {
          const result = [];
          for (let i = 0; i < sortedColors.length; i++) {
            var { name } = sortedColors[i];
            result.push(expect(lis[i].querySelector(".name").textContent).toEqual(name));
          }
          return result;
        })();
      });
    });

    describe("when the groupPaletteColors setting is set to file", function () {
      beforeEach(async () => lumine.config.set("color-inline.groupPaletteColors", "by file"));

      it("renders the list with sublists for each files", async function () {
        const files = colorsByFile().size;
        expect(files).toBeGreaterThan(1);

        const ols = paletteElement.querySelectorAll("ol ol");
        return expect(ols.length).toEqual(files);
      });

      it("adds a header with the file path for each sublist", async function () {
        const ols = paletteElement.querySelectorAll(".color-inline-color-group-header");
        return expect(ols.length).toEqual(colorsByFile().size);
      });

      it("keeps group headers sticky without a scroll handler", async function () {
        const header = paletteElement.querySelector(".color-inline-color-group-header");
        const style = getComputedStyle(header);

        expect(style.position).toBe("sticky");
        expect(style.top).toBe("0px");
        expect(paletteElement.stickyTitle).not.toBeDefined();
      });

      describe("and the sortPaletteColors is set to name", function () {
        beforeEach(async () => lumine.config.set("color-inline.sortPaletteColors", "by name"));

        return it("sorts the nested list items", async function () {
          const palettes = paletteElement.getFilesPalettes();
          const ols = paletteElement.querySelectorAll(".color-inline-color-group");
          let n = 0;

          return (() => {
            const result = [];
            for (var file in palettes) {
              palette = palettes[file];
              var ol = ols[n++];
              var lis = ol.querySelectorAll("li");
              var sortedColors = palette.sortedByName().filter((v) => !v.isAlternate);

              result.push(
                (() => {
                  const result1 = [];
                  for (let i = 0; i < sortedColors.length; i++) {
                    var { name } = sortedColors[i];
                    result1.push(expect(lis[i].querySelector(".name").textContent).toEqual(name));
                  }
                  return result1;
                })(),
              );
            }
            return result;
          })();
        });
      });

      return describe("when the mergeColorDuplicates", function () {
        beforeEach(async () => lumine.config.set("color-inline.mergeColorDuplicates", true));

        return it("groups identical colors together", async function () {
          const byFile = colorsByFile();
          const distinct = [...byFile.values()].reduce((total, set) => total + set.size, 0);
          expect(distinct).toBeLessThan(project.getColorVariables().length);

          const lis = paletteElement.querySelectorAll("li");

          return expect(lis.length).toEqual(byFile.size + distinct);
        });
      });
    });

    describe("sorting selector", function () {
      let [sortSelect] = Array.from([]);

      return describe("when changed", function () {
        beforeEach(async function () {
          registerViewProvider();
          sortSelect = paletteElement.querySelector("#sort-palette-colors");
          sortSelect.querySelector('option[value="by name"]').setAttribute("selected", "selected");

          return change(sortSelect);
        });

        return it("changes the settings value", async () =>
          expect(lumine.config.get("color-inline.sortPaletteColors")).toEqual("by name"));
      });
    });

    return describe("grouping selector", function () {
      let [groupSelect] = Array.from([]);

      return describe("when changed", function () {
        beforeEach(async function () {
          registerViewProvider();
          groupSelect = paletteElement.querySelector("#group-palette-colors");
          groupSelect.querySelector('option[value="by file"]').setAttribute("selected", "selected");

          return change(groupSelect);
        });

        return it("changes the settings value", async () =>
          expect(lumine.config.get("color-inline.groupPaletteColors")).toEqual("by file"));
      });
    });
  });

  describe("when the palette settings differs from defaults", function () {
    beforeEach(async function () {
      registerViewProvider();
      lumine.config.set("color-inline.sortPaletteColors", "by name");
      lumine.config.set("color-inline.groupPaletteColors", "by file");
      return lumine.config.set("color-inline.mergeColorDuplicates", true);
    });

    return describe("when color-inline:show-palette command is triggered", function () {
      beforeEach(async function () {
        registerViewProvider();
        lumine.commands.dispatch(workspaceElement, "color-inline:show-palette");

        await waitsFor(
          () => (paletteElement = workspaceElement.querySelector("color-inline-palette")),
        );

        await runs(() => (palette = paletteElement.getModel()));
      });

      describe("the sorting selector", () =>
        it("selects the current value", async function () {
          const sortSelect = paletteElement.querySelector("#sort-palette-colors");
          return expect(sortSelect.querySelector("option[selected]").value).toEqual("by name");
        }));

      describe("the grouping selector", () =>
        it("selects the current value", async function () {
          const groupSelect = paletteElement.querySelector("#group-palette-colors");
          return expect(groupSelect.querySelector("option[selected]").value).toEqual("by file");
        }));

      return it("checks the merge checkbox", async function () {
        const mergeCheckBox = paletteElement.querySelector("#merge-duplicates");
        return expect(mergeCheckBox.checked).toBeTruthy();
      });
    });
  });

  return describe("when the project variables are modified", function () {
    let [spy, initialColorCount] = Array.from([]);
    beforeEach(async function () {
      registerViewProvider();
      lumine.commands.dispatch(workspaceElement, "color-inline:show-palette");

      await waitsFor(
        () => (paletteElement = workspaceElement.querySelector("color-inline-palette")),
      );

      await runs(async function () {
        palette = paletteElement.getModel();
        initialColorCount = palette.getColorsCount();
        spy = jasmine.createSpy("onDidUpdateVariables");

        project.onDidUpdateVariables(spy);

        return lumine.config.set("color-inline.sourceNames", ["*.styl", "*.less", "*.sass"]);
      });

      await waitsFor(() => spy.calls.count() > 0);
    });

    return it("updates the palette", async function () {
      expect(palette.getColorsCount()).not.toEqual(initialColorCount);

      const lis = paletteElement.querySelectorAll("li");

      return expect(lis.length).not.toEqual(initialColorCount);
    });
  });
});
