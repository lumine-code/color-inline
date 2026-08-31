/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [
  Color,
  ColorParser,
  ColorExpression,
  SVGColors,
  DVIPnames,
  BlendModes,
  int,
  float,
  percent,
  optionalPercent,
  intOrPercent,
  floatOrPercent,
  comma,
  notQuote,
  hexadecimal,
  ps,
  pe,
  variables,
  namePrefixes,
  split,
  clamp,
  clampInt,
  scopeFromFileName,
] = Array.from([]);

module.exports = class ColorContext {
  constructor(options = {}) {
    let colorVariables;
    this.sortPaths = this.sortPaths.bind(this);
    if (Color == null) {
      Color = require("./color");
      SVGColors = require("./svg-colors");
      DVIPnames = require("./dvipnames");
      BlendModes = require("./blend-modes");
      if (ColorExpression == null) {
        ColorExpression = require("./color-expression");
      }

      ({
        int,
        float,
        percent,
        optionalPercent,
        intOrPercent,
        floatOrPercent,
        comma,
        notQuote,
        hexadecimal,
        ps,
        pe,
        variables,
        namePrefixes,
      } = require("./regexes"));

      ColorContext.prototype.SVGColors = SVGColors;
      ColorContext.prototype.DVIPnames = DVIPnames;
      ColorContext.prototype.Color = Color;
      ColorContext.prototype.BlendModes = BlendModes;
      ColorContext.prototype.int = int;
      ColorContext.prototype.float = float;
      ColorContext.prototype.percent = percent;
      ColorContext.prototype.optionalPercent = optionalPercent;
      ColorContext.prototype.intOrPercent = intOrPercent;
      ColorContext.prototype.floatOrPercent = floatOrPercent;
      ColorContext.prototype.comma = comma;
      ColorContext.prototype.notQuote = notQuote;
      ColorContext.prototype.hexadecimal = hexadecimal;
      ColorContext.prototype.ps = ps;
      ColorContext.prototype.pe = pe;
      ColorContext.prototype.variablesRE = variables;
      ColorContext.prototype.namePrefixes = namePrefixes;
    }

    ({
      variables,
      colorVariables,
      referenceVariable: this.referenceVariable,
      referencePath: this.referencePath,
      rootPaths: this.rootPaths,
      parser: this.parser,
      colorVars: this.colorVars,
      vars: this.vars,
      defaultVars: this.defaultVars,
      defaultColorVars: this.defaultColorVars,
      registry: this.registry,
      sassScopeSuffix: this.sassScopeSuffix,
    } = options);

    if (variables == null) {
      variables = [];
    }
    if (colorVariables == null) {
      colorVariables = [];
    }
    if (this.rootPaths == null) {
      this.rootPaths = [];
    }
    if (this.referenceVariable != null) {
      if (this.referencePath == null) {
        this.referencePath = this.referenceVariable.path;
      }
    }

    if (this.sorted) {
      this.variables = variables;
      this.colorVariables = colorVariables;
    } else {
      this.variables = variables.slice().sort(this.sortPaths);
      this.colorVariables = colorVariables.slice().sort(this.sortPaths);
    }

    if (this.vars == null) {
      let v;
      this.vars = {};
      this.colorVars = {};
      this.defaultVars = {};
      this.defaultColorVars = {};

      for (v of this.variables) {
        if (!v.default) {
          this.vars[v.name] = v;
        }
        if (v.default) {
          this.defaultVars[v.name] = v;
        }
      }

      for (v of this.colorVariables) {
        if (!v.default) {
          this.colorVars[v.name] = v;
        }
        if (v.default) {
          this.defaultColorVars[v.name] = v;
        }
      }
    }

    if (
      this.registry.getExpression("color-inline:variables") == null &&
      this.colorVariables.length > 0
    ) {
      const expr = ColorExpression.colorExpressionForColorVariables(this.colorVariables);
      this.registry.addExpression(expr);
    }

    if (this.parser == null) {
      if (ColorParser == null) {
        ColorParser = require("./color-parser");
      }
      this.parser = new ColorParser(this.registry, this);
    }

    this.usedVariables = [];
    this.resolvedVariables = [];
  }

  sortPaths(a, b) {
    if (this.referencePath != null) {
      if (a.path === b.path) {
        return 0;
      }
      if (a.path === this.referencePath) {
        return 1;
      }
      if (b.path === this.referencePath) {
        return -1;
      }

      const rootReference = this.rootPathForPath(this.referencePath);
      const rootA = this.rootPathForPath(a.path);
      const rootB = this.rootPathForPath(b.path);

      if (rootA === rootB) {
        return 0;
      }
      if (rootA === rootReference) {
        return 1;
      }
      if (rootB === rootReference) {
        return -1;
      }

      return 0;
    } else {
      return 0;
    }
  }

  rootPathForPath(path) {
    for (var root of this.rootPaths) {
      if (path.indexOf(`${root}/`) === 0) {
        return root;
      }
    }
  }

  clone() {
    return new ColorContext({
      variables: this.variables,
      colorVariables: this.colorVariables,
      referenceVariable: this.referenceVariable,
      parser: this.parser,
      vars: this.vars,
      colorVars: this.colorVars,
      defaultVars: this.defaultVars,
      defaultColorVars: this.defaultColorVars,
      sorted: true,
    });
  }

  //#    ##     ##    ###    ########   ######
  //#    ##     ##   ## ##   ##     ## ##    ##
  //#    ##     ##  ##   ##  ##     ## ##
  //#    ##     ## ##     ## ########   ######
  //#     ##   ##  ######### ##   ##         ##
  //#      ## ##   ##     ## ##    ##  ##    ##
  //#       ###    ##     ## ##     ##  ######

  containsVariable(variableName) {
    let needle;
    return ((needle = variableName), this.getVariablesNames().includes(needle));
  }

  hasColorVariables() {
    return this.colorVariables.length > 0;
  }

  getVariables() {
    return this.variables;
  }

  getColorVariables() {
    return this.colorVariables;
  }

  getVariablesNames() {
    return this.varNames != null ? this.varNames : (this.varNames = Object.keys(this.vars));
  }

  getVariablesCount() {
    return this.varCount != null
      ? this.varCount
      : (this.varCount = this.getVariablesNames().length);
  }

  readUsedVariables() {
    const usedVariables = [];
    for (var v of this.usedVariables) {
      if (!usedVariables.includes(v)) {
        usedVariables.push(v);
      }
    }
    this.usedVariables = [];
    this.resolvedVariables = [];
    return usedVariables;
  }

  //#    ##     ##    ###    ##       ##     ## ########  ######
  //#    ##     ##   ## ##   ##       ##     ## ##       ##    ##
  //#    ##     ##  ##   ##  ##       ##     ## ##       ##
  //#    ##     ## ##     ## ##       ##     ## ######    ######
  //#     ##   ##  ######### ##       ##     ## ##             ##
  //#      ## ##   ##     ## ##       ##     ## ##       ##    ##
  //#       ###    ##     ## ########  #######  ########  ######

  getValue(value) {
    let realValue, lastRealValue;
    const lookedUpValues = [value];

    while (
      (realValue = this.vars[value] != null ? this.vars[value].value : undefined) &&
      !lookedUpValues.includes(realValue)
    ) {
      this.usedVariables.push(value);
      value = lastRealValue = realValue;
      lookedUpValues.push(realValue);
    }

    if (lookedUpValues.includes(realValue)) {
      return undefined;
    } else {
      return lastRealValue;
    }
  }

  readColorExpression(value) {
    if (this.colorVars[value] != null) {
      this.usedVariables.push(value);
      return this.colorVars[value].value;
    } else if (this.defaultColorVars[value] != null) {
      this.usedVariables.push(value);
      return this.defaultColorVars[value].value;
    } else {
      return value;
    }
  }

  readColor(value, keepAllVariables = false) {
    if (this.usedVariables.includes(value) && !this.resolvedVariables.includes(value)) {
      return;
    }

    const realValue = this.readColorExpression(value);

    if (realValue == null || this.usedVariables.includes(realValue)) {
      return;
    }

    const scope =
      this.colorVars[value] != null ? this.scopeFromFileName(this.colorVars[value].path) : "*";

    this.usedVariables = this.usedVariables.filter((v) => v !== realValue);
    let result = this.parser.parse(realValue, scope, false);

    if (result != null) {
      if (result.invalid && this.defaultColorVars[realValue] != null) {
        result = this.readColor(this.defaultColorVars[realValue].value);
        value = realValue;
      }
    } else if (this.defaultColorVars[value] != null) {
      this.usedVariables.push(value);
      result = this.readColor(this.defaultColorVars[value].value);
    } else {
      if (this.vars[value] != null) {
        this.usedVariables.push(value);
      }
    }

    if (result != null) {
      this.resolvedVariables.push(value);
      if (keepAllVariables || !this.usedVariables.includes(value)) {
        result.variables = (result.variables != null ? result.variables : []).concat(
          this.readUsedVariables(),
        );
      }
    }

    return result;
  }

  scopeFromFileName(path) {
    if (scopeFromFileName == null) {
      scopeFromFileName = require("./scope-from-file-name");
    }

    let scope = scopeFromFileName(path);

    if (scope === "sass" || scope === "scss") {
      scope = [scope, this.sassScopeSuffix].join(":");
    }

    return scope;
  }

  readFloat(value) {
    let res = parseFloat(value);

    if (isNaN(res) && this.vars[value] != null) {
      this.usedVariables.push(value);
      res = this.readFloat(this.vars[value].value);
    }

    if (isNaN(res) && this.defaultVars[value] != null) {
      this.usedVariables.push(value);
      res = this.readFloat(this.defaultVars[value].value);
    }

    return res;
  }

  readInt(value, base = 10) {
    let res = parseInt(value, base);

    if (isNaN(res) && this.vars[value] != null) {
      this.usedVariables.push(value);
      res = this.readInt(this.vars[value].value);
    }

    if (isNaN(res) && this.defaultVars[value] != null) {
      this.usedVariables.push(value);
      res = this.readInt(this.defaultVars[value].value);
    }

    return res;
  }

  readPercent(value) {
    if (!/\d+/.test(value) && this.vars[value] != null) {
      this.usedVariables.push(value);
      value = this.readPercent(this.vars[value].value);
    }

    if (!/\d+/.test(value) && this.defaultVars[value] != null) {
      this.usedVariables.push(value);
      value = this.readPercent(this.defaultVars[value].value);
    }

    return Math.round(parseFloat(value) * 2.55);
  }

  readIntOrPercent(value) {
    let res;
    if (!/\d+/.test(value) && this.vars[value] != null) {
      this.usedVariables.push(value);
      value = this.readIntOrPercent(this.vars[value].value);
    }

    if (!/\d+/.test(value) && this.defaultVars[value] != null) {
      this.usedVariables.push(value);
      value = this.readIntOrPercent(this.defaultVars[value].value);
    }

    if (value == null) {
      return NaN;
    }
    if (typeof value === "number") {
      return value;
    }

    if (value.indexOf("%") !== -1) {
      res = Math.round(parseFloat(value) * 2.55);
    } else {
      res = parseInt(value);
    }

    return res;
  }

  readFloatOrPercent(value) {
    let res;
    if (!/\d+/.test(value) && this.vars[value] != null) {
      this.usedVariables.push(value);
      value = this.readFloatOrPercent(this.vars[value].value);
    }

    if (!/\d+/.test(value) && this.defaultVars[value] != null) {
      this.usedVariables.push(value);
      value = this.readFloatOrPercent(this.defaultVars[value].value);
    }

    if (value == null) {
      return NaN;
    }
    if (typeof value === "number") {
      return value;
    }

    if (value.indexOf("%") !== -1) {
      res = parseFloat(value) / 100;
    } else {
      res = parseFloat(value);
      if (res > 1) {
        res = res / 100;
      }
      res;
    }

    return res;
  }

  //#    ##     ## ######## #### ##        ######
  //#    ##     ##    ##     ##  ##       ##    ##
  //#    ##     ##    ##     ##  ##       ##
  //#    ##     ##    ##     ##  ##        ######
  //#    ##     ##    ##     ##  ##             ##
  //#    ##     ##    ##     ##  ##       ##    ##
  //#     #######     ##    #### ########  ######

  split(value) {
    if (split == null) {
      ({ split, clamp, clampInt } = require("./utils"));
    }
    return split(value);
  }

  clamp(value) {
    if (clamp == null) {
      ({ split, clamp, clampInt } = require("./utils"));
    }
    return clamp(value);
  }

  clampInt(value) {
    if (clampInt == null) {
      ({ split, clamp, clampInt } = require("./utils"));
    }
    return clampInt(value);
  }

  isInvalid(color) {
    return !Color.isValid(color);
  }

  readParam(param, block) {
    const re = new RegExp(`\\$(\\w+):\\s*((-?${this.float})|${this.variablesRE})`);
    if (re.test(param)) {
      const [_, name, value] = Array.from(re.exec(param));

      return block(name, value);
    }
  }

  contrast(base, dark = new Color("black"), light = new Color("white"), threshold = 0.43) {
    if (dark.luma > light.luma) {
      [light, dark] = Array.from([dark, light]);
    }

    if (base.luma > threshold) {
      return dark;
    } else {
      return light;
    }
  }

  mixColors(color1, color2, amount = 0.5, round = Math.floor) {
    if (color1 == null || color2 == null || !!isNaN(amount)) {
      return new Color(NaN, NaN, NaN, NaN);
    }

    const inverse = 1 - amount;
    const color = new Color();

    color.rgba = [
      round(color1.red * amount + color2.red * inverse),
      round(color1.green * amount + color2.green * inverse),
      round(color1.blue * amount + color2.blue * inverse),
      color1.alpha * amount + color2.alpha * inverse,
    ];

    return color;
  }
};

//#    ########  ########  ######   ######## ##     ## ########
//#    ##     ## ##       ##    ##  ##        ##   ##  ##     ##
//#    ##     ## ##       ##        ##         ## ##   ##     ##
//#    ########  ######   ##   #### ######      ###    ########
//#    ##   ##   ##       ##    ##  ##         ## ##   ##
//#    ##    ##  ##       ##    ##  ##        ##   ##  ##
//#    ##     ## ########  ######   ######## ##     ## ##
