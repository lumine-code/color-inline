const ExpressionsRegistry = require("../lib/expressions-registry");
const ColorExpression = require("../lib/color-expression");
const ColorContext = require("../lib/color-context");
const ColorScanner = require("../lib/color-scanner");

describe("Contributed scanner lookahead from upstream issue375", () => {
  it("skips a substring that cannot independently parse and continues to the next color", () => {
    const registry = new ExpressionsRegistry(ColorExpression);
    registry.createExpression(
      "audit:wow",
      "\\|c([\\da-fA-F]{8}).*?(?:(?=\\|c)|\\|r)",
      ["*"],
      function (match) {
        this.hexARGB = match[1];
      },
    );
    try {
      const context = new ColorContext({ registry });
      const scanner = new ColorScanner({ context });
      const first = "|cffffffffHello";
      const second = "|c12345678World|r";
      expect(context.parser.parse(first)).toBeUndefined();
      expect(context.parser.parse(second).rgba).toEqual([52, 86, 120, 18 / 255]);
      const result = scanner.search(first + second, "*");
      expect(result.match).toBe(second);
      expect(result.color.rgba).toEqual([52, 86, 120, 18 / 255]);
    } finally {
      registry.dispose();
    }
  });
});
