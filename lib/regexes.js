/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { escapeRegExp } = require("./utils");

const int = "\\d+";
const decimal = `\\.${int}`;
const float = `(?:${int}${decimal}|${int}|${decimal})`;
const percent = `${float}%`;
const variables = "(?:@[a-zA-Z0-9\\-_]+|\\$[a-zA-Z0-9\\-_]+|[a-zA-Z_][a-zA-Z0-9\\-_]*)";
const namePrefixes = "^| |\\t|:|=|,|\\n|'|\"|`|\\(|\\[|\\{|>";

module.exports = {
  int,
  float,
  percent,
  optionalPercent: `${float}%?`,
  intOrPercent: `(?:${percent}|${int})`,
  floatOrPercent: `(?:${percent}|${float})`,
  comma: "\\s*,\\s*",
  // Argument edges belong to ps/comma/pe. Letting the argument consume those
  // same spaces gives a malformed function thousands of ways to partition a
  // whitespace run before it can fail. Internal whitespace and nested calls
  // remain part of the argument.
  notQuote: "[^\\s\"'`](?:[^\"'`\\n\\r]*[^\\s\"'`])?",
  hexadecimal: "[\\da-fA-F]",
  // The negative lookahead commits the whitespace to this opening delimiter
  // without adding a capture that would shift expression handlers' arguments.
  ps: "\\(\\s*(?!\\s)",
  pe: "\\s*\\)",
  variables,
  namePrefixes,
  createVariableRegExpString(variables) {
    let v;
    const variableNamesWithPrefix = [];
    const variableNamesWithoutPrefix = [];
    const withPrefixes = variables.filter((v) => !v.noNamePrefix);
    const withoutPrefixes = variables.filter((v) => v.noNamePrefix);

    const res = [];

    if (withPrefixes.length > 0) {
      for (v of withPrefixes) {
        variableNamesWithPrefix.push(escapeRegExp(v.name));
      }

      res.push(
        `((?:${namePrefixes})(${variableNamesWithPrefix.join("|")})(\\s+!default)?(?!_|-|\\w|\\d|[ \\t]*[\\.:=]))`,
      );
    }

    if (withoutPrefixes.length > 0) {
      for (v of withoutPrefixes) {
        variableNamesWithoutPrefix.push(escapeRegExp(v.name));
      }

      res.push(`(${variableNamesWithoutPrefix.join("|")})`);
    }

    return res.join("|");
  },
};
