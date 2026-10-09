/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const LineCounter = require("./line-counter");

module.exports = class ColorScanner {
  constructor({ context } = {}) {
    this.context = context;
    this.parser = this.context.parser;
    this.registry = this.context.registry;
    this.lineCounter = new LineCounter();
  }

  getRegExp() {
    return this.getRegExpForScope("none");
  }

  getRegExpForScope(scope) {
    const source = this.registry.getRegExpForScope(scope);
    if (this.regexpScope !== scope || this.regexpSource !== source) {
      this.regexpScope = scope;
      this.regexpSource = source;
      this.regexp = new RegExp(source, "g");
    }
    return this.regexp;
  }

  search(text, scope, start = 0) {
    let match;
    const regexp = this.getRegExpForScope(scope);
    regexp.lastIndex = start;

    while ((match = regexp.exec(text))) {
      // Service expressions can be zero-width. They have no colour text to
      // parse, and exec does not advance past them on its own.
      if (match[0].length === 0) {
        regexp.lastIndex = match.index + 1;
        continue;
      }
      let index;
      let [matchText] = Array.from(match);
      let { lastIndex } = regexp;

      const color = this.parser.parse(matchText, scope);

      if (!color) continue;

      if ((index = matchText.indexOf(color.colorExpression)) > 0) {
        lastIndex += -matchText.length + index + color.colorExpression.length;
        matchText = color.colorExpression;
      }

      return {
        color,
        match: matchText,
        lastIndex,
        range: [lastIndex - matchText.length, lastIndex],
        line: this.lineCounter.lineAt(text, lastIndex - matchText.length),
      };
    }
  }
};
