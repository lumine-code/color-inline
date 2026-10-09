const fs = require("node:fs");
const path = require("node:path");

describe("legacy color() in real project editor decorations", () => {
  let folder, file, previousPaths, main, editor;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    folder = fs.mkdtempSync(path.join(lumine.getConfigDirPath(), "legacy-color-"));
    file = path.join(folder, "contract.CSS");
    previousPaths = lumine.project.getPaths();
    lumine.project.setPaths([folder]);
    lumine.config.set("color-inline.sourceNames", ["**/*.CSS"]);
    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("color-inline.ignoredScopes", []);
    lumine.config.set("color-inline.markerType", "background");
    ({ mainModule: main } = await lumine.packages.activatePackage(path.join(__dirname, "..")));
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-inline");
    editor?.destroy();
    lumine.project.setPaths(previousPaths);
    fs.unlinkSync(file);
    fs.rmdirSync(folder);
  });
  async function open(text) {
    fs.writeFileSync(file, text);
    editor = await lumine.workspace.open(file);
    const project = main.getProject();
    await project.initialize();
    const buffer = project.colorBufferForEditor(editor);
    await buffer.initialize();
    await buffer.variablesAvailable();
    await buffer.update();
    const view = lumine.views.getView(buffer);
    view.update();
    return { buffer, view };
  }
  it("renders legacy tint and nested blend through the project buffer and native decorations", async () => {
    const input =
      "body {\ncolor: color(red tint(50%));\nbackground: color(color(#4c5859 shade(25%)) blend(color(#4c5859 shade(40%)) 20%));\n}";
    const { buffer, view } = await open(input);
    const markers = buffer
      .getColorMarkers()
      .filter((marker) => marker.text.trim().startsWith("color("));
    expect(markers.map((marker) => marker.color.rgba)).toEqual([
      [255, 128, 128, 1],
      [55, 63, 64, 1],
    ]);
    for (const marker of markers) {
      expect(view.decorationByMarkerId[marker.id].getProperties().class).toContain(
        "color-inline-background",
      );
      expect(view.styleByMarkerId[marker.id].textContent).toContain(marker.color.toCSS());
    }
    expect(editor.getText()).toBe(input);
  });
  it("retains project custom-property substitution, alpha and cleanup after deactivation", async () => {
    const { buffer, view } = await open(
      ":root {\n--foo: #fd0cc7;\n}\nbody {\ncolor: color(var(--foo) tint(66%) a(40%));\n}",
    );
    const marker = buffer
      .getColorMarkers()
      .find((marker) => marker.text.trim().startsWith("color("));
    expect(marker?.color.rgba).toEqual([254, 172, 236, 0.4]);
    await lumine.packages.deactivatePackage("color-inline");
    expect(marker.destroyed).toBe(true);
    expect(view.colorBuffer).toBeNull();
  });
});
