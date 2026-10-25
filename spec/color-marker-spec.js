/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Color = require("../lib/color");
const ColorMarker = require("../lib/color-marker");

describe("ColorMarker", function () {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let [editor, marker, colorMarker, _jasmineContent] = Array.from([]);

  beforeEach(function () {
    editor = lumine.workspace.buildTextEditor({});
    editor.setText(`\
body {
  color: hsva(0, 100%, 100%, 0.5);
  bar: foo;
  foo: bar;
}\
`);
    marker = editor.markBufferRange([
      [1, 9],
      [1, 33],
    ]);
    const color = new Color(255, 0, 0, 0.5);
    const text = "hsva(0, 100%, 100%, 0.5)";
    const colorBuffer = { editor };

    return (colorMarker = new ColorMarker({ marker, color, text, colorBuffer }));
  });

  describe("::copyContentAsHex", function () {
    beforeEach(() => colorMarker.copyContentAsHex());

    return it("write the hexadecimal version in the clipboard", () =>
      expect(lumine.clipboard.read()).toEqual("#ff0000"));
  });

  describe("::copyContentAsRGB", function () {
    beforeEach(() => colorMarker.copyContentAsRGB());

    return it("write the rgb version in the clipboard", () =>
      expect(lumine.clipboard.read()).toEqual("rgb(255, 0, 0)"));
  });

  describe("::copyContentAsRGBA", function () {
    beforeEach(() => colorMarker.copyContentAsRGBA());

    return it("write the rgba version in the clipboard", () =>
      expect(lumine.clipboard.read()).toEqual("rgba(255, 0, 0, 0.5)"));
  });

  describe("::copyContentAsHSL", function () {
    beforeEach(() => colorMarker.copyContentAsHSL());

    return it("write the hsl version in the clipboard", () =>
      expect(lumine.clipboard.read()).toEqual("hsl(0, 100%, 50%)"));
  });

  describe("::copyContentAsHSLA", function () {
    beforeEach(() => colorMarker.copyContentAsHSLA());

    return it("write the hsla version in the clipboard", () =>
      expect(lumine.clipboard.read()).toEqual("hsla(0, 100%, 50%, 0.5)"));
  });

  describe("::convertContentToHex", function () {
    beforeEach(() => colorMarker.convertContentToHex());

    return it("replaces the text in the editor by the hexadecimal version", () =>
      expect(editor.getText()).toEqual(`\
body {
  color: #ff0000;
  bar: foo;
  foo: bar;
}\
`));
  });

  describe("::convertContentToRGBA", function () {
    beforeEach(() => colorMarker.convertContentToRGBA());

    it("replaces the text in the editor by the rgba version", () =>
      expect(editor.getText()).toEqual(`\
body {
  color: rgba(255, 0, 0, 0.5);
  bar: foo;
  foo: bar;
}\
`));

    return describe("when the color alpha is 1", function () {
      beforeEach(function () {
        colorMarker.color.alpha = 1;
        return colorMarker.convertContentToRGBA();
      });

      return it("replaces the text in the editor by the rgba version", () =>
        expect(editor.getText()).toEqual(`\
body {
  color: rgba(255, 0, 0, 1);
  bar: foo;
  foo: bar;
}\
`));
    });
  });

  describe("::convertContentToRGB", function () {
    beforeEach(function () {
      colorMarker.color.alpha = 1;
      return colorMarker.convertContentToRGB();
    });

    it("replaces the text in the editor by the rgb version", () =>
      expect(editor.getText()).toEqual(`\
body {
  color: rgb(255, 0, 0);
  bar: foo;
  foo: bar;
}\
`));

    return describe("when the color alpha is not 1", function () {
      beforeEach(() => colorMarker.convertContentToRGB());

      return it("replaces the text in the editor by the rgb version", () =>
        expect(editor.getText()).toEqual(`\
body {
  color: rgb(255, 0, 0);
  bar: foo;
  foo: bar;
}\
`));
    });
  });

  describe("::convertContentToHSLA", function () {
    beforeEach(() => colorMarker.convertContentToHSLA());

    it("replaces the text in the editor by the hsla version", () =>
      expect(editor.getText()).toEqual(`\
body {
  color: hsla(0, 100%, 50%, 0.5);
  bar: foo;
  foo: bar;
}\
`));

    return describe("when the color alpha is 1", function () {
      beforeEach(function () {
        colorMarker.color.alpha = 1;
        return colorMarker.convertContentToHSLA();
      });

      return it("replaces the text in the editor by the hsla version", () =>
        expect(editor.getText()).toEqual(`\
body {
  color: hsla(0, 100%, 50%, 1);
  bar: foo;
  foo: bar;
}\
`));
    });
  });

  return describe("::convertContentToHSL", function () {
    beforeEach(function () {
      colorMarker.color.alpha = 1;
      return colorMarker.convertContentToHSL();
    });

    it("replaces the text in the editor by the hsl version", () =>
      expect(editor.getText()).toEqual(`\
body {
  color: hsl(0, 100%, 50%);
  bar: foo;
  foo: bar;
}\
`));

    return describe("when the color alpha is not 1", function () {
      beforeEach(() => colorMarker.convertContentToHSL());

      return it("replaces the text in the editor by the hsl version", () =>
        expect(editor.getText()).toEqual(`\
body {
  color: hsl(0, 100%, 50%);
  bar: foo;
  foo: bar;
}\
`));
    });
  });
});
