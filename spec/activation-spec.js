const manifest = require("../package.json");

describe("color-inline bootstrap", () => {
  it("keeps lifecycle registrations in JavaScript", () => {
    expect(manifest.requiresRestartOnUpdate).toBe(true);
    for (const descriptor of Object.values(manifest.providedServices || {})) {
      expect(descriptor.activation).toBeUndefined();
    }
  });

  it("activates the first editor generation once and rebinds views after reload", async () => {
    const notifications = jasmine.createSpy("notifications");
    lumine.notifications.onDidAddNotification(notifications);

    const first = await lumine.packages.startPackage("color-inline");
    await lumine.workspace.open("color-inline-activation.css");
    await Promise.resolve();
    expect(lumine.packages.getPackageLifecycleState("color-inline")).toBe("active");
    expect(first.mainModule.getProject().isDestroyed()).toBeFalsy();
    const firstElement = lumine.views.getView(first.mainModule.getProject().getPalette());
    expect(firstElement.project).toBe(first.mainModule.getProject());

    await lumine.packages.unloadPackage("color-inline", { serialize: false });
    const second = await lumine.packages.activatePackage("color-inline");
    const secondElement = lumine.views.getView(second.mainModule.getProject().getPalette());

    expect(second).not.toBe(first);
    expect(secondElement.project).toBe(second.mainModule.getProject());
    expect(notifications.calls.count()).toBe(0);
  });

  describe("deferred project restoration", () => {
    let previousState, projectState, ColorProject;

    beforeEach(async () => {
      for (const editor of lumine.workspace.getTextEditors()) editor.destroy();
      previousState = lumine.packages.getPackageState("color-inline");
      if (lumine.packages.isPackageLoaded("color-inline")) {
        await lumine.packages.unloadPackage("color-inline", { serialize: false });
      }
      const { SERIALIZE_VERSION, SERIALIZE_MARKERS_VERSION } = require("../lib/versions");
      projectState = {
        version: SERIALIZE_VERSION,
        markersVersion: SERIALIZE_MARKERS_VERSION,
        globalSourceNames: lumine.config.get("color-inline.sourceNames"),
        globalIgnoredNames: lumine.config.get("color-inline.ignoredNames"),
        ignoredNames: ["temporary/*"],
        paths: [],
        variables: { content: [{ name: "saved", value: "1", path: "saved.css" }] },
        buffers: { unused: { colorMarkers: [] } },
      };
      lumine.packages.setPackageState("color-inline", { project: projectState });

      // Unload discards module identities. Spy on the constructors belonging to
      // the generation that is about to activate.
      lumine.packages.loadPackage("color-inline").requireMainModule();
      ColorProject = require("../lib/color-project");
      spyOn(ColorProject, "deserialize").and.callThrough();
      spyOn(ColorProject.prototype, "loadPathsAndVariables").and.returnValue(Promise.resolve());
    });

    afterEach(async () => {
      for (const editor of lumine.workspace.getTextEditors()) editor.destroy();
      if (lumine.packages.isPackageLoaded("color-inline")) {
        await lumine.packages.unloadPackage("color-inline", { serialize: false });
      }
      lumine.packages.setPackageState("color-inline", previousState);
    });

    it("saves only settings from an unopened cached project without restoring or rescanning it", async () => {
      const pack = await lumine.packages.startPackage("color-inline");
      await Promise.resolve();

      const serialized = pack.mainModule.serialize().project;
      expect(serialized.ignoredNames).toEqual(["temporary/*"]);
      expect(serialized.paths).toBeUndefined();
      expect(serialized.variables).toBeUndefined();
      expect(serialized.buffers).toBeUndefined();
      expect(projectState.variables).toBeDefined();
      expect(projectState.buffers).toBeDefined();

      expect(pack.mainModule.project).toBeNull();
      expect(ColorProject.deserialize).not.toHaveBeenCalled();
      expect(ColorProject.prototype.loadPathsAndVariables).not.toHaveBeenCalled();
    });

    it("starts the project when a document opens and saves settings without its index", async () => {
      const pack = await lumine.packages.startPackage("color-inline");
      const editor = await lumine.workspace.open("color-inline-deferred.css");
      const project = pack.mainModule.project;
      await project.initialize();

      expect(ColorProject.deserialize.calls.count()).toBe(1);
      expect(project.hasColorBufferForEditor(editor)).toBe(true);
      const serialized = pack.mainModule.serialize().project;
      expect(serialized.ignoredNames).toEqual(["temporary/*"]);
      expect(serialized.paths).toBeUndefined();
      expect(serialized.variables).toBeUndefined();
      expect(serialized.buffers).toBeUndefined();
    });

    it("also starts for an untitled document", async () => {
      const pack = await lumine.packages.startPackage("color-inline");
      const editor = await lumine.workspace.open();

      expect(editor.getPath()).toBeUndefined();
      expect(ColorProject.deserialize.calls.count()).toBe(1);
      expect(pack.mainModule.project.hasColorBufferForEditor(editor)).toBe(true);
    });

    it("starts on an explicit service operation even without an editor", async () => {
      const pack = await lumine.packages.startPackage("color-inline");
      const service = pack.mainModule.provideColorInlineProject();
      expect(pack.mainModule.project).toBeNull();

      const project = service.getProject();
      await project.initialize();

      expect(project).toBe(pack.mainModule.project);
      expect(ColorProject.deserialize.calls.count()).toBe(1);
      expect(ColorProject.prototype.loadPathsAndVariables.calls.count()).toBe(1);
    });
  });
});
