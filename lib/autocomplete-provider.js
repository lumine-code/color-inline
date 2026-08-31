// RegExp.escape is not available in this runtime yet.
const { escapeRegExp } = require("./utils");

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [CompositeDisposable, variablesRegExp, _] = Array.from([]);

module.exports = class ColorInlineProvider {
  constructor(colorInline) {
    this.colorInline = colorInline;
    if (CompositeDisposable == null) {
      ({ CompositeDisposable } = require("lumine"));
    }

    this.subscriptions = new CompositeDisposable();
    this.scopeSelector = lumine.config.get("color-inline.autocompleteScopes").join(",");

    // Domain-expert tier: the colors and color variables this project has
    // actually collected, offered only once a matching prefix is on the line.
    // See "Ranking" in autocomplete's `docs/autocomplete.provider.md`; left
    // unset, the default of 1 put them below the language server, the snippets
    // provider and the paths provider in the very files they were parsed from.
    this.suggestionPriority = 4;
    this.inclusionPriority = 2;

    this.subscriptions.add(
      lumine.config.observe("color-inline.autocompleteScopes", (scopes) => {
        return (this.scopeSelector = scopes.join(","));
      }),
    );
    this.subscriptions.add(
      lumine.config.observe(
        "color-inline.extendAutocompleteToVariables",
        (extendAutocompleteToVariables) => {
          this.extendAutocompleteToVariables = extendAutocompleteToVariables;
        },
      ),
    );
    this.subscriptions.add(
      lumine.config.observe(
        "color-inline.extendAutocompleteToColorValue",
        (extendAutocompleteToColorValue) => {
          this.extendAutocompleteToColorValue = extendAutocompleteToColorValue;
        },
      ),
    );

    this.subscriptions.add(
      lumine.config.observe(
        "color-inline.autocompleteSuggestionsFromValue",
        (autocompleteSuggestionsFromValue) => {
          this.autocompleteSuggestionsFromValue = autocompleteSuggestionsFromValue;
        },
      ),
    );
  }

  dispose() {
    this.disposed = true;
    this.subscriptions.dispose();
    return (this.colorInline = null);
  }

  getProject() {
    if (this.disposed) {
      return;
    }
    return this.colorInline.getProject();
  }

  getSuggestions({ editor, bufferPosition }) {
    let variables;
    if (this.disposed) {
      return;
    }
    const prefix = this.getPrefix(editor, bufferPosition);
    const project = this.getProject();

    if (!(prefix != null ? prefix.length : undefined)) {
      return;
    }
    if (project == null) {
      return;
    }

    if (this.extendAutocompleteToVariables) {
      variables = project.getVariables();
    } else {
      variables = project.getColorVariables();
    }

    const suggestions = this.findSuggestionsForPrefix(variables, prefix);
    return suggestions;
  }

  getPrefix(editor, bufferPosition) {
    if (variablesRegExp == null) {
      variablesRegExp = require("./regexes").variables;
    }
    const line = editor.getTextInRange([[bufferPosition.row, 0], bufferPosition]);

    if (this.autocompleteSuggestionsFromValue) {
      let left, left1, left2, left3;
      return (left =
        (left1 =
          (left2 =
            (left3 = __guard__(line.match(/(?:#[a-fA-F0-9]*|rgb.+)$/), (x) => x[0])) != null
              ? left3
              : __guard__(line.match(new RegExp(`(${variablesRegExp})$`)), (x1) => x1[0])) != null
            ? left2
            : __guard__(line.match(/:\s*([^\s].+)$/), (x2) => x2[1])) != null
          ? left1
          : __guard__(line.match(/^\s*([^\s].+)$/), (x3) => x3[1])) != null
        ? left
        : "";
    } else {
      return __guard__(line.match(new RegExp(`(${variablesRegExp})$`)), (x4) => x4[0]) || "";
    }
  }

  findSuggestionsForPrefix(variables, prefix) {
    if (variables == null) {
      return [];
    }

    const re = new RegExp(`^${escapeRegExp(prefix).replace(/,\s*/, "\\s*,\\s*")}`);

    const suggestions = [];
    const matchesColorValue = function (v) {
      let res = re.test(v.value);
      if (v.color != null) {
        if (!res) {
          res = v.color.suggestionValues.some((s) => re.test(s));
        }
      }
      return res;
    };

    const matchedVariables = variables.filter((v) => {
      return (
        (!v.isAlternate && re.test(v.name)) ||
        (this.autocompleteSuggestionsFromValue && matchesColorValue(v))
      );
    });

    matchedVariables.forEach((v) => {
      if (v.isColor) {
        const color = v.color.alpha === 1 ? "#" + v.color.hex : v.color.toCSS();
        let rightLabelHTML = `<span class='color-suggestion-preview' style='background: ${v.color.toCSS()}'></span>`;
        if (this.extendAutocompleteToColorValue) {
          rightLabelHTML = `${color} ${rightLabelHTML}`;
        }

        return suggestions.push({
          text: v.name,
          rightLabelHTML,
          replacementPrefix: prefix,
          className: "color-suggestion",
        });
      } else {
        return suggestions.push({
          text: v.name,
          rightLabel: v.value,
          replacementPrefix: prefix,
          className: "color-inline-suggestion",
        });
      }
    });

    return suggestions;
  }
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
