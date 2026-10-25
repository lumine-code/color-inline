const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const path = require("path");
const AUTOCOMPLETE_PATH = path.join(__dirname, "..", "..", "autocomplete");

// A request can publish several partial lists before its final list is ready.
async function waitForCurrentColorRequest(manager, editor, colors) {
  let request, completion;
  await waitsFor(() => {
    const current = manager.getSuggestionsFromProviders.calls.mostRecent();
    if (
      current?.args[0]?.editor !== editor ||
      !current.args[0].bufferPosition.isEqual(editor.getCursorBufferPosition()) ||
      typeof current.returnValue?.then !== "function"
    )
      return false;
    if (current !== request) {
      request = current;
      const observed = (completion = { settled: false });
      Promise.resolve(request.returnValue).then(
        () => (observed.settled = true),
        (error) => {
          observed.error = error;
          observed.rejected = true;
          observed.settled = true;
        },
      );
    }
    if (completion.rejected) throw completion.error;
    return completion.settled;
  });
  await request.returnValue;
  expect(manager.getSuggestionsFromProviders.calls.mostRecent()).toBe(request);
  expect(manager.editor).toBe(editor);
  expect(manager.suggestionContext.isCurrent()).toBe(true);
  const colorRequest = colors.autocompleteProviderValue.getSuggestions.calls.mostRecent();
  expect(colorRequest?.args[0]?.editor).toBe(editor);
  expect(colorRequest?.args[0]?.bufferPosition).toEqual(editor.getCursorBufferPosition());
  if (Array.isArray(colorRequest?.returnValue) && colorRequest.returnValue.length) {
    expect(
      manager.suggestionList.items.some((item) => item.provider === colors.autocompleteProvider),
    ).toBe(true);
  }
}

describe("autocomplete provider for CSS-like files", function () {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

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
        .activatePackage(AUTOCOMPLETE_PATH)
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
      spyOn(autocompleteManager, "getSuggestionsFromProviders").and.callThrough();
      spyOn(colors.autocompleteProviderValue, "getSuggestions").and.callThrough();
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

        await waitsFor(() => autocompleteManager.delayTimeout != null);

        return advanceClock(completionDelay);
      });

      await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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
      const provider = colors.autocompleteProviderValue;
      const providerRequests = provider?.getSuggestions;
      const requests = autocompleteManager.getSuggestionsFromProviders;
      const displayCalls = autocompleteManager.displaySuggestions.calls;
      const findCalls = autocompleteManager.findSuggestions.calls;
      const snapshots = [];
      let stage = "typing";
      const snapshot = (label) => {
        const preparation = autocompleteManager.completionPreparation;
        snapshots.push({
          label,
          at: performance.now(),
          text: editor.getText(),
          cursor: editor.getCursorBufferPosition().toArray(),
          managerHasEditor: autocompleteManager.editor === editor,
          workspaceHasEditor: lumine.workspace.getActiveTextEditor() === editor,
          focusedEditor: document.activeElement?.closest("lumine-text-editor") === editorView,
          focusedTag: document.activeElement?.tagName,
          connected: editorView.isConnected,
          documentFocused: document.hasFocus(),
          mode: editor.getBuffer().getLanguageMode().constructor.name,
          grammar: editor.getGrammar().scopeName,
          displayCalls: displayCalls.count(),
          findCalls: findCalls.count(),
          generation: autocompleteManager.suggestionGeneration,
          bufferGeneration: autocompleteManager.bufferChangeGeneration,
          shouldDisplay: autocompleteManager.shouldDisplaySuggestions,
          delayPending: autocompleteManager.delayTimeout != null,
          hidePending: autocompleteManager.hideTimeout != null,
          requestPending: autocompleteManager.currentSuggestionsPromise != null,
          contextCurrent: autocompleteManager.suggestionContext?.isCurrent?.(),
          coldInput: Boolean(autocompleteManager.coldBufferInput),
          preparation: preparation && {
            index: preparation.index,
            ready: Boolean(preparation.value),
            pending: Boolean(preparation.promise),
            urgent: preparation.urgent,
          },
          popupItems: editorView.querySelectorAll("autocomplete-suggestion-list li").length,
        });
      };
      try {
        snapshot("before typing");
        await runs(async function () {
          expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

          editor.moveToBottom();
          editor.insertText("@");
          editor.insertText("b");
          editor.insertText("a");

          await waitsFor(() => autocompleteManager.delayTimeout != null);

          return advanceClock(completionDelay);
        });

        snapshot("after advanceClock");
        stage = "current completion request published";
        await waitForCurrentColorRequest(autocompleteManager, editor, colors);

        stage = "popup items";
        await waitsFor(() => editorView.querySelector("autocomplete-suggestion-list li") != null);

        stage = "confirm";
        await runs(async function () {
          const selected = autocompleteManager.suggestionList.items[0];
          expect(selected.provider).toBe(colors.autocompleteProvider);
          const confirmation = spyOn(autocompleteManager, "confirm").and.callThrough();
          lumine.commands.dispatch(editorView, "autocomplete:confirm");
          expect(confirmation.calls.count()).toBe(1);
          await confirmation.calls.mostRecent().returnValue;
          expect(editor.getText()).toBe(selected.text);
          return expect(editor.getText()).not.toContain("@@");
        });
      } catch (error) {
        try {
          snapshot("failure");
          const options = (request) => ({
            prefix: request?.prefix,
            position: request?.bufferPosition?.toArray(),
            scopes: request?.scopeDescriptor?.scopes,
          });
          console.error(
            "COLOR_INLINE_AT_PREFIX_DIAGNOSTIC " +
              JSON.stringify({
                stage,
                snapshots,
                providerObserved: Boolean(providerRequests),
                providerGenerationUnchanged: colors.autocompleteProviderValue === provider,
                requests: requests.calls.allArgs().map(([request]) => options(request)),
                providerRequests: providerRequests?.calls.all().map((call) => ({
                  ...options(call.args[0]),
                  returned: Array.isArray(call.returnValue)
                    ? call.returnValue.map((suggestion) => suggestion.text)
                    : typeof call.returnValue,
                })),
                displays: displayCalls.allArgs().map(([suggestions, request]) => ({
                  ...options(request),
                  suggestions: suggestions.map((suggestion) => suggestion.text),
                })),
              }),
          );
        } catch (diagnosticError) {
          console.error("COLOR_INLINE_AT_PREFIX_DIAGNOSTIC_ERROR " + String(diagnosticError));
        }
        throw error;
      }
    });

    it("replaces the prefix even when it contains a $", async function () {
      await runs(async function () {
        expect(editorView.querySelector("autocomplete-suggestion-list")).not.toExist();

        editor.moveToBottom();
        editor.insertText("$");
        editor.insertText("o");
        editor.insertText("t");

        await waitsFor(() => autocompleteManager.delayTimeout != null);

        return advanceClock(completionDelay);
      });

      await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

            await waitsFor(() => autocompleteManager.delayTimeout != null);

            return advanceClock(completionDelay);
          });

          await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

            await waitsFor(() => autocompleteManager.delayTimeout != null);

            return advanceClock(completionDelay);
          });

          await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

            await waitsFor(() => autocompleteManager.delayTimeout != null);

            return advanceClock(completionDelay);
          });

          await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

            await waitsFor(() => autocompleteManager.delayTimeout != null);

            return advanceClock(completionDelay);
          });

          await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

              await waitsFor(() => autocompleteManager.delayTimeout != null);

              return advanceClock(completionDelay);
            });

            await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

            await waitsFor(() => autocompleteManager.delayTimeout != null);

            return advanceClock(completionDelay);
          });

          await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

        await waitsFor(() => autocompleteManager.delayTimeout != null);

        return advanceClock(completionDelay);
      });

      await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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

          await waitsFor(() => autocompleteManager.delayTimeout != null);

          return advanceClock(completionDelay);
        });

        await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

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
          .activatePackage(AUTOCOMPLETE_PATH)
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
        spyOn(autocompleteManager, "getSuggestionsFromProviders").and.callThrough();
        spyOn(colors.autocompleteProviderValue, "getSuggestions").and.callThrough();
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

        await waitsFor(() => autocompleteManager.delayTimeout != null);

        return advanceClock(completionDelay);
      });

      await waitForCurrentColorRequest(autocompleteManager, editor, colors);

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
