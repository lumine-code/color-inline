const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Color Inline declaration navigation offsets", () => {
  let scratch, previousPaths, api, project, editor, consumer, provider;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    spyOn(lumine.clipboard, "write");
    jasmine.attachToDOM(lumine.workspace.getElement());
    previousPaths = lumine.project.getPaths();
    scratch = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "color-declaration-navigation-owned-")),
    );
    lumine.project.setPaths([scratch]);
    lumine.config.set("color-inline.sourceNames", ["**/*.less"]);
    lumine.config.set("color-inline.ignoredNames", []);
    lumine.config.set("core.ignoredNames", []);
    await lumine.packages.activatePackage("color-inline");
    consumer = lumine.packages.serviceHub.consume("color-inline.project", "^1.0.0", (service) => {
      api = service;
    });
    expect(api).toBeDefined();
  });

  afterEach(async () => {
    if (lumine.packages.getActivePackage("color-inline"))
      await lumine.packages.deactivatePackage("color-inline");
    provider?.dispose();
    consumer?.dispose();
    editor?.destroy();
    lumine.project.setPaths(previousPaths);
    if (scratch && fs.existsSync(scratch)) {
      const target = fs.realpathSync.native(scratch);
      const temporary = fs.realpathSync.native(os.tmpdir());
      if (
        fs.realpathSync.native(path.dirname(target)) !== temporary ||
        !path.basename(target).startsWith("color-declaration-navigation-owned-")
      )
        throw Error("Unsafe declaration navigation fixture cleanup");
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
    scratch = api = project = editor = consumer = provider = null;
  });

  async function navigate(text, name, expectedSelection) {
    const file = path.join(scratch, "variables.less");
    fs.writeFileSync(file, text);
    project = api.getProject();
    await project.initialize();
    const variable = api.getVariables().find((entry) => entry.name === name);
    expect(variable).toBeDefined();
    expect(variable.value).toBe("red");
    await project.showVariableInFile(variable);
    editor = lumine.workspace.getActiveTextEditor();
    expect(editor.getPath()).toBe(file);
    expect(editor.getText()).toBe(text);
    expect(editor.getSelectedText()).toBe(expectedSelection);
  }

  it("selects a Less declaration through its value when that value occurs in the name", async () => {
    await navigate("@brandred: red;", "@brandred", "@brandred: red");
  });

  it("uses the same precise capture range for a contributed default-handler declaration", async () => {
    provider = lumine.packages.serviceHub.provide("color-inline.variable-expressions", "1.0.0", {
      name: "p8:navigation-default",
      regexpString: "\\[\\[([a-z]+):([a-z]+)\\]\\]",
      scopes: ["less"],
      priority: 100,
    });
    await navigate("[[brandred:red]]", "brandred", "brandred:red");
  });

  it("preserves an ordinary declaration and excludes its leading indentation and terminator", async () => {
    await navigate("  @brand: red;", "@brand", "@brand: red");
  });

  it("uses the current shared scroll zone for a declaration reveal", async () => {
    await navigate("@brand: red;", "@brand", "@brand: red");
    const requests = [];
    const subscription = editor.onDidRequestAutoscroll((request) => requests.push(request));
    try {
      lumine.config.set("editor.scrollZone", [25, 75]);
      await project.showVariableInFile(api.getVariables().find((entry) => entry.name === "@brand"));
      expect(editor.getSelectedText()).toBe("@brand: red");
      expect(requests.at(-1).options.mode).toEqual([25, 75]);
    } finally {
      subscription.dispose();
    }
  });
});
