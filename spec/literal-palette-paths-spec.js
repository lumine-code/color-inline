const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline literal palette paths", () => {
  let root, previousPaths, main, project, palette;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "palette-paths-")));
    fs.writeFileSync(path.join(root, "colors&copy;.css"), "--entity: #f00;\n");
    fs.writeFileSync(path.join(root, "ordinary.css"), "--ordinary: #00f;\n");
    previousPaths = lumine.project.getPaths();
    lumine.project.setPaths([root]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    lumine.config.set("color-inline.groupPaletteColors", "none");
    lumine.config.set("color-inline.mergeColorDuplicates", false);
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    expect(
      project
        .getColorVariables()
        .map(({ name }) => name)
        .sort(),
    ).toEqual(["var(--entity)", "var(--ordinary)"]);
    const model = await main.showPalette();
    palette = lumine.views.getView(model);
    expect(palette.getModel().getColorsCount()).toBe(2);
  });

  afterEach(async () => {
    for (const editor of lumine.workspace.getTextEditors()) {
      if (editor.getPath()?.startsWith(root + path.sep)) editor.destroy();
    }
    for (const item of lumine.workspace.getPaneItems()) {
      if (item.getURI?.() === "color-inline://palette")
        await lumine.workspace.paneForItem(item).destroyItem(item);
    }
    if (lumine.packages.isPackageActive("color-inline"))
      await lumine.packages.deactivatePackage("color-inline");
    if (lumine.packages.isPackageLoaded("color-inline"))
      await lumine.packages.unloadPackage("color-inline");
    lumine.project.setPaths(previousPaths);
    await lumine.fileWatchClient.settlePendingTeardown();
    if (root) {
      const temporary = fs.realpathSync.native(os.tmpdir());
      const target = fs.realpathSync.native(root);
      const relative = path.relative(temporary, target);
      if (
        !relative ||
        path.isAbsolute(relative) ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`)
      )
        throw new Error("Palette fixture cleanup escaped its private temporary directory.");
      fs.unlinkSync(path.join(target, "colors&copy;.css"));
      fs.unlinkSync(path.join(target, "ordinary.css"));
      fs.rmdirSync(target);
    }
    main = project = palette = root = null;
  });

  const row = (name) =>
    [...palette.querySelectorAll(".color-inline-color-item")].find(
      (element) => element.querySelector(".name")?.textContent === name,
    );

  it("renders an HTML-looking filename exactly as a literal path", () => {
    const occurrence = row("var(--entity)");
    expect(occurrence).toBeDefined();
    expect(occurrence.querySelector(".path").textContent).toBe("colors&copy;.css");
  });

  it("keeps ordinary paths and native variable navigation", async () => {
    const occurrence = row("var(--ordinary)");
    expect(occurrence.querySelector(".path").textContent).toBe("ordinary.css");
    const variable = project.getColorVariables().find(({ name }) => name === "var(--ordinary)");
    await project.showVariableInFile(variable);
    const active = lumine.workspace.getActiveTextEditor();
    expect(active.getPath()).toBe(path.join(root, "ordinary.css"));
    expect(active.getText()).toBe("--ordinary: #00f;\n");
    active.destroy();
  });
});
