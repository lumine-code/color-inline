/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let registry;
const ExpressionsRegistry = require("./expressions-registry");
const VariableExpression = require("./variable-expression");

module.exports = registry = new ExpressionsRegistry(VariableExpression);

registry.createExpression(
  "color-inline:less",
  "^[ \\t]*(@[a-zA-Z0-9\\-_]+)\\s*:\\s*([^;\\n\\r]+);?",
  ["less"],
);

// It catches sequences like `@mixin foo($foo: 10)` and ignores them.
registry.createExpression(
  "color-inline:scss_params",
  "^[ \\t]*@(mixin|include|function)\\s+[a-zA-Z0-9\\-_]+\\s*\\([^\\)]+\\)",
  ["scss", "sass", "haml"],
  function (match, solver) {
    [match] = Array.from(match);
    return solver.endParsing(match.length - 1);
  },
);

const sass_handler = function (match, solver) {
  solver.appendResult(match[1], match[2], 0, match[0].length, { isDefault: match[3] != null });

  if (match[1].match(/[-_]/)) {
    const all_underscore = match[1].replace(/-/g, "_");
    const all_hyphen = match[1].replace(/_/g, "-");

    if (match[1] !== all_underscore) {
      solver.appendResult(all_underscore, match[2], 0, match[0].length, {
        isAlternate: true,
        isDefault: match[3] != null,
      });
    }
    if (match[1] !== all_hyphen) {
      solver.appendResult(all_hyphen, match[2], 0, match[0].length, {
        isAlternate: true,
        isDefault: match[3] != null,
      });
    }
  }

  return solver.endParsing(match[0].length);
};

registry.createExpression(
  "color-inline:scss",
  "^[ \\t]*(\\$[a-zA-Z0-9\\-_]+)\\s*:\\s*(.*?)(\\s*!default)?\\s*;",
  ["scss", "haml"],
  sass_handler,
);

registry.createExpression(
  "color-inline:sass",
  "^[ \\t]*(\\$[a-zA-Z0-9\\-_]+)\\s*:\\s*([^\\{]*?)(\\s*!default)?\\s*(?:$|\\/)",
  ["sass", "haml"],
  sass_handler,
);

registry.createExpression(
  "color-inline:css_vars",
  "(--[^\\s:;{}()\\[\\],'\"]+):\\s*([^\\n;]+);",
  ["css"],
  function (match, solver) {
    solver.appendResult(`var(${match[1]})`, match[2], 0, match[0].length);
    return solver.endParsing(match[0].length);
  },
);

registry.createExpression(
  "color-inline:stylus_hash",
  "^[ \\t]*([a-zA-Z_$][a-zA-Z0-9\\-_]*)\\s*=\\s*\\{([^=]*)\\}",
  ["styl", "stylus"],
  function (match, solver) {
    let content, name;
    let buffer = "";
    [match, name, content] = Array.from(match);
    let current = match.indexOf(content);
    const scope = [name];
    const scopeBegin = /\{/;
    const scopeEnd = /\}/;
    const commaSensitiveBegin = /\(|\[/;
    const commaSensitiveEnd = /\)|\]/;
    let inCommaSensitiveContext = false;
    for (var char of content) {
      if (scopeBegin.test(char)) {
        scope.push(buffer.replace(/[\s:]/g, ""));
        buffer = "";
      } else if (scopeEnd.test(char)) {
        scope.pop();
        if (scope.length === 0) {
          return solver.endParsing(current);
        }
      } else if (commaSensitiveBegin.test(char)) {
        buffer += char;
        inCommaSensitiveContext = true;
      } else if (inCommaSensitiveContext) {
        buffer += char;
        inCommaSensitiveContext = !commaSensitiveEnd.test(char);
      } else if (/[,\n]/.test(char)) {
        buffer = buffer.replace(/\s+/g, "");
        if (buffer.length) {
          var [key, value] = Array.from(buffer.split(/\s*:\s*/));

          solver.appendResult(
            scope.concat(key).join("."),
            value,
            current - buffer.length - 1,
            current,
          );
        }

        buffer = "";
      } else {
        buffer += char;
      }

      current++;
    }

    scope.pop();
    if (scope.length === 0) {
      return solver.endParsing(current + 1);
    } else {
      return solver.abortParsing();
    }
  },
);

registry.createExpression(
  "color-inline:stylus",
  "^[ \\t]*([a-zA-Z_$][a-zA-Z0-9\\-_]*)\\s*=(?!=)\\s*([^\\n\\r;]*);?$",
  ["styl", "stylus"],
);

registry.createExpression(
  "color-inline:latex",
  "\\\\definecolor(\\{[^\\}]+\\})\\{([^\\}]+)\\}\\{([^\\}]+)\\}",
  ["tex"],
  function (match, solver) {
    let [_, name, mode, value] = Array.from(match);

    value = (() => {
      switch (mode) {
        case "RGB":
          return `rgb(${value})`;
        case "gray":
          return `gray(${Math.round(parseFloat(value) * 100)}%)`;
        case "rgb":
          var values = value.split(",").map((n) => Math.floor(n * 255));
          return `rgb(${values.join(",")})`;
        case "cmyk":
          return `cmyk(${value})`;
        case "HTML":
          return `#${value}`;
        default:
          return value;
      }
    })();

    solver.appendResult(name, value, 0, _.length, { noNamePrefix: true });
    return solver.endParsing(_.length);
  },
);

registry.createExpression(
  "color-inline:latex_mix",
  "\\\\definecolor(\\{[^\\}]+\\})(\\{[^\\}\\n!]+[!][^\\}\\n]+\\})",
  ["tex"],
  function (match, solver) {
    const [_, name, value] = Array.from(match);

    solver.appendResult(name, value, 0, _.length, { noNamePrefix: true });
    return solver.endParsing(_.length);
  },
);

registry.createExpression(
  "color-inline:javascript",
  "^[ \\t]*(var|let|const)\\s+([a-zA-Z0-9_]+)\\s*=\\s*['\"`](.*?)['\"`]",
  ["js"],
  function (match, solver) {
    solver.appendResult(match[2], match[3], 0, match[0].length, { noNamePrefix: true });
    return solver.endParsing(match[0].length);
  },
);
