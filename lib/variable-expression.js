/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { escapeRegExp } = require("./utils");

module.exports = class VariableExpression {
  static DEFAULT_HANDLE(match, solver) {
    const [_, name, value] = Array.from(match);
    const start = match.indices[1][0] - match.index;
    const end = match.indices[2][1] - match.index;
    solver.appendResult(name, value, start, end);
    return solver.endParsing(end);
  }

  constructor({ name, regexpString, scopes, priority, handle }) {
    this.name = name;
    this.regexpString = regexpString;
    this.scopes = scopes;
    this.priority = priority;
    this.handle = handle;
    this.regexp = new RegExp(`${this.regexpString}`, "md");
    if (this.handle == null) {
      this.handle = this.constructor.DEFAULT_HANDLE;
    }
  }

  match(expression) {
    return this.regexp.test(expression);
  }

  parse(expression) {
    let parsingAborted = false;
    const results = [];

    const match = this.regexp.exec(expression);
    if (match != null) {
      const [matchText] = Array.from(match);

      const solver = {
        endParsing(end) {
          const start = expression.indexOf(matchText);
          results.lastIndex = end;
          results.range = [start, end];
          return (results.match = matchText.slice(start, end));
        },
        abortParsing() {
          return (parsingAborted = true);
        },
        appendResult(name, value, start, end, { isAlternate, noNamePrefix, isDefault } = {}) {
          const range = [start, end];
          const reName = escapeRegExp(name);
          if (!new RegExp(`${reName}(?![-_])`).test(value)) {
            return results.push({
              name,
              value,
              range,
              isAlternate,
              noNamePrefix,
              default: isDefault,
            });
          }
        },
      };

      this.handle(match, solver);
    }

    if (parsingAborted) {
      return undefined;
    } else {
      return results;
    }
  }
};
