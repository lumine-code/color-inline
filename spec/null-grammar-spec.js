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
});
