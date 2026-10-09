const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline native project root boundaries", () => {
  let root, previousPaths, project;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    root = fs.mkdtempSync(path.join(os.tmpdir(), "color-inline-boundaries-"));
    for (const directory of ["theme", "theme-old"]) fs.mkdirSync(path.join(root, directory));
    previousPaths = lumine.project.getPaths();
    lumine.project.setPaths([path.join(root, "theme"), path.join(root, "theme-old")]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    lumine.config.set("color-inline.ignoreVcsIgnoredPaths", false);
  });

  afterEach(async () => {
    if (lumine.packages.isPackageActive("color-inline"))
      await lumine.packages.deactivatePackage("color-inline");
    if (lumine.packages.isPackageLoaded("color-inline"))
      await lumine.packages.unloadPackage("color-inline");
    lumine.project.setPaths(previousPaths);
    await lumine.fileWatchClient.settlePendingTeardown();
    const temporary = fs.realpathSync(os.tmpdir());
    const target = fs.realpathSync(root);
    const relative = path.relative(temporary, target);
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    )
      throw new Error("Fixture cleanup escaped the private temporary directory.");
    for (const directory of ["theme", "theme-old"]) {
      const owned = path.join(target, directory);
      for (const entry of fs.readdirSync(owned)) fs.unlinkSync(path.join(owned, entry));
      fs.rmdirSync(owned);
    }
    fs.rmdirSync(target);
    project = root = null;
  });

  async function initialize() {
    project = (await lumine.packages.activatePackage("color-inline")).mainModule.getProject();
    await project.initialize();
  }

  it("removes a sibling root whose name begins with the retained root name", async () => {
    const retained = path.join(root, "theme", "vars.css");
    const removed = path.join(root, "theme-old", "vars.css");
    fs.writeFileSync(retained, ":root { --retained: #123; }");
    fs.writeFileSync(removed, ":root { --removed: #456; }");
    await initialize();
    expect(project.getPaths().slice().sort()).toEqual([retained, removed].sort());
    expect(project.getVariables().some((variable) => variable.path === removed)).toBeTrue();
    const update = spyOn(project, "updatePaths").and.callThrough();
    lumine.project.setPaths([path.join(root, "theme")]);
    expect(update).toHaveBeenCalled();
    await update.calls.mostRecent().returnValue;
    expect(project.getPaths()).toEqual([retained]);
    expect(project.getVariables().some((variable) => variable.path === removed)).toBeFalse();
    expect(project.getVariables().some((variable) => variable.path === retained)).toBeTrue();
  });
});
