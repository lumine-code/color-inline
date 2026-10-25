const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline HSV hue circle endpoint", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let directory, previousPaths, editor, main;
  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    spyOn(lumine.clipboard, "write");
    jasmine.attachToDOM(lumine.workspace.getElement());
    previousPaths = lumine.project.getPaths();
    directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "color-hsv-circle-owned-")),
    );
    lumine.project.setPaths([directory]);
    lumine.config.set("color-inline.sourceNames", ["**/*.less"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
  });
  afterEach(async () => {
    editor?.destroy();
    if (lumine.packages.getActivePackage("color-inline"))
      await lumine.packages.deactivatePackage("color-inline");
    lumine.project.setPaths(previousPaths);
    if (directory && fs.existsSync(directory)) {
      const target = fs.realpathSync.native(directory);
      if (
        fs.realpathSync.native(path.dirname(target)) !== fs.realpathSync.native(os.tmpdir()) ||
        !path.basename(target).startsWith("color-hsv-circle-owned-")
      )
        throw Error("Unsafe HSV fixture cleanup");
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
    directory = editor = main = null;
  });

  async function convert(hue, expected) {
    const file = path.join(directory, "sample.less");
    fs.writeFileSync(file, `hsv(${hue}, 100%, 100%)`);
    editor = await lumine.workspace.open(file);
    editor.setCursorBufferPosition([0, 5]);
    const project = main.getProject();
    await project.initialize();
    const buffer = project.colorBufferForEditor(editor);
    await buffer.initialize();
    expect(buffer.getColorMarkers().length).toBe(1);
    lumine.commands.dispatch(lumine.views.getView(editor), "color-inline:convert-to-hex");
    expect(editor.getText()).toBe(expected);
    expect(fs.readFileSync(file, "utf8")).toBe(`hsv(${hue}, 100%, 100%)`);
    editor.undo();
    expect(editor.getText()).toBe(`hsv(${hue}, 100%, 100%)`);
  }

  it("converts the 360 degree endpoint to the same red as zero", async () => {
    await convert(360, "#ff0000");
  });
  it("preserves the zero-degree red control", async () => {
    await convert(0, "#ff0000");
  });
  it("preserves an interior green hue", async () => {
    await convert(120, "#00ff00");
  });
});
