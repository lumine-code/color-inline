const { registerViewProvider } = require("./helpers/view-provider");
const { runs, waitsFor, waitsForPromise, waitsForQuiet } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const ColorBuffer = require("../lib/color-buffer");
const jsonFixture = require("./helpers/fixtures").jsonFixture(__dirname, "fixtures");

describe("ColorBuffer", function () {
  let [editor, colorBuffer, colors, project] = Array.from([]);

  const _sleep = async function (ms) {
    const start = new Date();
    return () => new Date() - start >= ms;
  };

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

  beforeEach(async function () {
    registerViewProvider();
    lumine.config.set("color-inline.delayBeforeScan", 0);
    lumine.config.set("color-inline.ignoredBufferNames", []);
    lumine.config.set("color-inline.filetypesForColorWords", ["*"]);
    lumine.config.set("color-inline.sourceNames", ["*.styl", "*.less"]);

    lumine.config.set("color-inline.ignoredNames", ["project/vendor/**"]);

    await waitsForPromise(() =>
      lumine.workspace.open("four-variables.styl").then((o) => (editor = o)),
    );

    await waitsForPromise(() =>
      lumine.packages
        .activatePackage("color-inline")
        .then(function (pkg) {
          colors = pkg.mainModule;
          return (project = colors.getProject());
        })
        .catch((err) => console.error(err)),
    );
  });

  afterEach(async () => (colorBuffer != null ? colorBuffer.destroy() : undefined));

  it("creates a color buffer for each editor in the workspace", async () =>
    expect(project.colorBuffersByEditorId[editor.id]).toBeDefined());

  describe("when the file path matches an entry in ignoredBufferNames", function () {
    beforeEach(async function () {
      registerViewProvider();
      expect(project.hasColorBufferForEditor(editor)).toBeTruthy();

      return lumine.config.set("color-inline.ignoredBufferNames", ["**/*.styl"]);
    });

    it("destroys the color buffer for this file", async () =>
      expect(project.hasColorBufferForEditor(editor)).toBeFalsy());

    it("recreates the color buffer when the settings no longer ignore the file", async function () {
      expect(project.hasColorBufferForEditor(editor)).toBeFalsy();

      lumine.config.set("color-inline.ignoredBufferNames", []);

      return expect(project.hasColorBufferForEditor(editor)).toBeTruthy();
    });

    return it("prevents the creation of a new color buffer", async function () {
      await waitsForPromise(() =>
        lumine.workspace.open("variables.styl").then((o) => (editor = o)),
      );

      await runs(() => expect(project.hasColorBufferForEditor(editor)).toBeFalsy());
    });
  });

  describe("when an editor with a path is not in the project paths is opened", function () {
    beforeEach(async () => await waitsFor(() => project.getPaths() != null));

    describe("when the file is already saved on disk", function () {
      let pathToOpen = null;

      beforeEach(async () => (pathToOpen = project.paths.shift()));

      return it("adds the path to the project immediately", async function () {
        spyOn(project, "appendPath");

        await waitsForPromise(() =>
          lumine.workspace.open(pathToOpen).then(function (o) {
            editor = o;
            return (colorBuffer = project.colorBufferForEditor(editor));
          }),
        );

        await runs(() => expect(project.appendPath).toHaveBeenCalledWith(pathToOpen));
      });
    });

    return describe("when the file is not yet saved on disk", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() =>
          lumine.workspace.open("foo-de-fafa.styl").then(function (o) {
            editor = o;
            return (colorBuffer = project.colorBufferForEditor(editor));
          }),
        );

        await waitsForPromise(() => colorBuffer.variablesAvailable());
      });

      it("does not fails when updating the colorBuffer", async () =>
        expect(() => colorBuffer.update()).not.toThrow());

      return it("adds the path to the project paths on save", async function () {
        spyOn(colorBuffer, "update").and.callThrough();
        spyOn(project, "appendPath");
        editor.getBuffer().emitter.emit("did-save", { path: editor.getPath() });

        await waitsFor(() => colorBuffer.update.calls.count() > 0);

        await runs(() => expect(project.appendPath).toHaveBeenCalledWith(editor.getPath()));
      });
    });
  });

  describe("when an editor without path is opened", function () {
    beforeEach(async function () {
      registerViewProvider();
      await waitsForPromise(() =>
        lumine.workspace.open().then(function (o) {
          editor = o;
          return (colorBuffer = project.colorBufferForEditor(editor));
        }),
      );

      await waitsForPromise(() => colorBuffer.variablesAvailable());
    });

    it("does not fails when updating the colorBuffer", async () =>
      expect(() => colorBuffer.update()).not.toThrow());

    return describe("when the file is saved and aquires a path", function () {
      describe("that is legible", function () {
        beforeEach(async function () {
          registerViewProvider();
          spyOn(colorBuffer, "update").and.callThrough();
          spyOn(editor, "getPath").and.returnValue("new-path.styl");
          editor.emitter.emit("did-change-path", editor.getPath());

          await waitsFor(() => colorBuffer.update.calls.count() > 0);
        });

        return it("adds the path to the project paths", async function () {
          let needle;
          return expect(
            ((needle = "new-path.styl"), project.getPaths().includes(needle)),
          ).toBeTruthy();
        });
      });

      describe("that is not legible", function () {
        beforeEach(async function () {
          registerViewProvider();
          spyOn(colorBuffer, "update").and.callThrough();
          spyOn(editor, "getPath").and.returnValue("new-path.sass");
          editor.emitter.emit("did-change-path", editor.getPath());

          await waitsFor(() => colorBuffer.update.calls.count() > 0);
        });

        return it("does not add the path to the project paths", async function () {
          let needle;
          return expect(
            ((needle = "new-path.styl"), project.getPaths().includes(needle)),
          ).toBeFalsy();
        });
      });

      return describe("that is ignored", function () {
        beforeEach(async function () {
          registerViewProvider();
          spyOn(colorBuffer, "update").and.callThrough();
          spyOn(editor, "getPath").and.returnValue("project/vendor/new-path.styl");
          editor.emitter.emit("did-change-path", editor.getPath());

          await waitsFor(() => colorBuffer.update.calls.count() > 0);
        });

        return it("does not add the path to the project paths", async function () {
          let needle;
          return expect(
            ((needle = "new-path.styl"), project.getPaths().includes(needle)),
          ).toBeFalsy();
        });
      });
    });
  });

  // FIXME Using a 1s sleep seems to do nothing on Travis, it'll need
  // a better solution.
  describe("with rapid changes that triggers a rescan", function () {
    beforeEach(async function () {
      registerViewProvider();
      colorBuffer = project.colorBufferForEditor(editor);
      await waitsFor(() => colorBuffer.initialized && colorBuffer.variableInitialized);

      await runs(async function () {
        spyOn(colorBuffer, "terminateRunningTask").and.callThrough();
        spyOn(colorBuffer, "updateColorMarkers").and.callThrough();
        spyOn(colorBuffer, "scanBufferForVariables").and.callThrough();

        editor.moveToBottom();

        editor.insertText("#fff\n");
        return editor.getBuffer().emitter.emit("did-stop-changing");
      });

      await waitsFor(() => colorBuffer.scanBufferForVariables.calls.count() > 0);

      await runs(() => editor.insertText(" "));
    });

    return it("terminates the currently running task", async () =>
      expect(colorBuffer.terminateRunningTask).toHaveBeenCalled());
  });

  describe("when created without a previous state", function () {
    beforeEach(async function () {
      registerViewProvider();
      colorBuffer = project.colorBufferForEditor(editor);
      await waitsForPromise(() => colorBuffer.initialize());
    });

    it("scans the buffer for colors without waiting for the project variables", async function () {
      expect(colorBuffer.getColorMarkers().length).toEqual(4);
      return expect(colorBuffer.getValidColorMarkers().length).toEqual(3);
    });

    it("creates the corresponding markers in the text editor", async () =>
      expect(colorBuffer.getMarkerLayer().findMarkers().length).toEqual(4));

    it("knows that it is legible as a variables source file", async () =>
      expect(colorBuffer.isVariablesSource()).toBeTruthy());

    describe("when the editor is destroyed", () =>
      it("destroys the color buffer at the same time", async function () {
        editor.destroy();

        return expect(project.colorBuffersByEditorId[editor.id]).toBeUndefined();
      }));

    describe("when the color buffer is destroyed", function () {
      it("completes a scan started before the destruction without reporting an error", async function () {
        spyOn(console, "log");

        const promise = colorBuffer.update();
        colorBuffer.destroy();

        await waitsForPromise(() => promise);
        await runs(() => expect(console.log).not.toHaveBeenCalled());
      });

      it("scans nothing at all", async function () {
        colorBuffer.destroy();

        await waitsForPromise(() =>
          colorBuffer.scanBufferForColors().then((results) => expect(results).toEqual([])),
        );
        await waitsForPromise(() =>
          colorBuffer.scanBufferForVariables().then((results) => expect(results).toEqual([])),
        );
      });

      it("does not update its markers any more", async function () {
        const updateSpy = jasmine.createSpy("did-update-color-markers");
        colorBuffer.onDidUpdateColorMarkers(updateSpy);
        colorBuffer.destroy();

        await waitsForPromise(() => colorBuffer.update());
        await runs(() => expect(updateSpy).not.toHaveBeenCalled());
      });

      return it("clears the scan scheduled by the last edit", async function () {
        lumine.config.set("color-inline.delayBeforeScan", 300);
        spyOn(colorBuffer, "update").and.callThrough();

        editor.insertText(" ");
        editor.getBuffer().emitter.emit("did-stop-changing", { changes: [] });
        expect(colorBuffer.timeout).not.toBeNull();

        colorBuffer.destroy();
        expect(colorBuffer.timeout).toBeNull();

        advanceClock(500);
        return expect(colorBuffer.update).not.toHaveBeenCalled();
      });
    });

    describe("::getColorMarkerAtBufferPosition", function () {
      describe("when the buffer position is contained in a marker range", () =>
        it("returns the corresponding color marker", async function () {
          const colorMarker = colorBuffer.getColorMarkerAtBufferPosition([2, 15]);
          return expect(colorMarker).toEqual(colorBuffer.colorMarkers[1]);
        }));

      return describe("when the buffer position is not contained in a marker range", () =>
        it("returns undefined", async () =>
          expect(colorBuffer.getColorMarkerAtBufferPosition([1, 15])).toBeUndefined()));
    });

    //#    ##     ##    ###    ########   ######
    //#    ##     ##   ## ##   ##     ## ##    ##
    //#    ##     ##  ##   ##  ##     ## ##
    //#    ##     ## ##     ## ########   ######
    //#     ##   ##  ######### ##   ##         ##
    //#      ## ##   ##     ## ##    ##  ##    ##
    //#       ###    ##     ## ##     ##  ######

    describe("when the project variables becomes available", function () {
      let [updateSpy] = Array.from([]);
      beforeEach(async function () {
        registerViewProvider();
        updateSpy = jasmine.createSpy("did-update-color-markers");
        colorBuffer.onDidUpdateColorMarkers(updateSpy);
        await waitsForPromise(() => colorBuffer.variablesAvailable());
      });

      it("replaces the invalid markers that are now valid", async function () {
        expect(colorBuffer.getValidColorMarkers().length).toEqual(4);
        expect(updateSpy.calls.argsFor(0)[0].created.length).toEqual(1);
        return expect(updateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(1);
      });

      describe("when a variable is edited", function () {
        let [colorsUpdateSpy] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
          colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
          return editBuffer("#336699", { start: [0, 13], end: [0, 17] });
        });

        return it("updates the modified colors", async function () {
          await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
          await waitsForQuiet(() => colorsUpdateSpy.calls.count());
          await runs(async function () {
            expect(colorsUpdateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(2);
            return expect(colorsUpdateSpy.calls.argsFor(0)[0].created.length).toEqual(2);
          });
        });
      });

      describe("when a new variable is added", function () {
        const [_colorsUpdateSpy] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.variablesAvailable());

          await runs(async function () {
            updateSpy = jasmine.createSpy("did-update-color-markers");
            colorBuffer.onDidUpdateColorMarkers(updateSpy);
            editor.moveToBottom();
            editBuffer("\nfoo = base-color");
            await waitsFor(() => updateSpy.calls.count() > 0);
            await waitsForQuiet(() => updateSpy.calls.count());
          });
        });

        return it("dispatches the new marker in a did-update-color-markers event", async function () {
          expect(updateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(0);
          return expect(updateSpy.calls.argsFor(0)[0].created.length).toEqual(1);
        });
      });

      describe("when a variable is removed", function () {
        let [colorsUpdateSpy] = Array.from([]);
        beforeEach(async function () {
          registerViewProvider();
          colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
          colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
          editBuffer("", { start: [0, 0], end: [0, 17] });
          await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
          await waitsForQuiet(() => colorsUpdateSpy.calls.count());
        });

        return it("invalidates colors that were relying on the deleted variables", async function () {
          expect(colorBuffer.getColorMarkers().length).toEqual(3);
          return expect(colorBuffer.getValidColorMarkers().length).toEqual(2);
        });
      });

      return describe("::serialize", function () {
        beforeEach(async () => await waitsForPromise(() => colorBuffer.variablesAvailable()));

        return it("returns the whole buffer data", async function () {
          const expected = jsonFixture("four-variables-buffer.json", {
            id: editor.id,
            root: lumine.project.getPaths()[0],
            colorMarkers: colorBuffer.getColorMarkers().map((m) => m.marker.id),
          });

          return expect(colorBuffer.serialize()).toEqual(expected);
        });
      });
    });

    //#     ######   #######  ##        #######  ########   ######
    //#    ##    ## ##     ## ##       ##     ## ##     ## ##    ##
    //#    ##       ##     ## ##       ##     ## ##     ## ##
    //#    ##       ##     ## ##       ##     ## ########   ######
    //#    ##       ##     ## ##       ##     ## ##   ##         ##
    //#    ##    ## ##     ## ##       ##     ## ##    ##  ##    ##
    //#     ######   #######  ########  #######  ##     ##  ######

    describe("with a buffer with only colors", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() =>
          lumine.workspace.open("buttons.styl").then((o) => (editor = o)),
        );

        await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));
      });

      it("creates the color markers for the variables used in the buffer", async function () {
        await waitsForPromise(() => colorBuffer.variablesAvailable());
        await runs(() => expect(colorBuffer.getColorMarkers().length).toEqual(3));
      });

      describe("when a color marker value is changed", function () {
        let [colorsUpdateSpy] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.variablesAvailable());

          await runs(async function () {
            colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
            colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
            editBuffer("#336699", { start: [1, 13], end: [1, 23] });
            await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
            await waitsForQuiet(() => colorsUpdateSpy.calls.count());
          });
        });

        it("updates the modified color marker", async function () {
          const markers = colorBuffer.getColorMarkers();
          const marker = markers[markers.length - 1];
          return expect(marker.color).toBeColor("#336699");
        });

        return it("updates only the affected marker", async function () {
          expect(colorsUpdateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(1);
          return expect(colorsUpdateSpy.calls.argsFor(0)[0].created.length).toEqual(1);
        });
      });

      describe("when new lines changes the markers range", function () {
        let [colorsUpdateSpy] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.variablesAvailable());

          await runs(async function () {
            colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
            colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
            editBuffer("#fff\n\n", { start: [0, 0], end: [0, 0] });
            await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
            await waitsForQuiet(() => colorsUpdateSpy.calls.count());
          });
        });

        return it("does not destroys the previous markers", async function () {
          expect(colorsUpdateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(0);
          return expect(colorsUpdateSpy.calls.argsFor(0)[0].created.length).toEqual(1);
        });
      });

      describe("when a new color is added", function () {
        let [colorsUpdateSpy] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.variablesAvailable());

          await runs(async function () {
            colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
            colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
            editor.moveToBottom();
            editBuffer("\n#336699");
            await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
            await waitsForQuiet(() => colorsUpdateSpy.calls.count());
          });
        });

        it("adds a marker for the new color", async function () {
          const markers = colorBuffer.getColorMarkers();
          const marker = markers[markers.length - 1];
          expect(markers.length).toEqual(4);
          expect(marker.color).toBeColor("#336699");
          return expect(colorBuffer.getMarkerLayer().findMarkers().length).toEqual(4);
        });

        return it("dispatches the new marker in a did-update-color-markers event", async function () {
          expect(colorsUpdateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(0);
          return expect(colorsUpdateSpy.calls.argsFor(0)[0].created.length).toEqual(1);
        });
      });

      return describe("when a color marker is removed", function () {
        let [colorsUpdateSpy] = Array.from([]);

        beforeEach(async function () {
          registerViewProvider();
          await waitsForPromise(() => colorBuffer.variablesAvailable());

          await runs(async function () {
            colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
            colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
            editBuffer("", { start: [1, 2], end: [1, 23] });
            await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
            await waitsForQuiet(() => colorsUpdateSpy.calls.count());
          });
        });

        it("updates the modified color marker", async () =>
          expect(colorBuffer.getColorMarkers().length).toEqual(2));

        it("updates only the affected marker", async function () {
          expect(colorsUpdateSpy.calls.argsFor(0)[0].destroyed.length).toEqual(1);
          return expect(colorsUpdateSpy.calls.argsFor(0)[0].created.length).toEqual(0);
        });

        return it("removes the previous editor markers", async () =>
          expect(colorBuffer.getMarkerLayer().findMarkers().length).toEqual(2));
      });
    });

    describe("with a buffer whose scope is not one of source files", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() =>
          lumine.workspace.open("project/lib/main.coffee").then((o) => (editor = o)),
        );

        await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));

        await waitsForPromise(() => colorBuffer.variablesAvailable());
      });

      return it("does not renders colors from variables", async () =>
        expect(colorBuffer.getColorMarkers().length).toEqual(4));
    });

    return describe("with a buffer in crlf mode", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() => lumine.workspace.open("crlf.styl").then((o) => (editor = o)));

        await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));

        await waitsForPromise(() => colorBuffer.variablesAvailable());
      });

      return it("creates a marker for each colors", async () =>
        expect(colorBuffer.getValidColorMarkers().length).toEqual(2));
    });
  });

  //#    ####  ######   ##    ##  #######  ########  ######## ########
  //#     ##  ##    ##  ###   ## ##     ## ##     ## ##       ##     ##
  //#     ##  ##        ####  ## ##     ## ##     ## ##       ##     ##
  //#     ##  ##   #### ## ## ## ##     ## ########  ######   ##     ##
  //#     ##  ##    ##  ##  #### ##     ## ##   ##   ##       ##     ##
  //#     ##  ##    ##  ##   ### ##     ## ##    ##  ##       ##     ##
  //#    ####  ######   ##    ##  #######  ##     ## ######## ########

  describe("with a buffer part of the global ignored files", function () {
    beforeEach(async function () {
      registerViewProvider();
      project.setIgnoredNames([]);
      lumine.config.set("color-inline.ignoredNames", ["project/vendor/*"]);

      await waitsForPromise(() =>
        lumine.workspace.open("project/vendor/css/variables.less").then((o) => (editor = o)),
      );

      await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));

      await waitsForPromise(() => colorBuffer.variablesAvailable());
    });

    it("knows that it is part of the ignored files", async () =>
      expect(colorBuffer.isIgnored()).toBeTruthy());

    it("knows that it is a variables source file", async () =>
      expect(colorBuffer.isVariablesSource()).toBeTruthy());

    return it("scans the buffer for variables for in-buffer use only", async function () {
      expect(colorBuffer.getColorMarkers().length).toEqual(20);
      const validMarkers = colorBuffer.getColorMarkers().filter((m) => m.color.isValid());

      return expect(validMarkers.length).toEqual(20);
    });
  });

  describe("with a buffer part of the project ignored files", function () {
    beforeEach(async function () {
      registerViewProvider();
      await waitsForPromise(() =>
        lumine.workspace.open("project/vendor/css/variables.less").then((o) => (editor = o)),
      );

      await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));

      await waitsForPromise(() => colorBuffer.variablesAvailable());
    });

    it("knows that it is part of the ignored files", async () =>
      expect(colorBuffer.isIgnored()).toBeTruthy());

    it("knows that it is a variables source file", async () =>
      expect(colorBuffer.isVariablesSource()).toBeTruthy());

    it("scans the buffer for variables for in-buffer use only", async function () {
      expect(colorBuffer.getColorMarkers().length).toEqual(20);
      const validMarkers = colorBuffer.getColorMarkers().filter((m) => m.color.isValid());

      return expect(validMarkers.length).toEqual(20);
    });

    return describe("when the buffer is edited", function () {
      beforeEach(async function () {
        registerViewProvider();
        const colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
        colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
        editor.moveToBottom();
        editBuffer("\n\n@new-color: @base0;\n");
        await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
        await waitsForQuiet(() => colorsUpdateSpy.calls.count());
      });

      return it("finds the newly added color", async function () {
        expect(colorBuffer.getColorMarkers().length).toEqual(21);
        const validMarkers = colorBuffer.getColorMarkers().filter((m) => m.color.isValid());

        return expect(validMarkers.length).toEqual(21);
      });
    });
  });

  //#    ##    ##  #######  ##     ##    ###    ########   ######
  //#    ###   ## ##     ## ##     ##   ## ##   ##     ## ##    ##
  //#    ####  ## ##     ## ##     ##  ##   ##  ##     ## ##
  //#    ## ## ## ##     ## ##     ## ##     ## ########   ######
  //#    ##  #### ##     ##  ##   ##  ######### ##   ##         ##
  //#    ##   ### ##     ##   ## ##   ##     ## ##    ##  ##    ##
  //#    ##    ##  #######     ###    ##     ## ##     ##  ######

  describe("with a buffer not being a variable source", function () {
    beforeEach(async function () {
      registerViewProvider();
      await waitsForPromise(() =>
        lumine.workspace.open("project/lib/main.coffee").then((o) => (editor = o)),
      );

      await runs(() => (colorBuffer = project.colorBufferForEditor(editor)));

      await waitsForPromise(() => colorBuffer.variablesAvailable());
    });

    it("knows that it is not part of the source files", async () =>
      expect(colorBuffer.isVariablesSource()).toBeFalsy());

    it("knows that it is not part of the ignored files", async () =>
      expect(colorBuffer.isIgnored()).toBeFalsy());

    it("scans the buffer for variables for in-buffer use only", async function () {
      expect(colorBuffer.getColorMarkers().length).toEqual(4);
      const validMarkers = colorBuffer.getColorMarkers().filter((m) => m.color.isValid());

      return expect(validMarkers.length).toEqual(4);
    });

    return describe("when the buffer is edited", function () {
      beforeEach(async function () {
        registerViewProvider();
        const colorsUpdateSpy = jasmine.createSpy("did-update-color-markers");
        spyOn(project, "reloadVariablesForPath").and.callThrough();
        colorBuffer.onDidUpdateColorMarkers(colorsUpdateSpy);
        editor.moveToBottom();
        editBuffer("\n\n@new-color = red;\n");
        await waitsFor(() => colorsUpdateSpy.calls.count() > 0);
        await waitsForQuiet(() => colorsUpdateSpy.calls.count());
      });

      it("finds the newly added color", async function () {
        expect(colorBuffer.getColorMarkers().length).toEqual(5);
        const validMarkers = colorBuffer.getColorMarkers().filter((m) => m.color.isValid());

        return expect(validMarkers.length).toEqual(5);
      });

      return it("does not ask the project to reload the variables", async function () {
        return expect(project.reloadVariablesForPath).not.toHaveBeenCalled();
      });
    });
  });

  //#    ########  ########  ######  ########  #######  ########  ########
  //#    ##     ## ##       ##    ##    ##    ##     ## ##     ## ##
  //#    ##     ## ##       ##          ##    ##     ## ##     ## ##
  //#    ########  ######    ######     ##    ##     ## ########  ######
  //#    ##   ##   ##             ##    ##    ##     ## ##   ##   ##
  //#    ##    ##  ##       ##    ##    ##    ##     ## ##    ##  ##
  //#    ##     ## ########  ######     ##     #######  ##     ## ########

  return describe("when created with a previous state", function () {
    describe("with variables and colors", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() => project.initialize());
        await runs(async function () {
          project.colorBufferForEditor(editor).destroy();

          const state = jsonFixture("four-variables-buffer.json", {
            id: editor.id,
            root: lumine.project.getPaths()[0],
            colorMarkers: __range__(-1, -4, true),
          });
          state.editor = editor;
          state.project = project;
          return (colorBuffer = new ColorBuffer(state));
        });
      });

      it("creates markers from the state object", async () =>
        expect(colorBuffer.getColorMarkers().length).toEqual(4));

      it("restores the markers properties", async function () {
        const colorMarker = colorBuffer.getColorMarkers()[3];
        expect(colorMarker.color).toBeColor(255, 255, 255, 0.5);
        return expect(colorMarker.color.variables).toEqual(["base-color"]);
      });

      it("restores the editor markers", async () =>
        expect(colorBuffer.getMarkerLayer().findMarkers().length).toEqual(4));

      return it("restores the ability to fetch markers", async function () {
        expect(colorBuffer.findColorMarkers().length).toEqual(4);

        return colorBuffer.findColorMarkers().map((marker) => expect(marker).toBeDefined());
      });
    });

    return describe("with an invalid color", function () {
      beforeEach(async function () {
        registerViewProvider();
        await waitsForPromise(() =>
          lumine.workspace.open("invalid-color.styl").then((o) => (editor = o)),
        );

        await waitsForPromise(() => project.initialize());

        await runs(async function () {
          const state = jsonFixture("invalid-color-buffer.json", {
            id: editor.id,
            root: lumine.project.getPaths()[0],
            colorMarkers: [-1],
          });
          state.editor = editor;
          state.project = project;
          return (colorBuffer = new ColorBuffer(state));
        });
      });

      return it("creates markers from the state object", async function () {
        expect(colorBuffer.getColorMarkers().length).toEqual(1);
        return expect(colorBuffer.getValidColorMarkers().length).toEqual(0);
      });
    });
  });
});

function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}
