const ColorContext = require("../lib/color-context");
const DVIPnames = require("../lib/dvipnames");
const registry = require("../lib/color-expressions");
const { scanTextForColors } = require("../lib/buffer-scanner");

// The `color-inline:latex_predefined_dvipnames` expression looks its names up on the
// context. Its table was lost in the CoffeeScript conversion while the
// expression survived, so every one of these threw on lookup -- and because the
// scanner runs as the package activates, that took the whole package down.
describe("DVIP names", function () {
  it("puts the table on the color context", function () {
    const context = new ColorContext({ registry });

    expect(context.DVIPnames).toBeDefined();
    expect(context.DVIPnames.Gray).toEqual("#949698");
  });

  it("parses every name the expression matches", function () {
    const context = new ColorContext({ registry });
    const names = Object.keys(DVIPnames);

    // The expression is scoped to tex, so the names only resolve in that scope.
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const color = context.readColor(`{${name}}`, "tex");

      expect(color).toBeDefined();
      expect(color.isValid()).toBeTruthy();
      expect(`#${color.hex}`.toLowerCase()).toEqual(DVIPnames[name].toLowerCase());
    }
  });

  // The crash was here, not in readColor: the buffer scanner is what runs as the
  // package activates, so a name in an open file took activation down with it.
  it("scans a buffer holding one of the names without throwing", function () {
    let results;

    expect(function () {
      // bufferPath is not incidental: the scanner returns nothing without one.
      results = scanTextForColors("\\color{Gray}", {
        registry,
        scope: "tex",
        bufferPath: require("path").join(__dirname, "fixtures", "sample.tex"),
      });
    }).not.toThrow();

    expect(results.length).toBeGreaterThan(0);
    expect(`#${results[0].color.hex}`.toLowerCase()).toEqual(DVIPnames.Gray.toLowerCase());
  });
});
