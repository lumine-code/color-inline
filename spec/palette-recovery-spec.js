describe("Color Inline palette recovery", () => {
  let pack, palette, restored, view;

  beforeEach(() => {
    pack = lumine.packages.loadPackage("color-inline");
    pack.initializeForExternalUse("palette recovery spec");
    const Palette = require("../lib/palette");
    const Color = require("../lib/color");
    palette = new Palette([
      { id: 1, name: "red", path: "restored.css", line: 0, color: new Color(255, 0, 0, 0.5) },
      { id: 2, name: "blue", path: "restored.css", line: 1, color: new Color(0, 0, 255, 1) },
    ]);
    restored = lumine.deserializers.deserialize(JSON.parse(JSON.stringify(palette.serialize())));
  });

  afterEach(async () => {
    view?.destroy();
    view?.remove();
    view = null;
    palette.destroy();
    restored.destroy();
    await lumine.packages.deactivatePackage("color-inline");
  });

  it("retains color values and sorting across the JSON session boundary", () => {
    expect(restored.variables[0].color.toCSS()).toBe("rgba(255,0,0,0.5)");
    expect(restored.sortedByColor().map(({ name }) => name)).toEqual(["red", "blue"]);
  });

  it("renders restored colors before the package activation batch", () => {
    lumine.config.set("color-inline.sortPaletteColors", "by color");
    view = lumine.views.getView(restored);
    jasmine.attachToDOM(view);
    expect(view.querySelectorAll(".color-inline-color-item").length).toBe(2);
    expect(view.textContent).toContain("red");
    expect(view.textContent).toContain("blue");
    expect(pack.mainActivated).toBe(false);
  });
});
