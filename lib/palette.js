/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

module.exports = class Palette {
  static deserialize(state) {
    return new Palette(state.variables);
  }

  constructor(variables = []) {
    this.variables = variables;
  }

  getTitle() {
    return "Palette";
  }

  getURI() {
    return "color-inline://palette";
  }

  getIconName() {
    return "color-inline";
  }

  sortedByColor() {
    return this.variables.slice().sort(({ color: a }, { color: b }) => this.compareColors(a, b));
  }

  sortedByName() {
    const collator = new Intl.Collator("en-US", { numeric: true });
    return this.variables.slice().sort(({ name: a }, { name: b }) => collator.compare(a, b));
  }

  getColorsNames() {
    return this.variables.map((v) => v.name);
  }

  getColorsCount() {
    return this.variables.length;
  }

  eachColor(iterator) {
    return this.variables.map((v) => iterator(v));
  }

  compareColors(a, b) {
    const [aHue, aSaturation, aLightness] = Array.from(a.hsl);
    const [bHue, bSaturation, bLightness] = Array.from(b.hsl);
    if (aHue < bHue) {
      return -1;
    } else if (aHue > bHue) {
      return 1;
    } else if (aSaturation < bSaturation) {
      return -1;
    } else if (aSaturation > bSaturation) {
      return 1;
    } else if (aLightness < bLightness) {
      return -1;
    } else if (aLightness > bLightness) {
      return 1;
    } else {
      return 0;
    }
  }

  serialize() {
    return {
      deserializer: "Palette",
      variables: this.variables,
    };
  }
};
