const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline native conversion targets", () => {
  let main, editor, element, project, root, previousPaths;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    spyOn(lumine.clipboard, "write");
    root = fs.mkdtempSync(path.join(os.tmpdir(), "color-inline-context-"));
    const file = path.join(root, "colors.css");
    fs.writeFileSync(file, "#f00\n#00f");
    previousPaths = lumine.project.getPaths();
    lumine.project.setPaths([root]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    const workspace = lumine.workspace.getElement();
    workspace.style.width = "800px";
    workspace.style.height = "400px";
    jasmine.attachToDOM(workspace);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    editor = await lumine.workspace.open(file);
    editor.setCursorBufferPosition([0, 1]);
    element = lumine.views.getView(editor);
    const buffer = project.colorBufferForEditor(editor);
    await buffer.variablesAvailable();
    await buffer.update();
    lumine.views.getView(buffer).attach();
    for (let frame = 0; frame < 3; frame++)
      await new Promise((resolve) => requestAnimationFrame(resolve));
    element.getComponent().updateSync();
    expect(buffer.getColorMarkers().length).toBe(2);
    expect(buffer.getColorMarkerAtBufferPosition([0, 1])?.color.toCSS()).toBe("rgb(255,0,0)");
    expect(editor.getCursorBufferPosition().toArray()).toEqual([0, 1]);
    expect(lumine.commands.findCommands({ target: element }).map((item) => item.name)).toContain(
      "color-inline:convert-to-rgb",
    );
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
    fs.unlinkSync(path.join(target, "colors.css"));
    fs.rmdirSync(target);
    main = editor = element = project = root = null;
  });

  function contextItem(command) {
    const pixel = element.pixelPositionForBufferPosition([1, 1]);
    const rectangle = element.querySelector(".lines").getBoundingClientRect();
    const event = {
      target: element.querySelector(".line") ?? element,
      clientX: rectangle.left + pixel.left + 1,
      clientY: rectangle.top + pixel.top + element.getComponent().getLineHeight() / 2,
      button: 2,
    };
    expect(main.colorMarkerForMouseEvent(event)?.color.toCSS()).toBe("rgb(0,0,255)");
    const menu = lumine.contextMenu
      .templateForEvent(event)
      .find((item) => item.label === "Color Inline");
    const item = menu?.submenu.find((item) => item.command === command);
    expect(item).toBeDefined();
    return item;
  }

  it("converts the right-clicked color after the menu has remained open", async () => {
    const item = contextItem("color-inline:convert-to-rgb");
    await new Promise((resolve) => setTimeout(resolve, 30));
    lumine.commands.dispatch(element, item.command, item.commandDetail);
    expect(editor.getText()).toBe("#f00\nrgb(0, 0, 255)");
  });

  it("copies the right-clicked color through the private clipboard boundary", async () => {
    const item = contextItem("color-inline:copy-as-hex");
    await new Promise((resolve) => setTimeout(resolve, 30));
    lumine.commands.dispatch(element, item.command, item.commandDetail);
    expect(lumine.clipboard.write).toHaveBeenCalledOnceWith("#0000ff");
    expect(editor.getText()).toBe("#f00\n#00f");
  });

  it("keeps the current cursor target for an ordinary conversion command", () => {
    lumine.commands.dispatch(element, "color-inline:convert-to-rgb");
    expect(editor.getText()).toBe("rgb(255, 0, 0)\n#00f");
  });

  it("preserves an actual read-only editor on conversion", () => {
    editor.setReadOnly(true);
    lumine.commands.dispatch(element, "color-inline:convert-to-rgb");
    expect(editor.getText()).toBe("#f00\n#00f");
  });
});
