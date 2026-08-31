/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { ColorInlineElement, defineElement } = require("./element");
let CompositeDisposable = null;

const capitalize = (s) => s.replace(/^./, (m) => m.toUpperCase());

class ColorProjectElement extends ColorInlineElement {
  static content() {
    const arrayField = (name, label, setting, description) => {
      const settingName = `color-inline.${name}`;

      return this.div({ class: "control-group array" }, () => {
        return this.div({ class: "controls" }, () => {
          this.label({ class: "control-label" }, () => {
            return this.span({ class: "setting-title" }, label);
          });

          return this.div({ class: "control-wrapper" }, () => {
            this.tag("lumine-text-editor", {
              mini: true,
              outlet: name,
              type: "array",
              property: name,
            });
            return this.div({ class: "setting-description" }, () => {
              this.div(() => {
                this.raw(
                  `Global config: <code>${lumine.config.get(setting != null ? setting : settingName).join(", ")}</code>`,
                );

                if (description != null) {
                  return this.p(() => this.raw(description));
                }
              });

              return booleanField(`ignoreGlobal${capitalize(name)}`, "Ignore Global", null, true);
            });
          });
        });
      });
    };

    const selectField = (name, label, { options, setting, description, useBoolean } = {}) => {
      const settingName = `color-inline.${name}`;

      return this.div({ class: "control-group array" }, () => {
        return this.div({ class: "controls" }, () => {
          this.label({ class: "control-label" }, () => {
            return this.span({ class: "setting-title" }, label);
          });

          return this.div({ class: "control-wrapper" }, () => {
            this.select({ outlet: name, class: "form-control", required: true }, () => {
              return options.forEach((option) => {
                if (option === "") {
                  return this.option({ value: option }, "Use global config");
                } else {
                  return this.option({ value: option }, capitalize(option));
                }
              });
            });

            return this.div({ class: "setting-description" }, () => {
              this.div(() => {
                this.raw(
                  `Global config: <code>${lumine.config.get(setting != null ? setting : settingName)}</code>`,
                );

                if (description != null) {
                  return this.p(() => this.raw(description));
                }
              });

              if (useBoolean) {
                return booleanField(`ignoreGlobal${capitalize(name)}`, "Ignore Global", null, true);
              }
            });
          });
        });
      });
    };

    var booleanField = (name, label, description, nested) => {
      return this.div({ class: "control-group boolean" }, () => {
        return this.div({ class: "controls" }, () => {
          this.input({ type: "checkbox", id: `color-inline-${name}`, outlet: name });
          this.label({ class: "control-label", for: `color-inline-${name}` }, () => {
            return this.span({ class: nested ? "setting-description" : "setting-title" }, label);
          });

          if (description != null) {
            return this.div({ class: "setting-description" }, () => {
              return this.raw(description);
            });
          }
        });
      });
    };

    return this.section({ class: "settings-view pane-item" }, () => {
      return this.div({ class: "settings-wrapper" }, () => {
        this.div({ class: "header" }, () => {
          return this.p(
            { class: "setting-description" },
            `\
These settings apply on the current project only and are complementary
to the package settings.\
`,
          );
        });

        return this.div({ class: "fields" }, () => {
          const themes = lumine.themes.getActiveThemeNames();
          arrayField("sourceNames", "Source Names");
          arrayField("ignoredNames", "Ignored Names");
          arrayField("supportedFiletypes", "Supported Filetypes");
          arrayField("ignoredScopes", "Ignored Scopes");
          arrayField("searchNames", "Extended Search Names", "color-inline.extendedSearchNames");
          selectField("sassShadeAndTintImplementation", "Sass Shade And Tint Implementation", {
            options: ["", "compass", "bourbon"],
            setting: "color-inline.sassShadeAndTintImplementation",
            description:
              "Sass doesn't provide any implementation for shade and tint function, and Compass and Bourbon have different implementation for these two methods. This setting allow you to chose which implementation use.",
          });

          return booleanField(
            "includeThemes",
            "Include Lumine Themes Stylesheets",
            `\
The variables from <code>${themes[0]}</code> and
<code>${themes[1]}</code> themes will be automatically added to the
project palette.\
`,
          );
        });
      });
    });
  }

  createdCallback() {
    if (CompositeDisposable == null) {
      ({ CompositeDisposable } = require("lumine"));
    }

    return (this.subscriptions = new CompositeDisposable());
  }

  setModel(project) {
    this.project = project;
    return this.initializeBindings();
  }

  initializeBindings() {
    const grammar = lumine.grammars.grammarForScopeName("source.js.regexp");
    this.ignoredScopes.getModel().setGrammar(grammar);

    this.initializeTextEditor("sourceNames");
    this.initializeTextEditor("searchNames");
    this.initializeTextEditor("ignoredNames");
    this.initializeTextEditor("ignoredScopes");
    this.initializeTextEditor("supportedFiletypes");
    this.initializeCheckbox("includeThemes");
    this.initializeCheckbox("ignoreGlobalSourceNames");
    this.initializeCheckbox("ignoreGlobalIgnoredNames");
    this.initializeCheckbox("ignoreGlobalIgnoredScopes");
    this.initializeCheckbox("ignoreGlobalSearchNames");
    this.initializeCheckbox("ignoreGlobalSupportedFiletypes");
    return this.initializeSelect("sassShadeAndTintImplementation");
  }

  initializeTextEditor(name) {
    const capitalizedName = capitalize(name);
    const editor = this[name].getModel();

    editor.setText((this.project[name] != null ? this.project[name] : []).join(", "));

    return this.subscriptions.add(
      editor.onDidStopChanging(() => {
        const array = editor
          .getText()
          .split(/\s*,\s*/g)
          .filter((s) => s.length > 0);
        return this.project[`set${capitalizedName}`](array);
      }),
    );
  }

  initializeSelect(name) {
    const capitalizedName = capitalize(name);
    const select = this[name];
    const optionValues = [].slice.call(select.querySelectorAll("option")).map((o) => o.value);

    if (this.project[name]) {
      select.selectedIndex = optionValues.indexOf(this.project[name]);
    }

    return this.subscriptions.add(
      this.subscribeTo(select, {
        change: () => {
          const value =
            select.selectedOptions[0] != null ? select.selectedOptions[0].value : undefined;
          return this.project[`set${capitalizedName}`](value === "" ? null : value);
        },
      }),
    );
  }

  initializeCheckbox(name) {
    const capitalizedName = capitalize(name);
    const checkbox = this[name];
    checkbox.checked = this.project[name];

    return this.subscriptions.add(
      this.subscribeTo(checkbox, {
        change: () => {
          return this.project[`set${capitalizedName}`](checkbox.checked);
        },
      }),
    );
  }

  getTitle() {
    return "Project Settings";
  }

  getURI() {
    return "color-inline://settings";
  }

  getIconName() {
    return "color-inline";
  }

  serialize() {
    return { deserializer: "ColorProjectElement" };
  }
}

module.exports = defineElement("color-inline-color-project", ColorProjectElement);
