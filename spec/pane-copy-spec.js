describe("Color Inline singleton pane items", () => {
  let project, models;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    models = [];
  });
  afterEach(() => {
    for (const model of models) model.destroy();
  });

  it("keeps different result sets in separate cards while silently skipping copies", async () => {
    const Search = require("../lib/color-search");
    const first = new Search({ project, sourceNames: [] });
    const second = new Search({ project, sourceNames: [] });
    models.push(first, second);
    await lumine.workspace.open(first);
    await lumine.workspace.open(second);
    expect(first.getSingletonKey()).not.toBe(second.getSingletonKey());
    expect(lumine.workspace.getPaneItems()).toContain(first);
    expect(lumine.workspace.getPaneItems()).toContain(second);
    const panes = lumine.workspace.getPanes();
    const warnings = spyOn(lumine.notifications, "addWarning");
    const errors = spyOn(lumine.notifications, "addError");
    expect(await lumine.workspace.copyPaneItem(first, { splitDirection: "right" })).toBeNull();
    expect(lumine.workspace.getPanes()).toEqual(panes);
    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    const restored = Search.deserialize(first.serialize());
    models.push(restored);
    expect(restored.getSingletonKey()).toBe(first.getSingletonKey());
  });

  it("reuses the workspace palette and moves its exact view", async () => {
    const Palette = require("../lib/palette");
    const first = new Palette();
    const duplicate = new Palette();
    models.push(first, duplicate);
    await lumine.workspace.open(first);
    const root = lumine.views.getView(first);
    const panes = lumine.workspace.getPanes();
    expect(await lumine.workspace.open(duplicate, { split: "right" })).toBe(first);
    expect(lumine.workspace.getPanes()).toEqual(panes);
    expect(await lumine.workspace.copyPaneItem(first, { splitDirection: "down" })).toBeNull();
    const moved = await lumine.workspace.movePaneItem(first, { splitDirection: "left" });
    expect(moved.item).toBe(first);
    expect(lumine.views.getView(first)).toBe(root);
  });
});
