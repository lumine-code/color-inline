describe("Color Inline settings startup restoration", () => {
  let pack, view;

  beforeEach(async () => {
    if (lumine.packages.getLoadedPackage("color-inline"))
      await lumine.packages.unloadPackage("color-inline", { serialize: false });
    lumine.project.setPaths([]);
    pack = lumine.packages.loadPackage("color-inline");
    pack.initializeForExternalUse("startup restoration spec");
  });

  afterEach(async () => {
    view?.destroy();
    view = null;
    if (lumine.packages.getLoadedPackage("color-inline"))
      await lumine.packages.unloadPackage("color-inline", { serialize: false });
  });

  it("restores settings before activation and retains their project afterwards", async () => {
    view = pack.mainModule.deserializeColorProjectElement();
    const project = view.project;
    expect(project).toBeDefined();
    expect(project.isDestroyed()).toBeFalsy();
    await lumine.packages.activatePackage("color-inline");
    expect(pack.mainModule.getProject()).toBe(project);
    expect(view.sourceNames.getModel().isDestroyed()).toBeFalse();
  });

  it("releases settings mini editors when the owning package deactivates", async () => {
    await lumine.packages.activatePackage("color-inline");
    view = pack.mainModule.deserializeColorProjectElement();
    const editor = view.sourceNames.getModel();
    await pack.deactivate();
    expect(view.destroyed).toBeTrue();
    expect(editor.isDestroyed()).toBeTrue();
    expect(view.subscriptions.disposed).toBeTrue();
  });

  it("closes a restored settings pane when startup stops before activation", async () => {
    view = pack.mainModule.deserializeColorProjectElement();
    const editor = view.sourceNames.getModel();
    await lumine.workspace.open(view, { activatePane: false });
    const pane = lumine.workspace.paneForItem(view);
    await pack.deactivate();
    expect(pane.getItems()).not.toContain(view);
    expect(view.destroyed).toBeTrue();
    expect(editor.isDestroyed()).toBeTrue();
  });
});
