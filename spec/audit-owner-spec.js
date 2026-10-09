describe("Color Inline retained services and expression ownership", () => {
  let main, cleanups;
  beforeEach(async () => {
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    cleanups = [];
  });
  afterEach(async () => {
    cleanups.forEach((cleanup) => cleanup());
    await lumine.packages.deactivatePackage("color-inline");
  });

  it("does not build a fresh autocomplete provider from a retired proxy", async () => {
    const proxy = main.provideAutocomplete();
    await lumine.packages.deactivatePackage("color-inline");
    expect(typeof proxy.getSuggestions).toBe("function");
    expect(main.autocompleteProviderValue).toBeNull();
    expect(main.project).toBeNull();
  });

  it("does not lazily create a project from a retired project service", async () => {
    const api = main.provideColorInlineProject();
    await lumine.packages.deactivatePackage("color-inline");
    expect(api.getVariables()).toEqual([]);
    expect(main.project).toBeNull();
  });

  for (const method of ["consumeColorExpressions", "consumeVariableExpressions"]) {
    it(`does not let an old ${method} lease remove a newer same-name expression`, () => {
      const project = main.getProject();
      const registry =
        method === "consumeColorExpressions"
          ? project.getColorExpressionsRegistry()
          : project.getVariableExpressionsRegistry();
      const name = `audit:${method}`;
      const options = (regexpString) => ({
        expressions: [{ name, regexpString, scopes: ["*"], handle() {} }],
      });
      const first = main[method](options("old"));
      cleanups.push(() => first.dispose());
      const second = main[method](options("new"));
      cleanups.push(() => second.dispose());
      const current = registry.getExpression(name);
      first.dispose();
      expect(registry.getExpression(name)).toBe(current);
      second.dispose();
      expect(registry.getExpression(name)).toBeUndefined();
    });

    it(`keeps a replacement registered synchronously during ${method} publication`, () => {
      const project = main.getProject();
      const registry =
        method === "consumeColorExpressions"
          ? project.getColorExpressionsRegistry()
          : project.getVariableExpressionsRegistry();
      const name = `audit:reentrant:${method}`;
      let replacement;
      const observer = registry.onDidAddExpression(({ name: added }) => {
        if (added !== name || replacement) return;
        // Publish the newer registration from a public registry observer.
        observer.dispose();
        replacement = main[method]({ name, regexpString: "new", scopes: ["*"], handle() {} });
      });
      cleanups.push(() => observer.dispose());
      const first = main[method]({
        expressions: [{ name, regexpString: "old", scopes: ["*"], handle() {} }],
      });
      cleanups.push(() => first.dispose());
      cleanups.push(() => replacement?.dispose());
      const current = registry.getExpression(name);
      expect(current.regexpString).toBe("new");
      first.dispose();
      expect(registry.getExpression(name)).toBe(current);
    });
  }

  it("keeps actual Results listeners after a normal DOM detach and reconnect", async () => {
    const Results = require("../lib/color-results-element");
    const ColorContext = require("../lib/color-context");
    const context = new ColorContext({
      registry: require("../lib/color-expressions"),
      scope: "css",
    });
    const view = new Results();
    const editor = lumine.workspace.buildTextEditor();
    editor.setText("#ff0000");
    const file = require("node:path").join(lumine.getConfigDirPath(), "owned-results.css");
    const open = spyOn(lumine.workspace, "open").and.resolveTo(editor);
    try {
      jasmine.attachToDOM(view);
      view.addFileResult({
        filePath: file,
        matches: [
          {
            color: context.readColor("#ff0000"),
            matchText: "#ff0000",
            lineText: "#ff0000",
            lineTextOffset: 0,
            range: [
              [0, 0],
              [0, 7],
            ],
          },
        ],
      });
      view.remove();
      jasmine.attachToDOM(view);
      view.querySelector(".search-result").click();
      await Promise.resolve();
      expect(open).toHaveBeenCalledWith(file);
      expect(editor.getSelectedText()).toBe("#ff0000");
    } finally {
      view.subscriptions.dispose();
      view.remove();
      editor.destroy();
    }
  });

  for (const retire of [false, true]) {
    it(`${retire ? "preserves the editor selection after the Results owner retires" : "selects the clicked result for its current live owner"} while an accepted open completes`, async () => {
      const Results = require("../lib/color-results-element");
      const Color = require("../lib/color");
      const view = new Results();
      const editor = lumine.workspace.buildTextEditor();
      editor.setText("#ff0000");
      editor.setCursorBufferPosition([0, 0]);
      let finish;
      const acceptedOpen = new Promise((resolve) => {
        finish = resolve;
      });
      const open = spyOn(lumine.workspace, "open").and.returnValue(acceptedOpen);
      const file = require("node:path").join(lumine.getConfigDirPath(), "owned-held-open.css");
      try {
        jasmine.attachToDOM(view);
        view.addFileResult({
          filePath: file,
          matches: [
            {
              color: new Color(255, 0, 0, 1),
              matchText: "#ff0000",
              lineText: "#ff0000",
              lineTextOffset: 0,
              range: [
                [0, 0],
                [0, 7],
              ],
            },
          ],
        });
        view.querySelector(".search-result").click();
        expect(open).toHaveBeenCalledWith(file);
        if (retire) view.destroy();
        finish(editor);
        await acceptedOpen;
        await Promise.resolve();
        expect(editor.getSelectedText()).toBe(retire ? "" : "#ff0000");
        expect(editor.isDestroyed()).toBeFalse();
      } finally {
        finish(editor);
        view.destroy();
        view.remove();
        editor.destroy();
      }
    });
  }

  it("accepts Core declining a real result open at the editor limit", async () => {
    const fs = require("node:fs");
    const file = require("node:path").join(lumine.getConfigDirPath(), "owned-declined-result.css");
    fs.writeFileSync(file, "#ff0000");
    const view = new (require("../lib/color-results-element"))();
    const Color = require("../lib/color");
    const errors = [];
    const rejected = (event) => {
      errors.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", rejected);
    spyOn(lumine.workspace, "textEditorLimitReached").and.returnValue(true);
    const open = spyOn(lumine.workspace, "open").and.callThrough();
    try {
      jasmine.attachToDOM(view);
      view.addFileResult({
        filePath: file,
        matches: [
          {
            color: new Color(255, 0, 0, 1),
            matchText: "#ff0000",
            lineText: "#ff0000",
            lineTextOffset: 0,
            range: [
              [0, 0],
              [0, 7],
            ],
          },
        ],
      });
      view.querySelector(".search-result").click();
      expect(await open.calls.mostRecent().returnValue).toBeUndefined();
      await require("node:timers/promises").setTimeout(30);
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener("unhandledrejection", rejected);
      view.destroy();
      view.remove();
      fs.unlinkSync(file);
    }
  });
});
