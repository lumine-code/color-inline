const main = require("../lib/main");
const uris = require("../lib/uris");

describe("colors workspace views", () => {
  let previousProject;

  beforeEach(() => {
    previousProject = main.project;
    main.project = { initialize: jasmine.createSpy("initialize").and.resolveTo() };
  });

  afterEach(() => {
    main.project = previousProject;
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
