/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const LineCounter = require("./line-counter");
let VariableParser;

module.exports = class VariableScanner {
  constructor(params = {}) {
    if (VariableParser == null) {
      VariableParser = require("./variable-parser");
    }

    ({ parser: this.parser, registry: this.registry, scope: this.scope } = params);
    if (this.parser == null) {
      this.parser = new VariableParser(this.registry);
    }
    this.lineCounter = new LineCounter();
  }

  getRegExp() {
    const source = this.registry.getRegExpForScope(this.scope);
    if (this.regexpSource !== source) {
      this.regexpSource = source;
      this.regexp = new RegExp(source, "gm");
    }
    return this.regexp;
  }

  search(text, start = 0) {
    let match;
    const regexp = this.getRegExp();
    if (this.regexpSource === "") return;
    regexp.lastIndex = start;

    while ((match = regexp.exec(text))) {
      var [matchText] = Array.from(match);
      var { index } = match;
      if (matchText.length === 0) {
        regexp.lastIndex = index + 1;
        continue;
      }

      var result = this.parser.parse(matchText);

      if (result != null) {
        result.lastIndex += index;

        if (result.length > 0) {
          result.range[0] += index;
          result.range[1] += index;

          for (var v of result) {
            v.range[0] += index;
            v.range[1] += index;
            v.line = this.lineCounter.lineAt(text, v.range[0]);
          }

          return result;
        } else {
          // A contributed handler can return no declarations without naming
          // an end offset. It must not send the same match around this loop.
          regexp.lastIndex = Math.max(
            regexp.lastIndex,
            Number.isFinite(result.lastIndex) ? result.lastIndex : 0,
          );
        }
      }
    }

    return undefined;
  }
};
