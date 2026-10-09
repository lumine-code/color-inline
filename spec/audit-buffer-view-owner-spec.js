describe("Color Inline native buffer view retirement", () => {
  let main, editor, buffer, view, subscriptions;
  beforeEach(async () => {
    lumine.project.setPaths([]);
    lumine.config.set("color-inline.markerType", "background");
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    const project = main.getProject();
    await project.initialize();
    editor = lumine.workspace.buildTextEditor();
    editor
      .getBuffer()
      .setPath(require("node:path").join(lumine.getConfigDirPath(), "owned-view.css"));
    editor.setText("#123");
    const ColorBuffer = require("../lib/color-buffer");
    buffer = new ColorBuffer({ editor, project });
    await buffer.initialize();
    subscriptions = [];
  });
  afterEach(async () => {
    subscriptions.forEach((subscription) => subscription.dispose());
    view?.destroy();
    buffer.destroy();
    // Clean the original late native gutter before discarding this owned editor.
    editor.gutterWithName("color-inline-gutter")?.destroy();
    editor.destroy();
    await lumine.packages.deactivatePackage("color-inline");
  });

  it("does not allocate a gutter from a copied config callback after its buffer retires", () => {
    subscriptions.push(
      lumine.config.onDidChange("color-inline.markerType", () => buffer.destroy()),
    );
    const View = require("../lib/color-buffer-element");
    view = new View();
    jasmine.attachToDOM(lumine.views.getView(editor));
    view.setModel(buffer);
    lumine.config.set("color-inline.markerType", "gutter");
    expect(buffer.destroyed).toBeTrue();
    expect(view.colorBuffer).toBeNull();
    expect(editor.gutterWithName("color-inline-gutter")).toBeNull();
  });
});
