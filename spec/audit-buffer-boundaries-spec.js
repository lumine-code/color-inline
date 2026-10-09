const fs = require("node:fs");
const path = require("node:path");
const timers = require("node:timers/promises");

describe("Color Inline actual buffer input boundaries", () => {
  let main, project, root, editors, buffers, previousPaths;
  beforeEach(async () => {
    previousPaths = lumine.project.getPaths();
    root = fs.mkdtempSync(path.join(lumine.getConfigDirPath(), "owned-color-buffers-"));
    for (const name of ["a", "b"]) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, "a", "vars.css"), ":root { --audit-color: #ff0000; }");
    fs.writeFileSync(path.join(root, "b", "vars.css"), ":root { --audit-color: #0000ff; }");
    lumine.project.setPaths([path.join(root, "a"), path.join(root, "b")]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    editors = [];
    buffers = [];
  });
  afterEach(async () => {
    buffers.forEach((buffer) => buffer.destroy());
    editors.forEach((editor) => editor.destroy());
    await lumine.packages.deactivatePackage("color-inline");
    lumine.project.setPaths(previousPaths);
    const relative = path.relative(lumine.getConfigDirPath(), root);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      !path.basename(root).startsWith("owned-color-buffers-")
    )
      throw Error("Unexpected fixture cleanup path");
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 30 });
  });

  function buildEditor(directory, text) {
    const file = path.join(root, directory, "document.css");
    fs.writeFileSync(file, text);
    const editor = lumine.workspace.buildTextEditor();
    editor.getBuffer().setPath(file);
    editor.setText(text);
    editors.push(editor);
    return editor;
  }

  it("handles Core getText failure without an unhandled rejection and can rescan later", async () => {
    const editor = buildEditor("a", "#123");
    const getText = spyOn(editor, "getText").and.throwError(
      new RangeError("Owned getText failure"),
    );
    const warning = spyOn(lumine.notifications, "addWarning").and.callThrough();
    const ColorBuffer = require("../lib/color-buffer");
    let buffer, rejection;
    await jasmine.spyOnGlobalErrorsAsync(async (errors) => {
      buffer = new ColorBuffer({ editor, project });
      buffers.push(buffer);
      try {
        await buffer.initialize();
      } catch (error) {
        rejection = error;
      }
      await timers.setImmediate();
      expect(rejection).toBeUndefined();
      expect(errors).not.toHaveBeenCalled();
    });
    expect(warning).toHaveBeenCalled();
    expect(buffer.getMarkerLayer().getMarkerCount()).toBe(0);
    getText.and.callThrough();
    await buffer.update();
    expect(buffer.getColorMarkers().map((marker) => marker.color.rgba)).toEqual([[17, 34, 51, 1]]);
  });

  it("marks same-name project variables using each real editor's own native root", async () => {
    const ColorBuffer = require("../lib/color-buffer");
    expect(
      project.getVariables().filter((variable) => variable.name === "var(--audit-color)").length,
    ).toBe(2);
    for (const [directory, expected] of [
      ["a", [255, 0, 0, 1]],
      ["b", [0, 0, 255, 1]],
    ]) {
      const editor = buildEditor(directory, "var(--audit-color)");
      const buffer = new ColorBuffer({ editor, project });
      buffers.push(buffer);
      await buffer.variablesAvailable();
      expect(buffer.isVariablesSource()).toBeTrue();
      expect(buffer.getColorMarkers().map((marker) => marker.color.rgba)).toEqual([expected]);
    }
  });

  it("refreshes indexed sources when Core removes a project root without a manual reload", async () => {
    expect(
      project.getVariables().filter((variable) => variable.name === "var(--audit-color)").length,
    ).toBe(2);
    lumine.project.setPaths([path.join(root, "a")]);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (
        project.getVariables().filter((variable) => variable.name === "var(--audit-color)")
          .length === 1
      )
        break;
      await timers.setTimeout(20);
    }
    expect(
      project
        .getVariables()
        .filter((variable) => variable.name === "var(--audit-color)")
        .map((variable) => variable.path),
    ).toEqual([path.join(root, "a", "vars.css")]);
    expect(project.getPaths()).toEqual([path.join(root, "a", "vars.css")]);
  });

  it("does not reintroduce a removed real root when older path discovery completes last", async () => {
    const requests = [];
    spyOn(require("../lib/paths-loader"), "loadPaths").and.callFake(
      () => new Promise((resolve) => requests.push(resolve)),
    );
    const update = spyOn(project, "updatePaths").and.callThrough();
    const first = project.updatePaths();
    lumine.project.setPaths([path.join(root, "a")]);
    expect(requests.length).toBe(2);
    const second = update.calls.mostRecent().returnValue;
    requests[1]({ dirtied: [], removed: [path.join(root, "b", "vars.css")] });
    await second;
    requests[0]({ dirtied: [path.join(root, "b", "vars.css")], removed: [] });
    await first;
    expect(project.getPaths()).toEqual([path.join(root, "a", "vars.css")]);
    expect(
      project
        .getVariables()
        .filter((variable) => variable.name === "var(--audit-color)")
        .map((variable) => variable.path),
    ).toEqual([path.join(root, "a", "vars.css")]);
  });
});
