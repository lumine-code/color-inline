describe("Color Inline pane copies", () => {
  let project, models, Color;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    Color = require("../lib/color");
    models = [];
  });

  afterEach(() => {
    for (const model of models) model.destroy();
  });

  it("copies a result snapshot and a copy without rescanning or sharing mutable match state", async () => {
    const Search = require("../lib/color-search");
    const source = new Search({ project });
    source.snapshot = source.fileResults = [
      {
        filePath: "owned.css",
        matches: [
          {
            matchText: "red",
            color: new Color(255, 0, 0),
            lineText: "red",
            lineTextOffset: 0,
            range: [
              [0, 0],
              [0, 3],
            ],
          },
        ],
      },
    ];
    source.results = source.fileResults[0].matches;
    models.push(source);
    spyOn(source, "search").and.callThrough();
    await lumine.workspace.open(source);
    const sourceView = lumine.views.getView(source);
    sourceView.resultsList.querySelector(".list-nested-item").classList.add("collapsed");
    const { item: first } = await lumine.workspace.copyPaneItem(source, {
      splitDirection: "right",
    });
    models.push(first);
    const { item: second } = await lumine.workspace.copyPaneItem(first, { splitDirection: "down" });
    models.push(second);
    expect(source.search).not.toHaveBeenCalled();
    expect(second.fileResults).toEqual(first.fileResults);
    expect(second.fileResults[0].matches[0].color).not.toBe(first.fileResults[0].matches[0].color);
    second.fileResults[0].matches[0].range[0][0] = 99;
    expect(first.fileResults[0].matches[0].range[0][0]).toBe(0);
    expect(lumine.views.getView(second)).not.toBe(sourceView);
    expect(lumine.views.getView(second).resultsList.querySelector(".collapsed")).not.toBeNull();
    source.destroy();
    expect(first.destroyed).not.toBe(true);
    expect(second.destroyed).not.toBe(true);
  });

  it("owns palette rows and colors independently", () => {
    const Palette = require("../lib/palette");
    const source = new Palette([{ id: 1, name: "owned", color: new Color(255, 0, 0) }]);
    models.push(source);
    const copy = source.copy();
    models.push(copy);
    expect(copy.variables[0]).not.toBe(source.variables[0]);
    expect(copy.variables[0].color).not.toBe(source.variables[0].color);
    expect(lumine.views.getView(copy)).not.toBe(lumine.views.getView(source));
    source.destroy();
    expect(copy.destroyed).not.toBe(true);
  });
});
