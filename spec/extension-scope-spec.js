const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("extension-derived color scopes in real project editors", () => {
  let root, previousPaths, main, project, paths;
  const content = "body { color: #11223344; background: rgb(1, 2, 3); }\n";
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    root = fs.mkdtempSync(path.join(os.tmpdir(), "color-inline-extension-"));
    paths = [];
    previousPaths = lumine.project.getPaths();
    for (const name of ["lower.css", "upper.CSS", "renamed.CsS"]) {
      const file = path.join(root, name);
      paths.push(file);
      fs.writeFileSync(file, content);
    }
    lumine.project.setPaths([root]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css", "**/*.CSS", "**/*.CsS"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("color-inline.ignoredScopes", []);
    lumine.config.set("color-inline.ignoredBufferNames", []);
    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.markerType", "background");
    ({ mainModule: main } = await lumine.packages.activatePackage(path.join(__dirname, "..")));
    project = main.getProject();
    await project.initialize();
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-inline");
    for (const editor of lumine.workspace.getTextEditors()) editor.destroy();
    lumine.project.setPaths(previousPaths);
    // These are only the three known fixture files; no recursive deletion.
    for (const file of paths) fs.unlinkSync(file);
    fs.rmdirSync(root);
  });

  async function open(index) {
    const editor = await lumine.workspace.open(paths[index]);
    const buffer = project.colorBufferForEditor(editor);
    await buffer.initialize();
    const view = lumine.views.getView(buffer);
    view.update();
    return { editor, buffer, view };
  }
  const alphaMarker = (buffer) =>
    buffer.getColorMarkers().find((marker) => marker.text === "#11223344");
  function expectCssColor({ editor, buffer, view }) {
    const marker = alphaMarker(buffer);
    expect(marker).toBeDefined();
    expect(marker.color.rgba).toEqual([17, 34, 51, 68 / 255]);
    const decoration = view.decorationByMarkerId[marker.id];
    expect(decoration.getProperties().class).toContain("color-inline-background");
    expect(editor.getTextInBufferRange(decoration.getMarker().getBufferRange())).toBe("#11223344");
    expect(view.styleByMarkerId[marker.id].textContent).toMatch(/rgba\(17,\s*34,\s*51,/);
    expect(
      buffer.getColorMarkers().find((marker) => marker.text === "rgb(1, 2, 3)").color.rgba,
    ).toEqual([1, 2, 3, 1]);
  }

  it("keeps CSS alpha byte order in both lower and uppercase project files and their decorations", async () => {
    expectCssColor(await open(0));
    expectCssColor(await open(1));
  });

  it("keeps the same color after a live editor path changes to mixed-case CSS", async () => {
    const entry = await open(0);
    expectCssColor(entry);
    entry.editor.getBuffer().setPath(paths[2]);
    await entry.buffer.update();
    entry.view.update();
    expectCssColor(entry);
    expect(entry.editor.getText()).toBe(content);
  });

  it("preserves intentional registry scope names and defaults-file semantics", () => {
    const registry = project.getColorExpressionsRegistry();
    const name = "case-sensitive-scope-control";
    registry.createExpression(name, "CUSTOM", 9, ["MyScope"], function () {});
    try {
      expect(registry.getExpressionsForScope("MyScope").map((entry) => entry.name)).toContain(name);
      expect(registry.getExpressionsForScope("myscope").map((entry) => entry.name)).not.toContain(
        name,
      );
      const customScope = project.scopeFromFileName(path.join(root, "custom.MyScope"));
      expect(customScope).toBe("MyScope");
      expect(registry.getExpressionsForScope(customScope).map((entry) => entry.name)).toContain(
        name,
      );
      expect(project.scopeFromFileName(path.join(root, ".color-inline"))).toBe("color-inline");
      expect(
        project.variables.getContext().scopeFromFileName(path.join(root, ".color-inline")),
      ).toBe("*");
    } finally {
      registry.removeExpression(name);
    }
  });

  it("releases the editor markers and native decorations on package deactivation", async () => {
    const entry = await open(1);
    const markers = entry.buffer.getColorMarkers().slice();
    await lumine.packages.deactivatePackage("color-inline");
    expect(markers.every((marker) => marker.destroyed)).toBe(true);
    expect(entry.view.colorBuffer).toBeNull();
    expect(
      entry.editor
        .getDecorations()
        .filter((decoration) =>
          decoration.getProperties().class?.startsWith("color-inline-background"),
        ),
    ).toEqual([]);
  });
});
