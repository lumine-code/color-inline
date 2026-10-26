const path = require("node:path");

describe("color-inline with no grammar", () => {
  let main, editor;
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-css");
    jasmine.attachToDOM(lumine.workspace.getElement());
    lumine.config.set("color-inline.sourceNames", []);
    editor = await lumine.workspace.open("null-grammar.css");
    editor.setText("body { color: #123456; }");
    editor.setGrammar(lumine.grammars.nullGrammar);
    main = (await lumine.packages.activatePackage(path.join(__dirname, ".."))).mainModule;
    await flushMicrotasks();
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("color-inline");
    lumine.config.unset("color-inline.sourceNames");
  });

  it("avoids creating the project and retires a live document scanner on None", async () => {
    expect(main.project).toBeNull();
    const grammar = lumine.grammars.grammarForScopeName("source.css");
    editor.setGrammar(grammar);
    const project = main.getProject();
    await project.initializePromise;
    const buffer = project.colorBufferForEditor(editor);
    expect(buffer).toBeDefined();
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(buffer.destroyed).toBe(true);
    expect(buffer.subscriptions.disposed).toBe(true);
    expect(project.colorBufferForEditor(editor)).toBeUndefined();
    editor.setGrammar(grammar);
    const resumed = project.colorBufferForEditor(editor);
    expect(resumed).toBeDefined();
    expect(resumed).not.toBe(buffer);
  });

  it("excludes None documents from project variables and project color searches", async () => {
    const project = main.getProject();
    await project.initialize();
    const PathsScanner = require("../lib/paths-scanner").PathsScanner;
    spyOn(PathsScanner.prototype, "scanProject").and.callThrough();
    expect(await project.loadVariablesForPaths([editor.getPath()])).toEqual([]);
    expect(PathsScanner.prototype.scanProject).not.toHaveBeenCalled();
    spyOn(require("../lib/paths-loader"), "loadPaths").and.resolveTo({
      dirtied: [editor.getPath()],
    });
    const fs = require("node:fs/promises");
    spyOn(fs, "readFile").and.callThrough();
    const ColorSearch = require("../lib/color-search");
    const search = new ColorSearch({ project, sourceNames: ["*.css"] });
    try {
      await search.search();
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(search.fileResults).toEqual([]);
    } finally {
      search.destroy();
    }
  });

  it("excludes closed custom None associations before disk reads while honoring an open real override", async () => {
    const fixture = path.join(__dirname, "fixtures", "project-no-sources", "main.css");
    const previous = lumine.config.get("core.customFileTypes");
    lumine.config.set("core.customFileTypes", {
      ...previous,
      [lumine.grammars.nullGrammar.scopeName]: ["css"],
    });
    let opened, search;
    try {
      const project = main.getProject();
      await project.initialize();
      const PathsScanner = require("../lib/paths-scanner").PathsScanner;
      spyOn(PathsScanner.prototype, "scanProject").and.callThrough();
      expect(project.isPathAnalysisDisabled(fixture)).toBeTrue();
      expect(await project.loadVariablesForPaths([fixture])).toEqual([]);
      expect(PathsScanner.prototype.scanProject).not.toHaveBeenCalled();
      spyOn(require("../lib/paths-loader"), "loadPaths").and.resolveTo({ dirtied: [fixture] });
      const fs = require("node:fs/promises");
      spyOn(fs, "readFile").and.callThrough();
      const ColorSearch = require("../lib/color-search");
      search = new ColorSearch({ project, sourceNames: ["*.css"] });
      await search.search();
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(search.fileResults).toEqual([]);
      fs.readFile.and.callThrough();
      opened = await lumine.workspace.open(fixture);
      opened.setGrammar(lumine.grammars.grammarForScopeName("source.css"));
      expect(project.isPathAnalysisDisabled(fixture)).toBeFalse();
    } finally {
      search?.destroy();
      opened?.destroy();
      lumine.config.set("core.customFileTypes", previous);
    }
  });

  it("retires cached results when a closed source becomes None and reindexes on removal", async () => {
    const fixture = path.join(__dirname, "fixtures", "project-no-sources", "main.css");
    const previous = lumine.config.get("core.customFileTypes");
    const project = main.getProject();
    await project.initialize();
    project.paths = [fixture];
    const PathsScanner = require("../lib/paths-scanner").PathsScanner;
    const result = { variables: [], paths: [fixture], preEvaluated: true };
    const scan = spyOn(PathsScanner.prototype, "scanProject").and.resolveTo(result);
    const ColorSearch = require("../lib/color-search");
    const search = new ColorSearch({ project, sourceNames: ["*.css"] });
    search.fileResults = [{ filePath: fixture, matches: [{ matchText: "red" }] }];
    search.results = search.fileResults[0].matches;
    search.request = { controller: new AbortController() };
    try {
      lumine.config.set("core.customFileTypes", {
        ...previous,
        [lumine.grammars.nullGrammar.scopeName]: ["css"],
      });
      await project.variableScanPromise;
      expect(scan).not.toHaveBeenCalled();
      expect(project.isPathAnalysisDisabled(fixture)).toBeTrue();
      expect(search.fileResults).toEqual([]);
      expect(search.results).toEqual([]);
      expect(search.request.controller.signal.aborted).toBeTrue();
      lumine.config.set("core.customFileTypes", previous);
      await project.variableScanPromise;
      expect(scan).toHaveBeenCalledTimes(1);
      expect(project.isPathAnalysisDisabled(fixture)).toBeFalse();
    } finally {
      search.destroy();
      lumine.config.set("core.customFileTypes", previous);
    }
  });
});
