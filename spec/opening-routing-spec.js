const uris = require("../lib/uris");

describe("color-inline workspace views", () => {
  let main, previousProject, results;

  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    previousProject = main.project;
    results = {};
    main.project = {
      initialize: jasmine.createSpy("initialize").and.resolveTo(),
      findAllColors: jasmine.createSpy("new color result set").and.returnValue(results),
    };
  });

  afterEach(async () => {
    main.project = previousProject;
    await lumine.packages.deactivatePackage("color-inline");
  });

  it("opens search, palette, and settings through the workspace", async () => {
    const open = spyOn(lumine.workspace, "open").and.callFake(async (uri) => uri);

    await main.findColors();
    await main.showPalette();
    await main.showSettings();

    expect(open.calls.allArgs()).toEqual([
      [results],
      [uris.PALETTE, { searchAllPanes: true }],
      [uris.SETTINGS, { searchAllPanes: true }],
    ]);
  });
});
