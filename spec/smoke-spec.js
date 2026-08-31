// The first thing to establish after a port this large: the package loads, its
// commands register, and a buffer actually gets colour markers.
const { Icon } = require("lumine");

describe("color-inline", () => {
  let workspaceElement, mainModule;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    lumine.config.set("color-inline.delayBeforeScan", 0);

    const pack = await lumine.packages.activatePackage("color-inline");
    mainModule = pack.mainModule;
  });

  it("activates", () => {
    expect(lumine.packages.isPackageActive("color-inline")).toBe(true);
  });

  it("registers its workspace commands", () => {
    const commands = lumine.commands
      .findCommands({ target: workspaceElement })
      .map((command) => command.name);

    expect(commands).toContain("color-inline:find-colors");
    expect(commands).toContain("color-inline:show-palette");
    expect(commands).toContain("color-inline:project-settings");
    expect(commands).toContain("color-inline:reload");
  });

  it("defines its custom elements", () => {
    // The view modules are required lazily, so requiring them here is what
    // proves each one registers rather than throwing on the v1 API.
    require("../lib/color-buffer-element");
    require("../lib/color-project-element");
    require("../lib/color-results-element");
    require("../lib/palette-element");

    for (const name of [
      "color-inline-markers",
      "color-inline-color-project",
      "color-inline-color-results",
      "color-inline-palette",
    ]) {
      expect(customElements.get(name)).toBeDefined();
    }
  });

  it("routes result file paths through the shared icon registry", () => {
    const ColorResultsElement = require("../lib/color-results-element");
    const element = new ColorResultsElement();
    workspaceElement.appendChild(element);
    element.addFileResult({ filePath: "result.css", matches: [] });
    const icon = element.querySelector(".color-result-file-icon");
    expect(icon).toHaveClass("icon-file-text");

    const iconProvider = lumine.icons.addProvider(
      {
        id: "color-inline-spec",
        handles: ["path"],
        usesContext: true,
        iconFor(target) {
          return target.context === "color-inline" ? Icon.classes(["icon-flame"]) : null;
        },
      },
      { priority: 100 },
    );
    expect(icon).toHaveClass("icon-flame");
    iconProvider.dispose();
    element.remove();
  });

  it("builds a project and exposes it through the service", () => {
    const api = mainModule.provideColorInlineProject();
    expect(api.getProject()).toBeTruthy();
  });

  it("announces the autocomplete provider with an API-5 scope selector", () => {
    const provider = mainModule.provideAutocomplete();
    // The bundled autocomplete rejects `selector` outright.
    expect(provider.scopeSelector).toBeTruthy();
    expect(provider.selector).toBeUndefined();
  });

  describe("scanning a buffer", () => {
    it("finds the colors in an editor and marks them", async () => {
      const editor = await lumine.workspace.open("smoke.css");
      editor.setText("a { color: #ff0000; background: rgb(0, 255, 0); }");

      const colorBuffer = mainModule.project.colorBufferForEditor(editor);
      expect(colorBuffer).toBeTruthy();

      const markers = await colorBuffer.scanBufferForColors();
      expect(markers.length).toBe(2);
      expect(markers[0].color.toCSS()).toBe("rgb(255,0,0)");
      expect(markers[1].color.toCSS()).toBe("rgb(0,255,0)");
    });

    it("finds variable definitions in a buffer", async () => {
      const editor = await lumine.workspace.open("smoke-variables.less");
      editor.setText("@primary: #ff0000;\n@secondary: @primary;\n");

      const colorBuffer = mainModule.project.colorBufferForEditor(editor);
      const variables = await colorBuffer.scanBufferForVariables();

      expect(variables.length).toBe(2);
      expect(variables[0].name).toBe("@primary");
      expect(variables[1].name).toBe("@secondary");
    });
  });
});
