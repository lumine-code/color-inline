describe("Color Inline native palette and project settings", () => {
  let main, project, views, restored;
  beforeEach(async () => {
    lumine.project.setPaths([]);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    views = [];
    restored = [];
  });
  afterEach(async () => {
    for (const view of views) {
      view.destroy?.();
      view.subscriptions?.dispose();
      view.remove();
    }
    for (const item of restored) item.destroy();
    await lumine.packages.deactivatePackage("color-inline");
  });
  function paletteView() {
    const Palette = require("../lib/palette");
    const Color = require("../lib/color");
    const View = require("../lib/palette-element");
    const variable = {
      id: 123,
      name: "owned-color",
      color: new Color(17, 34, 51, 1),
      path: require("node:path").join(lumine.getConfigDirPath(), "owned-palette.css"),
      line: 0,
    };
    const view = new View();
    view.setModel(new Palette([variable]));
    views.push(view);
    jasmine.attachToDOM(view);
    return { view, variable };
  }

  it("uses the owning occurrence when its nested path text is clicked", () => {
    const { view, variable } = paletteView();
    spyOn(project, "getVariableById").and.callFake((id) =>
      id === variable.id ? variable : undefined,
    );
    const show = spyOn(project, "showVariableInFile").and.resolveTo();
    view.querySelector("[data-variable-id] .path").click();
    expect(show).toHaveBeenCalledWith(variable);
  });

  it("reflects a saved by-color sort in the native select", () => {
    lumine.config.set("color-inline.sortPaletteColors", "by color");
    const { view } = paletteView();
    expect(view.sort.value).toBe("by color");
  });

  it("retains live palette controls after a normal DOM move", () => {
    const { view } = paletteView();
    view.remove();
    jasmine.attachToDOM(view);
    view.sort.value = "by name";
    view.sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(lumine.config.get("color-inline.sortPaletteColors")).toBe("by name");
    expect(view.sortPaletteColors).toBe("by name");
  });

  it("preserves supported filetypes and Sass override through actual settings and project serialization", () => {
    lumine.config.set("color-inline.sassShadeAndTintImplementation", "compass");
    const view = lumine.views.getView(project);
    views.push(view);
    jasmine.attachToDOM(view);
    view.supportedFiletypes.getModel().setText("css, scss");
    view.supportedFiletypes.getModel().getBuffer().emitter.emit("did-stop-changing");
    view.ignoreGlobalSupportedFiletypes.checked = true;
    view.ignoreGlobalSupportedFiletypes.dispatchEvent(new Event("change", { bubbles: true }));
    view.sassShadeAndTintImplementation.value = "bourbon";
    view.sassShadeAndTintImplementation.dispatchEvent(new Event("change", { bubbles: true }));
    expect(project.scopeFromFileName("owned.scss")).toBe("scss:bourbon");
    const ColorProject = require("../lib/color-project");
    const replacement = ColorProject.deserialize(project.serialize());
    restored.push(replacement);
    expect(replacement.supportedFiletypes).toEqual(["css", "scss"]);
    expect(replacement.ignoreGlobalSupportedFiletypes).toBeTrue();
    expect(replacement.scopeFromFileName("owned.scss")).toBe("scss:bourbon");
  });

  it("destroys owned settings mini editors when Core closes the settings pane item", async () => {
    const view = lumine.views.getView(project);
    views.push(view);
    const editor = view.sourceNames.getModel();
    await lumine.workspace.open(view);
    const pane = lumine.workspace.paneForItem(view);
    await pane.destroyItem(view);
    expect(pane.getItems()).not.toContain(view);
    expect(editor.isDestroyed()).toBeTrue();
    expect(view.subscriptions.disposed).toBeTrue();
    expect(project.isDestroyed()).toBeFalsy();
    const replacement = await lumine.workspace.open("color-inline://settings");
    views.push(replacement);
    expect(replacement).not.toBe(view);
    expect(replacement.sourceNames.getModel().isDestroyed()).toBeFalse();
  });
});
