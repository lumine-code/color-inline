const uris = require("../lib/uris");

describe("color-inline workspace views", () => {
  let main, previousProject;

  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    previousProject = main.project;
    main.project = { initialize: jasmine.createSpy("initialize").and.resolveTo() };
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
      [uris.SEARCH, { searchAllPanes: true }],
      [uris.PALETTE, { searchAllPanes: true }],
      [uris.SETTINGS, { searchAllPanes: true }],
    ]);
  });
});
