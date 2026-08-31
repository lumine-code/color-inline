/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [createVariableRegExpString, Color] = Array.from([]);

module.exports = class ColorExpression {
  static colorExpressionForContext(context) {
    return this.colorExpressionForColorVariables(context.getColorVariables());
  }

  static colorExpressionRegexpForColorVariables(colorVariables) {
    if (createVariableRegExpString == null) {
      ({ createVariableRegExpString } = require("./regexes"));
    }

    return createVariableRegExpString(colorVariables);
  }

  static colorExpressionForColorVariables(colorVariables) {
    const paletteRegexpString = this.colorExpressionRegexpForColorVariables(colorVariables);

    return new ColorExpression({
      name: "color-inline:variables",
      regexpString: paletteRegexpString,
      scopes: ["*"],
      priority: 1,
      handle(match, expression, context) {
        let _, name;
        [_, _, name] = Array.from(match);

        if (name == null) {
          name = match[0];
        }

        const evaluated = context.readColorExpression(name);
        if (evaluated === name) {
          return (this.invalid = true);
        }

        const baseColor = context.readColor(evaluated);
        this.colorExpression = name;
        this.variables = baseColor != null ? baseColor.variables : undefined;

        if (context.isInvalid(baseColor)) {
          return (this.invalid = true);
        }

        return (this.rgba = baseColor.rgba);
      },
    });
  }

  constructor({ name, regexpString, scopes, priority, handle }) {
    this.name = name;
    this.regexpString = regexpString;
    this.scopes = scopes;
    this.priority = priority;
    this.handle = handle;
    this.regexp = new RegExp(`^${this.regexpString}$`);
  }

  match(expression) {
    return this.regexp.test(expression);
  }

  parse(expression, context) {
    if (!this.match(expression)) {
      return null;
    }

    if (Color == null) {
      Color = require("./color");
    }

    const color = new Color();
    color.colorExpression = expression;
    color.expressionHandler = this.name;
    this.handle.call(color, this.regexp.exec(expression), expression, context);
    return color;
  }

  search(text, start = 0) {
    let match, ref;
    let results = undefined;
    const re = new RegExp(this.regexpString, "g");
    re.lastIndex = start;
    if ((([match] = Array.from((ref = re.exec(text)))), ref)) {
      const { lastIndex } = re;
      const range = [lastIndex - match.length, lastIndex];
      results = {
        range,
        match: text.slice(range[0], range[1]),
      };
    }

    return results;
  }
};
