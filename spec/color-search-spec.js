const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
require("./helpers/matchers");

describe("ColorSearch", function () {
  let [search, colors, project] = Array.from([]);

  beforeEach(async function () {
    registerViewProvider();
    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.sourceNames", ["**/*.styl", "**/*.less"]);
    lumine.config.set("color-inline.extendedSearchNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", ["project/vendor/**"]);

    await waitsForPromise(() =>
      lumine.packages.activatePackage("color-inline").then(function (pkg) {
        colors = pkg.mainModule;
        return (project = colors.getProject());
      }),
    );

    await waitsForPromise(() => project.initialize());
  });

  return describe("when created with basic options", function () {
    beforeEach(async () => (search = project.findAllColors()));

    it("dispatches a did-complete-search when finalizing its search", async function () {
      const spy = jasmine.createSpy("did-complete-search");
      search.onDidCompleteSearch(spy);
      search.search();
      await waitsFor(() => spy.calls.count() > 0);
      await runs(() => expect(spy.calls.argsFor(0)[0].length).toEqual(26));
    });

    return it("dispatches a did-find-matches event for every file", async function () {
      const completeSpy = jasmine.createSpy("did-complete-search");
      const findSpy = jasmine.createSpy("did-find-matches");
      search.onDidCompleteSearch(completeSpy);
      search.onDidFindMatches(findSpy);
      search.search();
      await waitsFor(() => completeSpy.calls.count() > 0);
      await runs(async function () {
        expect(findSpy.calls.count()).toEqual(7);
        return expect(findSpy.calls.argsFor(0)[0].matches.length).toEqual(3);
      });
    });
  });
});
