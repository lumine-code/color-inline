const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
describe("autocomplete provider for CSS-like files", function () {
  let [
    completionDelay,
    editor,
    editorView,
    colors,
    autocompleteMain,
    autocompleteManager,
    jasmineContent,
    project,
  ] = Array.from([]);

  beforeEach(async function () {
    await runs(async function () {
      jasmineContent = document.body.querySelector("#jasmine-content");

      lumine.config.set("color-inline.autocompleteScopes", ["*"]);
      lumine.config.set("color-inline.sourceNames", ["**/*.styl", "**/*.less"]);
      // The only `@`-prefixed variables in the fixtures are in a LESS file
      // under a `vendor` directory, which the default ignores -- that fixture
      // is what the ignore specs are about. Nothing here is testing the
      // ignores, so they are turned off rather than worked around.
      lumine.config.set("color-inline.ignoredNames", []);

      // Set to live completion
      lumine.config.set("autocomplete.enableAutoActivation", true);
      // Set the completion delay
      completionDelay = 100;
      lumine.config.set("autocomplete.autoActivationDelay", completionDelay);
      completionDelay += 100; // Rendering delay
      const workspaceElement = lumine.views.getView(lumine.workspace);

      return jasmineContent.appendChild(workspaceElement);
    });

    await waitsForPromise("autocomplete activation", () =>
      lumine.packages
        .activatePackage("autocomplete")
        .then((pkg) => (autocompleteMain = pkg.mainModule)),
    );

    await waitsForPromise("colors activation", () =>
      lumine.packages.activatePackage("color-inline").then((pkg) => (colors = pkg.mainModule)),
    );

    await runs(async function () {
      spyOn(autocompleteMain, "consumeAutocomplete").and.callThrough();
      return spyOn(colors, "provideAutocomplete").and.callThrough();
    });

    await waitsForPromise("open sample file", () =>
      lumine.workspace.open("sample.styl").then(function (e) {
        editor = e;
        editor.setText("");
        return (editorView = lumine.views.getView(editor));
      }),
    );

    await waitsForPromise("colors project initialized", function () {
      project = colors.getProject();
      return project.initialize();
    });

    await runs(async function () {
      ({ autocompleteManager } = autocompleteMain);
      spyOn(autocompleteManager, "findSuggestions").and.callThrough();
      return spyOn(autocompleteManager, "displaySuggestions").and.callThrough();
    });
  });

  describe("writing the name of a color", function () {
    it("returns suggestions for the matching colors", async function () {
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("border: 1px solid ");
        editor.moveToBottom();
        editor.insertText("b");
        editor.insertText("a");

        return advanceClock(completionDelay);
      });

      await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

      await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

      await runs(async function () {
        const popup = editorView.querySelector("autocomplete-suggestion-list");
        expect(popup).toExist();
        expect(popup.querySelector("span.word").textContent).toEqual("base-color");

        const preview = popup.querySelector(".color-suggestion-preview");
        expect(preview).toExist();
        return expect(preview.style.background).toEqual("rgb(255, 255, 255)");
      });
    });

    it("replaces the prefix even when it contains a @", async function () {
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("@");
        editor.insertText("b");
        editor.insertText("a");

        return advanceClock(completionDelay);
      });

      await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

      await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

      await runs(async function () {
        lumine.commands.dispatch(editorView, "autocomplete:confirm");
        return expect(editor.getText()).not.toContain("@@");
      });
    });

    it("replaces the prefix even when it contains a $", async function () {
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("$");
        editor.insertText("o");
        editor.insertText("t");

        return advanceClock(completionDelay);
      });

      await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

      await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

      await runs(async function () {
        lumine.commands.dispatch(editorView, "autocomplete:confirm");
        expect(editor.getText()).toContain("$other-color");
        return expect(editor.getText()).not.toContain("$$");
      });
    });

    return describe("when the extendAutocompleteToColorValue setting is enabled", function () {
      beforeEach(async () =>
        lumine.config.set("color-inline.extendAutocompleteToColorValue", true),
      );

      describe("with an opaque color", () =>
        it("displays the color hexadecimal code in the completion item", async function () {
          await runs(async function () {
            expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

            editor.moveToBottom();
            editor.insertText("b");
            editor.insertText("a");
            editor.insertText("s");

            return advanceClock(completionDelay);
          });

          await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

          await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

          await runs(async function () {
            const popup = editorView.querySelector("autocomplete-suggestion-list");
            expect(popup).toExist();
            expect(popup.querySelector("span.word").textContent).toEqual("base-color");

            return expect(popup.querySelector("span.right-label").textContent).toContain("#ffffff");
          });
        }));

      describe("when the autocompleteSuggestionsFromValue setting is enabled", function () {
        beforeEach(async () =>
          lumine.config.set("color-inline.autocompleteSuggestionsFromValue", true),
        );

        it("suggests color variables from hexadecimal values", async function () {
          await runs(async function () {
            expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

            editor.moveToBottom();
            editor.insertText("#");
            editor.insertText("f");
            editor.insertText("f");

            return advanceClock(completionDelay);
          });

          await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

          await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

          await runs(async function () {
            const popup = editorView.querySelector("autocomplete-suggestion-list");
            expect(popup).toExist();
            expect(popup.querySelector("span.word").textContent).toEqual("var1");

            return expect(popup.querySelector("span.right-label").textContent).toContain("#ffffff");
          });
        });

        it("suggests color variables from hexadecimal values when in a CSS expression", async function () {
          await runs(async function () {
            expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

            editor.moveToBottom();
            editor.insertText("border: 1px solid ");
            editor.moveToBottom();
            editor.insertText("#");
            editor.insertText("f");
            editor.insertText("f");

            return advanceClock(completionDelay);
          });

          await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

          await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

          await runs(async function () {
            const popup = editorView.querySelector("autocomplete-suggestion-list");
            expect(popup).toExist();
            expect(popup.querySelector("span.word").textContent).toEqual("var1");

            return expect(popup.querySelector("span.right-label").textContent).toContain("#ffffff");
          });
        });

        it("suggests color variables from rgb values", async function () {
          await runs(async function () {
            expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

            editor.moveToBottom();
            editor.insertText("border: 1px solid ");
            editor.moveToBottom();
            editor.insertText("r");
            editor.insertText("g");
            editor.insertText("b");
            editor.insertText("(");
            editor.insertText("2");
            editor.insertText("5");
            editor.insertText("5");
            editor.insertText(",");
            editor.insertText(" ");

            return advanceClock(completionDelay);
          });

          await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

          await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

          await runs(async function () {
            const popup = editorView.querySelector("autocomplete-suggestion-list");
            expect(popup).toExist();
            expect(popup.querySelector("span.word").textContent).toEqual("var1");

            return expect(popup.querySelector("span.right-label").textContent).toContain("#ffffff");
          });
        });

        return describe("and when extendAutocompleteToVariables is true", function () {
          beforeEach(async () =>
            lumine.config.set("color-inline.extendAutocompleteToVariables", true),
          );

          return it("returns suggestions for the matching variable value", async function () {
            await runs(async function () {
              expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

              editor.moveToBottom();
              editor.insertText("border: ");
              editor.moveToBottom();
              editor.insertText("6");
              editor.insertText("p");
              editor.insertText("x");
              editor.insertText(" ");

              return advanceClock(completionDelay);
            });

            await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

            await waitsFor(
              () => editorView.querySelector("autocomplete-suggestion-list li") != null,
            );

            await runs(async function () {
              const popup = editorView.querySelector("autocomplete-suggestion-list");
              expect(popup).toExist();
              expect(popup.querySelector("span.word").textContent).toEqual("button-padding");

              return expect(popup.querySelector("span.right-label").textContent).toEqual("6px 8px");
            });
          });
        });
      });

      return describe("with a transparent color", () =>
        it("displays the color hexadecimal code in the completion item", async function () {
          await runs(async function () {
            expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

            editor.moveToBottom();
            editor.insertText("$");
            editor.insertText("o");
            editor.insertText("t");

            return advanceClock(completionDelay);
          });

          await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

          await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

          await runs(async function () {
            const popup = editorView.querySelector("autocomplete-suggestion-list");
            expect(popup).toExist();
            expect(popup.querySelector("span.word").textContent).toEqual("$other-color");

            return expect(popup.querySelector("span.right-label").textContent).toContain(
              "rgba(255,0,0,0.5)",
            );
          });
        }));
    });
  });

  describe("writing the name of a non-color variable", () =>
    it("returns suggestions for the matching variable", async function () {
      lumine.config.set("color-inline.extendAutocompleteToVariables", false);
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("f");
        editor.insertText("o");
        editor.insertText("o");

        return advanceClock(completionDelay);
      });

      await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

      await runs(() =>
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist(),
      );
    }));

  return describe("when extendAutocompleteToVariables is true", function () {
    beforeEach(async () => lumine.config.set("color-inline.extendAutocompleteToVariables", true));

    return describe("writing the name of a non-color variable", () =>
      it("returns suggestions for the matching variable", async function () {
        await runs(async function () {
          expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

          editor.moveToBottom();
          editor.insertText("b");
          editor.insertText("u");
          editor.insertText("t");
          editor.insertText("t");
          editor.insertText("o");
          editor.insertText("n");
          editor.insertText("-");
          editor.insertText("p");

          return advanceClock(completionDelay);
        });

        await waitsFor(() => autocompleteManager.displaySuggestions.calls.count() === 1);

        await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

        await runs(async function () {
          const popup = editorView.querySelector("autocomplete-suggestion-list");
          expect(popup).toExist();
          expect(popup.querySelector("span.word").textContent).toEqual("button-padding");

          return expect(popup.querySelector("span.right-label").textContent).toEqual("6px 8px");
        });
      }));
  });
});

describe("autocomplete provider for Sass files", function () {
  let [
    completionDelay,
    editor,
    editorView,
    colors,
    autocompleteMain,
    autocompleteManager,
    jasmineContent,
    project,
  ] = Array.from([]);

  return describe("for sass files", function () {
    beforeEach(async function () {
      await runs(async function () {
        jasmineContent = document.body.querySelector("#jasmine-content");

        lumine.config.set("color-inline.autocompleteScopes", ["*"]);
        lumine.config.set("color-inline.sourceNames", ["**/*.sass", "**/*.scss"]);

        // Set to live completion
        lumine.config.set("autocomplete.enableAutoActivation", true);
        // Set the completion delay
        completionDelay = 100;
        lumine.config.set("autocomplete.autoActivationDelay", completionDelay);
        completionDelay += 100; // Rendering delay
        const workspaceElement = lumine.views.getView(lumine.workspace);

        return jasmineContent.appendChild(workspaceElement);
      });

      await waitsForPromise("autocomplete activation", () =>
        lumine.packages
          .activatePackage("autocomplete")
          .then((pkg) => (autocompleteMain = pkg.mainModule)),
      );

      await waitsForPromise("colors activation", () =>
        lumine.packages.activatePackage("color-inline").then((pkg) => (colors = pkg.mainModule)),
      );

      await runs(async function () {
        spyOn(autocompleteMain, "consumeAutocomplete").and.callThrough();
        return spyOn(colors, "provideAutocomplete").and.callThrough();
      });

      await waitsForPromise("open sample file", () =>
        lumine.workspace.open("sample.styl").then(function (e) {
          editor = e;
          return (editorView = lumine.views.getView(editor));
        }),
      );

      await waitsForPromise("colors project initialized", function () {
        project = colors.getProject();
        return project.initialize();
      });

      await runs(async function () {
        ({ autocompleteManager } = autocompleteMain);
        spyOn(autocompleteManager, "findSuggestions").and.callThrough();
        return spyOn(autocompleteManager, "displaySuggestions").and.callThrough();
      });
    });

    return it("does not display the alternate sass version", async function () {
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("$");
        editor.insertText("b");
        editor.insertText("a");

        return advanceClock(completionDelay);
      });

      await waitsFor(
        "suggestions displayed callback",
        () => autocompleteManager.displaySuggestions.calls.count() === 1,
      );

      await waitsFor(
        "autocomplete lis",
        () => editorView.querySelector("autocomplete-suggestion-list li") != null,
      );

      await runs(async function () {
        const lis = editorView.querySelectorAll("autocomplete-suggestion-list li");
        const hasAlternate = Array.prototype.some.call(
          lis,
          (li) => li.querySelector("span.word").textContent === "$base_color",
        );

        return expect(hasAlternate).toBeFalsy();
      });
    });
  });
});
