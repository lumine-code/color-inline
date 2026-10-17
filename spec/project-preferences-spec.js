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
      const facade = { ...main };
      facade.activate({ workspaceState, subscriptions: new CompositeDisposable() });
      facades.push(facade);
      states.push(workspaceState);
      projects.push(facade.ensureProject());
    }
  });

  afterEach(async () => {
    facades.forEach((facade) => facade.deactivate());
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

  it("applies the new project's settings immediately while an outgoing write is pending", async () => {
    const manager = managers[0];
    const project = projects[0];
    await manager.switchProject(["other-project"]);
    project.setSearchNames(["*.other"]);
    await committed();
    await manager.switchProject(["same-project"]);
    project.setSearchNames(["*.original"]);
    await committed();

    const update = manager.stateStore.update.bind(manager.stateStore);
    let releaseWrite, writeStarted;
    const heldWrite = new Promise((resolve) => (releaseWrite = resolve));
    const secondWriteStarted = new Promise((resolve) => (writeStarted = resolve));
    let writes = 0;
    spyOn(manager.stateStore, "update").and.callFake(async (...args) => {
      if (++writes === 2) {
        writeStarted();
        await heldWrite;
      }
      return update(...args);
    });
    project.setIgnoreGlobalSearchNames(true);
    const switching = manager.switchProject(["other-project"]);
    expect(project.searchNames).toEqual(["*.other"]);
    expect(project.ignoreGlobalSearchNames).toBeUndefined();
    project.setSearchNames(["*.newer"]);
    try {
      await switching;
      await secondWriteStarted;
      await flushMicrotasks(4);
      expect(facades[0].pendingSettingsWrites).toBe(1);
      expect(project.searchNames).toEqual(["*.newer"]);
      expect(project.ignoreGlobalSearchNames).toBeUndefined();
    } finally {
      releaseWrite();
    }
    await manager.flush();
    await conditionPromise(() => facades[0].pendingSettingsWrites === 0);
    expect(project.searchNames).toEqual(["*.newer"]);
    expect(project.ignoreGlobalSearchNames).toBeUndefined();
    await manager.switchProject(["same-project"]);
    expect(project.searchNames).toEqual(["*.original"]);
    expect(project.ignoreGlobalSearchNames).toBe(true);
  });
});
