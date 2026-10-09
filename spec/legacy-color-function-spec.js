const path = require("node:path");
const fixtures = require("./fixtures/legacy-color-function.json");
const extraFixtures = require("./fixtures/legacy-color-function-extra.json");

describe("legacy CSS color() compatibility", () => {
  let context, registry;
  beforeEach(async () => {
    await lumine.packages.activatePackage(path.join(__dirname, ".."));
    registry = require("../lib/color-expressions");
    const ColorContext = require("../lib/color-context");
    context = new ColorContext({ registry });
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("color-inline");
  });

  for (const fixture of [...fixtures.rows, ...extraFixtures]) {
    it(`preserves the captured legacy result of ${fixture.input}`, () => {
      expect(context.parser.parse(fixture.input, "css").rgba).toEqual(fixture.rgba);
    });
  }
  it("retains variable substitution before applying nested adjusters", () => {
    const ColorContext = context.constructor;
    context = new ColorContext({
      registry,
      variables: [{ name: "var(--foo)", value: "#fd0cc7", path: "/contract.css" }],
    });
    expect(context.parser.parse("color(var(--foo) tint(66%))", "css").rgba).toEqual([
      254, 172, 236, 1,
    ]);
  });
  it("rejects an oversized legacy expression instead of parsing an unbounded string", () => {
    const result = context.parser.parse(`color(red ${" ".repeat(20000)}tint(50%))`, "css");
    expect(result?.isValid() ?? false).toBe(false);
  });
  it("rejects excessive legacy nesting", () => {
    const input = "color(".repeat(65) + "red" + ")".repeat(65);
    expect(context.parser.parse(input, "css")?.isValid() ?? false).toBe(false);
  });
  it("keeps malformed and unknown color or adjuster values invalid", () => {
    for (const input of [
      "color()",
      "color(wtf)",
      "color(red unknown(10%))",
      "color(red alpha())",
      "color(red tint(nope))",
    ]) {
      expect(context.parser.parse(input, "css")?.isValid() ?? false)
        .withContext(input)
        .toBe(false);
    }
  });
  it("does not extend base colors to additional Context formats", () => {
    for (const base of [
      "#1234",
      "#11223344",
      "hsv(120,100%,100%)",
      "vec3(1,0,0)",
      "rgb(255 0 0)",
      "rebecca_purple",
    ]) {
      expect(context.parser.parse(`color(${base})`, "css")?.isValid() ?? false)
        .withContext(base)
        .toBe(false);
    }
  });
  it("preserves the old rejection of direct functional blend targets", () => {
    for (const target of [
      "rgb(0,0,255)",
      "rgba(0, 0, 255, .5)",
      "hsl(240,100%,50%)",
      "hwb(240,0%,0%)",
    ]) {
      const input = `color(red blend(${target} 50%))`;
      expect(context.parser.parse(input, "css")?.isValid() ?? false)
        .withContext(input)
        .toBe(false);
    }
  });
});
