/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const registry = require("../../lib/color-expressions");
const ColorInline = require("../../lib/main");

const deserializers = {
  Palette: "deserializePalette",
  ColorSearch: "deserializeColorSearch",
  ColorProject: "deserializeColorProject",
  ColorProjectElement: "deserializeColorProjectElement",
  VariablesCollection: "deserializeVariablesCollection",
};

beforeEach(function () {
  lumine.config.set("color-inline.markerType", "background");
  lumine.views.addViewProvider(ColorInline.colorInlineViewProvider);

  for (var k in deserializers) {
    var v = deserializers[k];
    lumine.deserializers.add({ name: k, deserialize: ColorInline[v] });
  }

  registry.removeExpression("color-inline:variables");

  const jasmineContent = document.body.querySelector("#jasmine-content");
  jasmineContent.style.width = "100%";
  return (jasmineContent.style.height = "100%");
});

afterEach(() => registry.removeExpression("color-inline:variables"));
