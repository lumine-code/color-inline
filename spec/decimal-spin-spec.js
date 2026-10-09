const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline decimal spin values in native buffers", () => {
  let root, previousPaths, file, editor, project;

  beforeEach(() => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    root = fs.mkdtempSync(path.join(os.tmpdir(), "color-inline-spin-"));
    file = path.join(root, "colors.less");
    previousPaths = lumine.project.getPaths();
    lumine.project.setPaths([root]);
    lumine.config.set("color-inline.sourceNames", ["**/*.less"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    lumine.config.set("color-inline.ignoreVcsIgnoredPaths", false);
  });

  afterEach(async () => {
    editor?.destroy();
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
    fs.unlinkSync(path.join(target, "colors.less"));
    fs.rmdirSync(target);
    editor = project = root = null;
  });

  async function marked(expression, declarations = "") {
    fs.writeFileSync(file, `${declarations}a { color: ${expression}; }`);
    project = (await lumine.packages.activatePackage("color-inline")).mainModule.getProject();
    await project.initialize();
    editor = await lumine.workspace.open(file);
    const buffer = project.colorBufferForEditor(editor);
    await buffer.variablesAvailable();
    await buffer.update();
    return buffer.getColorMarkers().filter((marker) => marker.getBufferRange().start.row === 0);
  }

  it("marks a decimal degree literal as the complete spin expression", async () => {
    const markers = await marked("spin(#F00, 120.5deg)");
    expect(markers.map((marker) => editor.getTextInBufferRange(marker.getBufferRange()))).toEqual([
      "spin(#F00, 120.5deg)",
    ]);
    expect(markers.map((marker) => marker.color.toCSS())).toEqual(["rgb(0,255,2)"]);
  });

  it("retains the fractional angle of a real indexed Less variable", async () => {
    const markers = await marked("spin(#F00, @angle)", "@angle: 120.5; ");
    expect(markers.map((marker) => editor.getTextInBufferRange(marker.getBufferRange()))).toEqual([
      "spin(#F00, @angle)",
    ]);
    expect(markers.map((marker) => marker.color.toCSS())).toEqual(["rgb(0,255,2)"]);
  });

  it("keeps an integer degree rotation unchanged", async () => {
    const markers = await marked("spin(#F00, 120deg)");
    expect(markers.map((marker) => editor.getTextInBufferRange(marker.getBufferRange()))).toEqual([
      "spin(#F00, 120deg)",
    ]);
    expect(markers.map((marker) => marker.color.toCSS())).toEqual(["rgb(0,255,0)"]);
  });
});
