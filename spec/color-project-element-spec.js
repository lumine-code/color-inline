const { registerViewProvider } = require("./helpers/view-provider");
const { _runs, _waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { change } = require("./helpers/events");

describe("ColorProjectElement", function () {
  let [colors, project, projectElement] = Array.from([]);

  beforeEach(async function () {
    registerViewProvider();
    const jasmineContent = document.body.querySelector("#jasmine-content");

    await lumine.packages.activatePackage("language-regex");
    await waitsForPromise(() =>
      lumine.packages.activatePackage("color-inline").then(function (pkg) {
        colors = pkg.mainModule;
        project = colors.getProject();
        projectElement = lumine.views.getView(project);
        return jasmineContent.appendChild(projectElement);
      }),
    );
  });

  it("is bound to the ColorProject model", async () => expect(projectElement).toExist());

  it("uses the shared Tree-sitter regex grammar for ignored scopes", () => {
    const grammar = projectElement.ignoredScopes.getModel().getGrammar();
    expect(grammar.scopeName).toBe("source.regexp");
    expect(grammar.constructor.name).toBe("TreeSitterGrammar");
  });

  describe("typing in the sourceNames input", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setSourceNames");

      projectElement.sourceNames.getModel().setText("foo, bar");
      projectElement.sourceNames.getModel().getBuffer().emitter.emit("did-stop-changing");

      return expect(project.setSourceNames).toHaveBeenCalledWith(["foo", "bar"]);
    }));

  describe("typing in the supportedFiletypes input", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setSupportedFiletypes");

      projectElement.supportedFiletypes.getModel().setText("foo, bar");
      projectElement.supportedFiletypes.getModel().getBuffer().emitter.emit("did-stop-changing");

      return expect(project.setSupportedFiletypes).toHaveBeenCalledWith(["foo", "bar"]);
    }));

  describe("typing in the searchNames input", () =>
    it("update the search names in the project", async function () {
      spyOn(project, "setSearchNames");

      projectElement.searchNames.getModel().setText("foo, bar");
      projectElement.searchNames.getModel().getBuffer().emitter.emit("did-stop-changing");

      return expect(project.setSearchNames).toHaveBeenCalledWith(["foo", "bar"]);
    }));

  describe("typing in the ignoredNames input", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setIgnoredNames");

      projectElement.ignoredNames.getModel().setText("foo, bar");
      projectElement.ignoredNames.getModel().getBuffer().emitter.emit("did-stop-changing");

      return expect(project.setIgnoredNames).toHaveBeenCalledWith(["foo", "bar"]);
    }));

  describe("typing in the ignoredScopes input", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setIgnoredScopes");

      projectElement.ignoredScopes.getModel().setText("foo, bar");
      projectElement.ignoredScopes.getModel().getBuffer().emitter.emit("did-stop-changing");

      return expect(project.setIgnoredScopes).toHaveBeenCalledWith(["foo", "bar"]);
    }));

  describe("changing the sass implementation", () =>
    it("update the setting in the project", async function () {
      spyOn(project, "setSassShadeAndTintImplementation");

      projectElement.sassShadeAndTintImplementation.selectedIndex = 1;
      change(projectElement.sassShadeAndTintImplementation);

      return expect(project.setSassShadeAndTintImplementation).toHaveBeenCalledWith("compass");
    }));

  describe("toggling on the includeThemes checkbox", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setIncludeThemes");

      projectElement.includeThemes.checked = true;
      change(projectElement.includeThemes);

      expect(project.setIncludeThemes).toHaveBeenCalledWith(true);

      projectElement.includeThemes.checked = false;
      change(projectElement.includeThemes);

      return expect(project.setIncludeThemes).toHaveBeenCalledWith(false);
    }));

  describe("toggling on the ignoreGlobalSourceNames checkbox", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setIgnoreGlobalSourceNames");

      projectElement.ignoreGlobalSourceNames.checked = true;
      change(projectElement.ignoreGlobalSourceNames);

      expect(project.setIgnoreGlobalSourceNames).toHaveBeenCalledWith(true);

      projectElement.ignoreGlobalSourceNames.checked = false;
      change(projectElement.ignoreGlobalSourceNames);

      return expect(project.setIgnoreGlobalSourceNames).toHaveBeenCalledWith(false);
    }));

  describe("toggling on the ignoreGlobalSupportedFiletypes checkbox", () =>
    it("update the source names in the project", async function () {
      spyOn(project, "setIgnoreGlobalSupportedFiletypes");

      projectElement.ignoreGlobalSupportedFiletypes.checked = true;
      change(projectElement.ignoreGlobalSupportedFiletypes);

      expect(project.setIgnoreGlobalSupportedFiletypes).toHaveBeenCalledWith(true);

      projectElement.ignoreGlobalSupportedFiletypes.checked = false;
      change(projectElement.ignoreGlobalSupportedFiletypes);

      return expect(project.setIgnoreGlobalSupportedFiletypes).toHaveBeenCalledWith(false);
    }));

  describe("toggling on the ignoreGlobalIgnoredNames checkbox", () =>
    it("update the ignored names in the project", async function () {
      spyOn(project, "setIgnoreGlobalIgnoredNames");

      projectElement.ignoreGlobalIgnoredNames.checked = true;
      change(projectElement.ignoreGlobalIgnoredNames);

      expect(project.setIgnoreGlobalIgnoredNames).toHaveBeenCalledWith(true);

      projectElement.ignoreGlobalIgnoredNames.checked = false;
      change(projectElement.ignoreGlobalIgnoredNames);

      return expect(project.setIgnoreGlobalIgnoredNames).toHaveBeenCalledWith(false);
    }));

  describe("toggling on the ignoreGlobalIgnoredScopes checkbox", () =>
    it("update the ignored scopes in the project", async function () {
      spyOn(project, "setIgnoreGlobalIgnoredScopes");

      projectElement.ignoreGlobalIgnoredScopes.checked = true;
      change(projectElement.ignoreGlobalIgnoredScopes);

      expect(project.setIgnoreGlobalIgnoredScopes).toHaveBeenCalledWith(true);

      projectElement.ignoreGlobalIgnoredScopes.checked = false;
      change(projectElement.ignoreGlobalIgnoredScopes);

      return expect(project.setIgnoreGlobalIgnoredScopes).toHaveBeenCalledWith(false);
    }));

  return describe("toggling on the ignoreGlobalSearchNames checkbox", () =>
    it("update the search names in the project", async function () {
      spyOn(project, "setIgnoreGlobalSearchNames");

      projectElement.ignoreGlobalSearchNames.checked = true;
      change(projectElement.ignoreGlobalSearchNames);

      expect(project.setIgnoreGlobalSearchNames).toHaveBeenCalledWith(true);

      projectElement.ignoreGlobalSearchNames.checked = false;
      change(projectElement.ignoreGlobalSearchNames);

      return expect(project.setIgnoreGlobalSearchNames).toHaveBeenCalledWith(false);
    }));
});
