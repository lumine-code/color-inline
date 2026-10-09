const ColorContext = require("../lib/color-context");
const registry = require("../lib/color-expressions");

describe("Audit of existing color expression output", () => {
  const read = (expression, scope = "css") =>
    new ColorContext({ registry, scope }).readColor(expression);

  it("round trips RGBA hex in the public completion values", () => {
    const color = read("#ff008080");
    expect(color.rgba).toEqual([255, 0, 128, 128 / 255]);
    expect(color.hexRGBA).toBe("ff008080");
    expect(color.suggestionValues[0]).toBe("#ff008080");
    expect(read("#01020304").hexRGBA).toBe("01020304");
  });

  it("round trips ARGB hex at the existing non CSS expression", () => {
    const color = read("0x80112233", "javascript");
    expect(color.rgba).toEqual([17, 34, 51, 128 / 255]);
    expect(color.hexARGB).toBe("80112233");
    expect(read("0x01112233", "javascript").hexARGB).toBe("01112233");
  });

  it("evaluates an existing HWB expression at full black", () => {
    const color = read("hwb(210,0%,100%)");
    expect(color).toBeDefined();
    expect(color.rgba).toEqual([0, 0, 0, 1]);
    expect(color.isValid()).toBe(true);
  });

  it("preserves the other components in a supported Stylus component function", () => {
    expect(read("red(rgba(10,20,30,0.5),50)", "stylus").rgba).toEqual([50, 20, 30, 0.5]);
    expect(read("green(rgba(10,20,30,0.5),50)", "stylus").rgba).toEqual([10, 50, 30, 0.5]);
  });
});

describe("Audit of native color search results", () => {
  let view;
  afterEach(() => {
    view?.subscriptions.dispose();
    view?.remove();
  });

  it("renders an empty result without passing markup to appendChild", () => {
    const Results = require("../lib/color-results-element");
    view = new Results();
    expect(() => view.searchComplete()).not.toThrow();
    expect(view.querySelector(".no-results-overlay")?.textContent).toContain("No Results");
  });

  it("keeps source text literal and opens the original ampersand path from a result", async () => {
    const Results = require("../lib/color-results-element");
    view = new Results();
    const filePath = require("path").join(lumine.getConfigDirPath(), "a&copy;.css");
    const lineText = '<i data-audit-injected="yes">red</i> #ff0000';
    const editor = lumine.workspace.buildTextEditor();
    editor.setText(lineText);
    const open = spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve(editor));
    const context = new ColorContext({ registry, scope: "css" });
    const start = lineText.indexOf("#");
    try {
      view.addFileResult({
        filePath,
        matches: [
          {
            color: context.readColor("#ff0000"),
            matchText: "#ff0000",
            lineText,
            lineTextOffset: 0,
            range: [
              [0, start],
              [0, start + 7],
            ],
          },
        ],
      });
      expect(view.querySelector("[data-audit-injected]")).toBeNull();
      expect(view.querySelector(".preview").textContent).toContain(lineText);
      view.querySelector(".search-result").click();
      await Promise.resolve();
      expect(open).toHaveBeenCalledWith(filePath);
      expect(editor.getSelectedText()).toBe("#ff0000");
    } finally {
      editor.destroy();
    }
  });
});
