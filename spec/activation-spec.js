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
});
