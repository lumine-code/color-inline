const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CompositeDisposable } = require("lumine");

describe("Color Inline durable project preference operations", () => {
  let directory, base, managers, facades, states, projects;

  beforeEach(async () => {
    jasmine.useRealClock();
    base = fs.realpathSync.native(os.tmpdir());
    directory = fs.mkdtempSync(path.join(base, "colour-preference-windows-"));
    managers = [];
    facades = [];
    states = [];
    projects = [];
    const main = require("../lib/main");
    for (let index = 0; index < 2; index++) {
      const manager = new lumine.packages.storage.constructor();
      managers.push(manager);
      await manager.initialize({
        configDirPath: directory,
        projectPaths: ["same-project"],
        windowStateId: `colour-window-${index}`,
      });
      const workspaceState = manager.forPackage("color-inline").workspaceState;
      const facade = {
        workspaceState,
        project: null,
        projectState: {},
        pendingSettingsWrites: 0,
        subscriptions: new CompositeDisposable(),
        ensureProject: main.ensureProject,
        applyProjectSettings: main.applyProjectSettings,
      };
      facades.push(facade);
      states.push(workspaceState);
      projects.push(facade.ensureProject());
    }
  });

  afterEach(async () => {
    facades.forEach((facade) => facade.subscriptions.dispose());
    projects.forEach((project) => project.destroy());
    await Promise.all(managers.map((manager) => manager.close()));
    if (path.dirname(fs.realpathSync.native(directory)) !== base)
      throw new Error("Preference profile escaped its temporary parent");
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function committed() {
    await Promise.all(managers.map((manager) => manager.flush()));
    await conditionPromise(() => facades.every((facade) => facade.pendingSettingsWrites === 0));
    return states[0].mutate("projectSettings", (value) => value);
  }

  it("retains different fields changed concurrently by actual project setters", async () => {
    projects[0].setSearchNames(["*.custom"]);
    projects[1].setIgnoreGlobalSearchNames(true);
    const result = await committed();
    expect(result).toEqual({ searchNames: ["*.custom"], ignoreGlobalSearchNames: true });
    expect(facades[0].project).toBe(projects[0]);
    expect(facades[1].project).toBe(projects[1]);
  });

  it("resets a single setting without reviving another window's stale fields", async () => {
    projects[0].setSassShadeAndTintImplementation("bourbon");
    await committed();
    projects[1].setSearchNames(["*.custom"]);
    await committed();
    projects[1].setSassShadeAndTintImplementation(null);
    let result = await committed();
    expect(result).toEqual({ searchNames: ["*.custom"] });
    projects[0].setSearchNames([]);
    result = await committed();
    expect(result).toEqual({ searchNames: [] });
  });
});
