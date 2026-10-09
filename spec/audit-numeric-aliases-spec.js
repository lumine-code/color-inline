const fs = require("node:fs");
const path = require("node:path");
const timers = require("node:timers/promises");

describe("Color Inline numeric aliases in contributed color handlers", () => {
  let main, project, root, previousPaths, leases, editors, buffers;
  beforeEach(async () => {
    previousPaths = lumine.project.getPaths();
    root = fs.mkdtempSync(path.join(lumine.getConfigDirPath(), "owned-numeric-colors-"));
    fs.writeFileSync(
      path.join(root, "vars.css"),
      ":root { --amount: 50%; --hex: ff; --cycle: var(--other); --other: var(--cycle); }",
    );
    lumine.project.setPaths([root]);
    lumine.config.set("color-inline.sourceNames", ["**/*.css"]);
    lumine.config.set("color-inline.ignoredNames", []);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    leases = [];
    editors = [];
    buffers = [];
  });
  afterEach(async () => {
    buffers.forEach((buffer) => buffer.destroy());
    editors.forEach((editor) => editor.destroy());
    leases.forEach((lease) => lease.dispose());
    await lumine.packages.deactivatePackage("color-inline");
    lumine.project.setPaths(previousPaths);
    const relative = path.relative(lumine.getConfigDirPath(), root);
    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      !path.basename(root).startsWith("owned-numeric-colors-")
    )
      throw Error("Unexpected cleanup target");
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 30 });
  });
  async function scan(method, variable, base) {
    leases.push(
      main.consumeColorExpressions({
        name: "audit:numeric-alias",
        regexpString: "channel\\[([^\\]]+)\\]",
        scopes: ["css"],
        handle(match, _expression, context) {
          this.rgba = [context[method](match[1], base), 0, 0, 1];
        },
      }),
    );
    const editor = lumine.workspace.buildTextEditor();
    editors.push(editor);
    editor.getBuffer().setPath(path.join(root, "document.css"));
    editor.setText(`channel[var(--${variable})]`);
    const buffer = new (require("../lib/color-buffer"))({ editor, project });
    buffers.push(buffer);
    await buffer.initialize();
    return buffer;
  }
  it("converts a percentage variable exactly once in an actual color marker", async () => {
    const buffer = await scan("readPercent", "amount");
    expect(buffer.getValidColorMarkers().map((marker) => marker.color.rgba)).toEqual([
      [127, 0, 0, 1],
    ]);
  });
  it("retains an explicit integer base while resolving a variable in the actual editor", async () => {
    const buffer = await scan("readInt", "hex", 16);
    expect(buffer.getValidColorMarkers().map((marker) => marker.color.rgba)).toEqual([
      [255, 0, 0, 1],
    ]);
  });
  it("finishes a cyclic numeric alias without a stack overflow or unhandled rejection", async () => {
    let rejection;
    const errors = [];
    const rejected = (event) => {
      errors.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", rejected);
    try {
      try {
        await scan("readFloatOrPercent", "cycle");
      } catch (error) {
        rejection = error;
      }
      await timers.setTimeout(30);
      expect(rejection).toBeUndefined();
      expect(errors).toEqual([]);
      expect(buffers[0].getValidColorMarkers()).toEqual([]);
    } finally {
      window.removeEventListener("unhandledrejection", rejected);
    }
  });

  it("preserves regular/default fallback, literal units and references for all numeric readers", () => {
    const Context = require("../lib/color-context");
    for (const [method, expected] of [
      ["readFloat", 22],
      ["readInt", 22],
      ["readPercent", 56],
      ["readIntOrPercent", 56],
      ["readFloatOrPercent", 0.22],
    ]) {
      const context = new Context({
        registry: project.getColorExpressionsRegistry(),
        variables: [
          { name: "@a", value: "@b" },
          { name: "@b", value: "missing" },
          { name: "@a", value: "22%", default: true },
        ],
      });
      expect(context[method]("@a")).toBe(expected);
      expect(context.usedVariables).toContain("@a");
      expect(context.usedVariables).toContain("@b");
      const cycle = new Context({
        registry: project.getColorExpressionsRegistry(),
        variables: [
          { name: "@a", value: "@b" },
          { name: "@b", value: "@a" },
        ],
      });
      expect(Number.isNaN(cycle[method]("@a"))).toBeTrue();
    }
    const context = new Context({ registry: project.getColorExpressionsRegistry() });
    expect(context.readFloatOrPercent(32)).toBe(32);
    expect(context.readIntOrPercent(32.5)).toBe(32.5);
    expect(context.readPercent("50%")).toBe(127);
  });

  it("resolves a long acyclic numeric alias chain without a JavaScript stack limit", () => {
    const variables = Array.from({ length: 12000 }, (_, index) => ({
      name: `@n${index}`,
      value: index === 11999 ? "17" : `@n${index + 1}`,
    }));
    const Context = require("../lib/color-context");
    const context = new Context({ registry: project.getColorExpressionsRegistry(), variables });
    expect(context.readFloat("@n0")).toBe(17);
    expect(context.usedVariables.length).toBe(12000);
  });
});
