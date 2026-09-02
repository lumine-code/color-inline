const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const fs = require("fs");
const path = require("path");
require("./helpers/spec-helper");
require("./helpers/matchers");
const { mousedown } = require("./helpers/events");
const Color = require("../lib/color");
const ColorBufferElement = require("../lib/color-buffer-element");

const _sleep = async function (duration) {
  const t = new Date();
  await waitsFor(() => new Date() - t > duration);
};

describe("ColorBufferElement", function () {
  let [editor, editorElement, colorBuffer, colors, project, colorBufferElement, jasmineContent] =
    Array.from([]);

  const isVisible = (decoration) => !/-in-selection/.test(decoration.properties.class);

  const editBuffer = function (text, options = {}) {
    if (options.start != null) {
      let range;
      if (options.end != null) {
        range = [options.start, options.end];
      } else {
        range = [options.start, options.start];
      }

      editor.setSelectedBufferRange(range);
    }

    editor.insertText(text);
    if (!options.noEvent) {
      return advanceClock(500);
    }
  };

  const _jsonFixture = function (fixture, data) {
    const jsonPath = path.resolve(__dirname, "fixtures", fixture);
    let json = fs.readFileSync(jsonPath).toString();
    json = json.replace(/#\{(\w+)\}/g, (m, w) => data[w]);

    return JSON.parse(json);
  };

  const getEditorDecorations = (_type) =>
    editor.getDecorations().filter((d) => d.properties.class.startsWith("color-inline-background"));

  beforeEach(async function () {
    registerViewProvider();
    const workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    jasmineContent = document.body.querySelector("#jasmine-content");

    jasmineContent.appendChild(workspaceElement);

    lumine.config.set("editor.softWrap", true);
    lumine.config.set("editor.softWrapAtPreferredLineLength", true);
    lumine.config.set("editor.preferredLineLength", 40);

    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.sourceNames", ["*.styl", "*.less"]);

    await waitsForPromise(() =>
      lumine.workspace.open("four-variables.styl").then(function (o) {
        editor = o;
        return (editorElement = lumine.views.getView(editor));
      }),
    );

    await waitsForPromise(() =>
      lumine.packages.activatePackage("color-inline").then(function (pkg) {
        colors = pkg.mainModule;
        return (project = colors.getProject());
      }),
    );
  });

  afterEach(async () => (colorBuffer != null ? colorBuffer.destroy() : undefined));

  return describe("when an editor is opened", function () {
    beforeEach(async function () {
      registerViewProvider();
      colorBuffer = project.colorBufferForEditor(editor);
      colorBufferElement = lumine.views.getView(colorBuffer);
      return colorBufferElement.attach();
    });

    it("is associated to the ColorBuffer model", async function () {
      expect(colorBufferElement).toBeDefined();
      return expect(colorBufferElement.getModel()).toBe(colorBuffer);
    });

    it("attaches itself in the target text editor element", async function () {
      expect(colorBufferElement.parentNode).toExist();
      return expect(editorElement.querySelector(".lines color-inline-markers")).toExist();
    });

    describe("when the color buffer is initialized", function () {
      beforeEach(async () => await waitsForPromise(() => colorBuffer.initialize()));

      it("creates markers views for every visible buffer marker", async () =>
        expect(getEditorDecorations("background").length).toEqual(3));

      describe("when the project variables are initialized", () =>
        it("creates markers for the new valid colors", async function () {
          await waitsForPromise(() => colorBuffer.variablesAvailable());
          await runs(() => expect(getEditorDecorations("background").length).toEqual(4));
        }));

      describe("when a selection intersects a marker range", function () {
        beforeEach(async () => spyOn(colorBufferElement, "updateSelections").and.callThrough());

        describe("after the markers views was created", function () {
          beforeEach(async function () {
            registerViewProvider();
            await waitsForPromise(() => colorBuffer.variablesAvailable());
            await runs(() =>
              editor.setSelectedBufferRange([
                [2, 12],
                [2, 14],
              ]),
            );
            await waitsFor(() => colorBufferElement.updateSelections.calls.count() > 0);
          });

          return it("hides the intersected marker", async function () {
            const decorations = getEditorDecorations("background");

            expect(isVisible(decorations[0])).toBeTruthy();
            expect(isVisible(decorations[1])).toBeTruthy();
            expect(isVisible(decorations[2])).toBeTruthy();
            return expect(isVisible(decorations[3])).toBeFalsy();
          });
        });

        return describe("before all the markers views was created", function () {
          beforeEach(async function () {
            registerViewProvider();
            await runs(() =>
              editor.setSelectedBufferRange([
                [0, 0],
                [2, 14],
              ]),
            );
            await waitsFor(() => colorBufferElement.updateSelections.calls.count() > 0);
          });

          it("hides the existing markers", async function () {
            const decorations = getEditorDecorations("background");

            expect(isVisible(decorations[0])).toBeFalsy();
            expect(isVisible(decorations[1])).toBeTruthy();
            return expect(isVisible(decorations[2])).toBeTruthy();
          });

          return describe("and the markers are updated", function () {
            beforeEach(async function () {
              registerViewProvider();
              await waitsForPromise("colors available", () => colorBuffer.variablesAvailable());
              await waitsFor("last marker visible", function () {
                const decorations = getEditorDecorations("background");
                return isVisible(decorations[3]);
              });
            });

            return it("hides the created markers", async function () {
              const decorations = getEditorDecorations("background");
              expect(isVisible(decorations[0])).toBeFalsy();
              expect(isVisible(decorations[1])).toBeTruthy();
              expect(isVisible(decorations[2])).toBeTruthy();
              return expect(isVisible(decorations[3])).toBeTruthy();
            });
          });
        });
      });

      describe("when some markers are destroyed", function () {
        let [spy] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          for (var el of colorBufferElement.usedMarkers) {
            spyOn(el, "release").and.callThrough();
          }

          spy = jasmine.createSpy("did-update");
          colorBufferElement.onDidUpdate(spy);
          editBuffer("", { start: [4, 0], end: [8, 0] });
          await waitsFor(() => spy.calls.count() > 0);
        });

        return it("releases the unused markers", async () =>
          expect(getEditorDecorations("background").length).toEqual(2));
      });

      describe("when the current pane is splitted to the right", function () {
        beforeEach(async function () {
          registerViewProvider();
          // The spec wants the same editor in both panes. `pane:split-right`
          // has not carried the active item across since long before this fork,
          // and the version gate that used to pick between the two read the
          // editor's minor as `0`, so it took the branch that leaves the new
          // pane empty and then waited forever for a second text editor.
          lumine.commands.dispatch(editorElement, "pane:split-right-and-copy-active-item");

          await waitsFor("text editor", () => (editor = lumine.workspace.getTextEditors()[1]));

          await waitsFor(
            "color buffer element",
            () => (colorBufferElement = lumine.views.getView(project.colorBufferForEditor(editor))),
          );
          await waitsFor(
            "color buffer element markers",
            () => getEditorDecorations("background").length,
          );
        });

        return it("should keep all the buffer elements attached", async function () {
          const editors = lumine.workspace.getTextEditors();

          return editors.forEach(function (editor) {
            editorElement = lumine.views.getView(editor);
            colorBufferElement = editorElement.querySelector("color-inline-markers");
            expect(colorBufferElement).toExist();

            return expect(getEditorDecorations("background").length).toEqual(4);
          });
        });
      });

      describe("when the marker type is set to dot", function () {
        beforeEach(async function () {
          await waitsForPromise(() => colorBuffer.initialize());
          lumine.config.set("color-inline.markerType", "dot");
        });

        it("does no offset work for a vertical scroll", async function () {
          spyOn(colorBufferElement, "scheduleDotDecorationsOffsetsUpdate").and.callThrough();

          editorElement.emitter.emit("did-change-scroll-top", 10);
          await new Promise((resolve) => requestAnimationFrame(resolve));

          expect(colorBufferElement.scheduleDotDecorationsOffsetsUpdate).not.toHaveBeenCalled();
        });

        it("coalesces horizontal scroll events into one offset update", async function () {
          spyOn(colorBufferElement, "updateDotDecorationsOffsets").and.callThrough();

          editorElement.emitter.emit("did-change-scroll-left", 10);
          editorElement.emitter.emit("did-change-scroll-left", 20);
          editorElement.emitter.emit("did-change-scroll-left", 30);
          await new Promise((resolve) => requestAnimationFrame(resolve));

          expect(colorBufferElement.updateDotDecorationsOffsets.calls.count()).toBe(1);
        });

        return it("cancels a pending offset update when the marker type changes", async function () {
          spyOn(colorBufferElement, "updateDotDecorationsOffsets").and.callThrough();

          editorElement.emitter.emit("did-change-scroll-left", 10);
          lumine.config.set("color-inline.markerType", "background");
          await new Promise((resolve) => requestAnimationFrame(resolve));

          expect(colorBufferElement.updateDotDecorationsOffsets).not.toHaveBeenCalled();
          expect(colorBufferElement.dotDecorationsOffsetsFrame).toBeNull();
        });
      });

      return describe("when the marker type is set to gutter", function () {
        let [gutter] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.initialize());
          await runs(async function () {
            lumine.config.set("color-inline.markerType", "gutter");
            return (gutter = editorElement.querySelector('[gutter-name="color-inline-gutter"]'));
          });
        });

        it("removes the markers", async () =>
          expect(colorBufferElement.querySelectorAll("color-inline-color-marker").length).toEqual(
            0,
          ));

        it("adds a custom gutter to the text editor", async () => expect(gutter).toExist());

        it("sets the size of the gutter based on the number of markers in the same row", async () =>
          expect(gutter.style.minWidth).toEqual("14px"));

        it("adds a gutter decoration for each color marker", async function () {
          const decorations = editor.getDecorations().filter((d) => d.properties.type === "gutter");
          return expect(decorations.length).toEqual(3);
        });

        describe("when the variables become available", function () {
          beforeEach(async () => await waitsForPromise(() => colorBuffer.variablesAvailable()));

          it("creates decorations for the new valid colors", async function () {
            const decorations = editor
              .getDecorations()
              .filter((d) => d.properties.type === "gutter");
            return expect(decorations.length).toEqual(4);
          });

          return describe("when many markers are added on the same line", function () {
            beforeEach(async function () {
              registerViewProvider();
              const updateSpy = jasmine.createSpy("did-update");
              colorBufferElement.onDidUpdate(updateSpy);

              editor.moveToBottom();
              editBuffer("\nlist = #123456, #987654, #abcdef\n");
              await waitsFor(() => updateSpy.calls.count() > 0);
            });

            it("adds the new decorations to the gutter", async function () {
              const decorations = editor
                .getDecorations()
                .filter((d) => d.properties.type === "gutter");

              return expect(decorations.length).toEqual(7);
            });

            it("sets the size of the gutter based on the number of markers in the same row", async () =>
              expect(gutter.style.minWidth).toEqual("42px"));

            return describe("clicking on a gutter decoration", function () {
              beforeEach(async function () {
                registerViewProvider();

                const decoration = editorElement.querySelector(".color-inline-gutter-marker span");
                return mousedown(decoration);
              });

              it("selects the text in the editor", async () =>
                expect(editor.getSelectedScreenRange()).toEqual([
                  [0, 13],
                  [0, 17],
                ]));

              return it("selects exactly the marker content", async () =>
                expect(editor.getSelectedText()).toEqual("#fff"));
            });
          });
        });

        describe("when the marker is changed again", function () {
          beforeEach(async () => lumine.config.set("color-inline.markerType", "background"));

          it("removes the gutter", async () =>
            expect(
              editorElement.querySelector('[gutter-name="color-inline-gutter"]'),
            ).not.toExist());

          return it("recreates the markers", async () =>
            expect(getEditorDecorations("background").length).toEqual(3));
        });

        return describe("when a new buffer is opened", function () {
          beforeEach(async function () {
            registerViewProvider();
            await waitsForPromise(() =>
              lumine.workspace.open("project/styles/variables.styl").then(function (e) {
                editor = e;
                editorElement = lumine.views.getView(editor);
                colorBuffer = project.colorBufferForEditor(editor);
                return (colorBufferElement = lumine.views.getView(colorBuffer));
              }),
            );

            await waitsForPromise(() => colorBuffer.initialize());
            await waitsForPromise(() => colorBuffer.variablesAvailable());

            await runs(
              () => (gutter = editorElement.querySelector('[gutter-name="color-inline-gutter"]')),
            );
          });

          return it("creates the decorations in the new buffer gutter", async function () {
            const decorations = editor
              .getDecorations()
              .filter((d) => d.properties.type === "gutter");

            return expect(decorations.length).toEqual(10);
          });
        });
      });
    });

    describe("when the editor is moved to another pane", function () {
      let [pane, newPane] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        pane = lumine.workspace.getActivePane();
        newPane = pane.splitDown({ copyActiveItem: false });
        colorBuffer = project.colorBufferForEditor(editor);
        colorBufferElement = lumine.views.getView(colorBuffer);

        pane.moveItemToPane(editor, newPane, 0);

        await waitsFor(() => getEditorDecorations("background").length);
      });

      return it("moves the editor with the buffer to the new pane", async () =>
        expect(getEditorDecorations("background").length).toEqual(3));
    });

    describe("when color-inline.supportedFiletypes settings is defined", function () {
      const loadBuffer = async function (filePath) {
        await waitsForPromise(() =>
          lumine.workspace.open(filePath).then(function (o) {
            editor = o;
            editorElement = lumine.views.getView(editor);
            colorBuffer = project.colorBufferForEditor(editor);
            colorBufferElement = lumine.views.getView(colorBuffer);
            return colorBufferElement.attach();
          }),
        );

        await waitsForPromise(() => colorBuffer.initialize());
        await waitsForPromise(() => colorBuffer.variablesAvailable());
      };

      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() => lumine.packages.activatePackage("language-coffee-script"));
        await waitsForPromise(() => lumine.packages.activatePackage("language-less"));
      });

      describe("with the default wildcard", function () {
        beforeEach(async () => lumine.config.set("color-inline.supportedFiletypes", ["*"]));

        return it("supports every filetype", async function () {
          await loadBuffer("scope-filter.coffee");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(2));

          await loadBuffer("project/vendor/css/variables.less");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(20));
        });
      });

      describe("with a filetype", function () {
        beforeEach(async () => lumine.config.set("color-inline.supportedFiletypes", ["coffee"]));

        return it("supports the specified file type", async function () {
          await loadBuffer("scope-filter.coffee");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(2));

          await loadBuffer("project/vendor/css/variables.less");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(0));
        });
      });

      return describe("with many filetypes", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.supportedFiletypes", ["coffee"]);
          return project.setSupportedFiletypes(["less"]);
        });

        it("supports the specified file types", async function () {
          await loadBuffer("scope-filter.coffee");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(2));

          await loadBuffer("project/vendor/css/variables.less");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(20));

          await loadBuffer("four-variables.styl");
          await runs(() => expect(getEditorDecorations("background").length).toEqual(0));
        });

        return describe("with global file types ignored", function () {
          beforeEach(async function () {
            registerViewProvider();
            lumine.config.set("color-inline.supportedFiletypes", ["coffee"]);
            project.setIgnoreGlobalSupportedFiletypes(true);
            return project.setSupportedFiletypes(["less"]);
          });

          return it("supports the specified file types", async function () {
            await loadBuffer("scope-filter.coffee");
            await runs(() => expect(getEditorDecorations("background").length).toEqual(0));

            await loadBuffer("project/vendor/css/variables.less");
            await runs(() => expect(getEditorDecorations("background").length).toEqual(20));

            await loadBuffer("four-variables.styl");
            await runs(() => expect(getEditorDecorations("background").length).toEqual(0));
          });
        });
      });
    });

    return describe("when color-inline.ignoredScopes settings is defined", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() => lumine.packages.activatePackage("language-coffee-script"));

        await waitsForPromise(() =>
          lumine.workspace.open("scope-filter.coffee").then(function (o) {
            editor = o;
            editorElement = lumine.views.getView(editor);
            colorBuffer = project.colorBufferForEditor(editor);
            colorBufferElement = lumine.views.getView(colorBuffer);
            return colorBufferElement.attach();
          }),
        );

        await editor.languageMode.ready;
        await editor.languageMode.atTransactionEnd();
        await waitsForPromise(() => colorBuffer.initialize());
      });

      describe("with one filter", function () {
        beforeEach(async () => lumine.config.set("color-inline.ignoredScopes", ["\\.comment"]));

        return it("ignores the colors that matches the defined scopes", async () =>
          expect(getEditorDecorations("background").length).toEqual(1));
      });

      describe("with two filters", function () {
        beforeEach(async () =>
          lumine.config.set("color-inline.ignoredScopes", ["\\.string", "\\.comment"]),
        );

        return it("ignores the colors that matches the defined scopes", async () =>
          expect(getEditorDecorations("background").length).toEqual(0));
      });

      describe("with an invalid filter", function () {
        beforeEach(async () => lumine.config.set("color-inline.ignoredScopes", ["\\"]));

        return it("ignores the filter", async () =>
          expect(getEditorDecorations("background").length).toEqual(2));
      });

      return describe("when the project ignoredScopes is defined", function () {
        beforeEach(async function () {
          registerViewProvider();
          lumine.config.set("color-inline.ignoredScopes", ["\\.string"]);
          return project.setIgnoredScopes(["\\.comment"]);
        });

        return it("ignores the colors that matches the defined scopes", async () =>
          expect(getEditorDecorations("background").length).toEqual(0));
      });
    });
  });
});

describe("ColorBufferElement decoration styles", function () {
  let [element] = Array.from([]);

  const cssFor = (color, type, backdrop) =>
    element.getHighlighDecorationCSS({ color }, type, backdrop).style.innerHTML;

  beforeEach(() => (element = new ColorBufferElement()));

  describe("::getHighlighDecorationCSS", function () {
    it("uses a solid background for an opaque color", function () {
      const css = cssFor(new Color(255, 0, 0), "background", new Color("#ffffff"));

      expect(css).toContain("background-color: rgb(255,0,0)");
      expect(css).not.toContain("background-image:");
      return expect(css).not.toContain("repeating-conic-gradient");
    });

    it("paints the color once, so its alpha reads as written", function () {
      const css = cssFor(new Color(255, 0, 0, 0.5), "background", new Color("#ffffff"));

      expect(css).not.toContain("background-color:");
      return expect(css).toContain("linear-gradient(to bottom, rgba(255,0,0,0.5) 0%");
    });

    it("takes the text color from what the marker composites to", function () {
      const barelyThere = new Color(70, 72, 83, 0.06);

      expect(cssFor(barelyThere, "background", new Color("#ffffff"))).toContain("color: black");
      return expect(cssFor(barelyThere, "background", new Color("#282c34"))).toContain(
        "color: white",
      );
    });

    it("reads the color on its own when the backdrop is unknown", () =>
      expect(cssFor(new Color(255, 255, 255, 0.06), "background", null)).toContain("color: black"));

    it("uses a solid underline for an opaque color", function () {
      const css = cssFor(new Color(255, 0, 0), "underline", null);

      expect(css).toContain("background-color: rgb(255,0,0)");
      return expect(css).not.toContain("repeating-conic-gradient");
    });

    return it("paints a transparent underline once as well", function () {
      const css = cssFor(new Color(255, 0, 0, 0.5), "underline", null);

      expect(css).not.toContain("background-color:");
      return expect(css).toContain("repeating-conic-gradient");
    });
  });

  describe("::getGutterDecorationItem", function () {
    const spanFor = (color) =>
      element.getGutterDecorationItem({ id: 42, color }).querySelector("span");

    it("uses a solid background for an opaque color", function () {
      const span = spanFor(new Color(255, 0, 0));

      expect(span.style.backgroundColor).toBe("rgb(255, 0, 0)");
      expect(span.style.backgroundImage).toBe("");
      return expect(span.dataset.markerId).toBe("42");
    });

    return it("keeps the transparency grid for a translucent color", function () {
      const span = spanFor(new Color(255, 0, 0, 0.5));

      expect(span.style.backgroundImage).toContain("rgba(255, 0, 0, 0.5)");
      expect(span.style.backgroundImage).toContain("repeating-conic-gradient");
      return expect(span.style.backgroundSize).toBe("auto, 10px 10px");
    });
  });

  describe("::updateDotDecorationsOffsets", function () {
    it("visits each marker once and measures each row once", function () {
      const items = [{ style: {} }, { style: {} }, { style: {} }];
      const markers = items.map((item, index) => ({
        id: index + 1,
        marker: {
          getStartScreenPosition: jasmine
            .createSpy(`position-${index}`)
            .and.returnValue({ row: 10 }),
        },
      }));
      markers.push({
        id: 99,
        marker: {
          getStartScreenPosition: jasmine
            .createSpy("missing-decoration")
            .and.returnValue({ row: 10 }),
        },
      });
      const pixelPosition = jasmine.createSpy("pixel-position").and.returnValue({ left: 100 });
      element.editor = { isDestroyed: () => false };
      element.editorElement = {
        getScrollLeft: () => 5,
        pixelPositionForScreenPosition: pixelPosition,
      };
      element.displayedMarkers = markers;
      element.decorationByMarkerId = Object.fromEntries(
        items.map((item, index) => [index + 1, { getProperties: () => ({ item }) }]),
      );
      lumine.config.set("color-inline.maxDecorationsInGutter", 100);

      expect(element.updateDotDecorationsOffsets(0, 20)).toBe(3);
      expect(
        markers.every((marker) => marker.marker.getStartScreenPosition.calls.count() === 1),
      ).toBe(true);
      expect(pixelPosition.calls.count()).toBe(1);
      expect(items.map((item) => item.style.left)).toEqual(["95px", "109px", "123px"]);
    });
  });

  return describe("::getEditorBackgroundColor", function () {
    let [host] = Array.from([]);

    beforeEach(function () {
      host = document.createElement("div");
      return jasmine.attachToDOM(host);
    });

    it("reads the color the editor paints", function () {
      host.innerHTML = "<div style='background-color: rgb(40, 44, 52)'></div>";
      element.editorElement = host.firstElementChild;

      return expect(element.getEditorBackgroundColor()).toBeColor(40, 44, 52, 1);
    });

    it("composites what an editor painting no background of its own sits on", function () {
      host.style.backgroundColor = "rgb(255, 255, 255)";
      host.innerHTML = "<div style='background-color: rgba(0, 0, 0, 0.5)'></div>";
      element.editorElement = host.firstElementChild;

      return expect(element.getEditorBackgroundColor()).toBeColor(128, 128, 128, 1);
    });

    return it("returns null when the background cannot be read", function () {
      element.editorElement = document.createElement("div");

      return expect(element.getEditorBackgroundColor()).toBeNull();
    });
  });
});
