const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { click } = require("./helpers/events");

describe("ColorResultsElement", function () {
  let [search, resultsElement, colors, project, completeSpy, _findSpy] = Array.from([]);

  beforeEach(async function () {
    registerViewProvider();
    lumine.config.set("colors.delayBeforeScan", 0);
    lumine.config.set("colors.sourceNames", ["**/*.styl", "**/*.less"]);
    lumine.config.set("core.ignoredNames", []);

    await waitsForPromise(() =>
      lumine.packages.activatePackage("colors").then(function (pkg) {
        colors = pkg.mainModule;
        return (project = colors.getProject());
      }),
    );

    await waitsForPromise(() => project.initialize());

    await runs(async function () {
      search = project.findAllColors();
      spyOn(search, "search").and.callThrough();
      completeSpy = jasmine.createSpy("did-complete-search");
      search.onDidCompleteSearch(completeSpy);

      resultsElement = lumine.views.getView(search);

      return jasmine.attachToDOM(resultsElement);
    });
  });

  afterEach(async () => await waitsFor(() => completeSpy.calls.count() > 0));

  it("is associated with ColorSearch model", async () => expect(resultsElement).toBeDefined());

  it("starts the search", async () => expect(search.search).toHaveBeenCalled());

  return describe("when matches are found", function () {
    beforeEach(async () => await waitsFor(() => completeSpy.calls.count() > 0));

    it("groups results by files", async function () {
      const fileResults = resultsElement.querySelectorAll(".list-nested-item");

      // The shared ignored-name semantics exclude descendants of an ignored
      // directory as well as the directory row itself.
      expect(fileResults.length).toEqual(7);

      return expect(fileResults[0].querySelectorAll("li.list-item").length).toEqual(3);
    });

    describe("when a file item is clicked", function () {
      let [fileItem] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        fileItem = resultsElement.querySelector(".list-nested-item > .list-item");
        return click(fileItem);
      });

      return it("collapses the file matches", async () =>
        expect(resultsElement.querySelector(".list-nested-item.collapsed")).toExist());
    });

    return describe("when a matches item is clicked", function () {
      let [matchItem, spy] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        spy = jasmine.createSpy("did-add-text-editor");

        lumine.workspace.onDidAddTextEditor(spy);
        matchItem = resultsElement.querySelector(".search-result.list-item");
        click(matchItem);

        await waitsFor(() => spy.calls.count() > 0);
      });

      return it("opens the file", async function () {
        expect(spy).toHaveBeenCalled();
        const { textEditor } = spy.calls.argsFor(0)[0];
        return expect(textEditor.getSelectedBufferRange()).toEqual([
          [1, 13],
          [1, 23],
        ]);
      });
    });
  });
});
