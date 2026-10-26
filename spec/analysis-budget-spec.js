const fs = require("node:fs/promises");
const path = require("node:path");

describe("color analysis input and transfer budgets", () => {
  let budget;
  beforeEach(() => {
    jasmine.useRealClock();
    budget = require("../lib/analysis-budget");
  });

  it("checks the worker mirror length before any full text read or packet", async () => {
    const read = jasmine.createSpy("read").and.throwError("must not read");
    const emit = jasmine.createSpy("emit");
    await expectAsync(
      require("../lib/syntax-scan").candidates(
        {
          getBuffer: () => ({ getLength: () => 600000000 }),
          getText: read,
        },
        { source: "red" },
        { signal: new AbortController().signal, emit },
      ),
    ).toBeRejectedWith(jasmine.objectContaining({ code: "ERR_COLOR_ANALYSIS_BUDGET" }));
    expect(read).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("declines long anchored completion context before reading it", () => {
    const Provider = require("../lib/autocomplete-provider");
    const read = jasmine.createSpy("read").and.throwError("must not read");
    expect(
      Provider.prototype.getPrefix.call(
        {},
        { getTextInRange: read },
        { row: 0, column: 600000000 },
      ),
    ).toBe("");
    expect(read).not.toHaveBeenCalled();
  });

  it("accounts aliased strings on every transfer occurrence and rejects cycles", () => {
    const shared = { text: "abc" };
    expect(() => budget.assertTransfer([shared, shared], 10)).toThrowError();
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => budget.assertTransfer(cyclic)).toThrowError(/cyclic/);
    const account = budget.createTransferBudget(10);
    account("12345");
    expect(() => account("123456")).toThrowError();
    expect(() => budget.assertCount(100001)).toThrowError(/result budget/);
  });

  it("rejects oversized disk metadata without reading and closes the descriptor", async () => {
    const file = {
      stat: async () => ({ size: 600000000 }),
      read: jasmine.createSpy("read").and.throwError("must not read"),
      close: jasmine.createSpy("close").and.resolveTo(),
    };
    spyOn(fs, "open").and.resolveTo(file);
    await expectAsync(require("../lib/read-analysis-file")("huge.css", 1024)).toBeRejectedWith(
      jasmine.objectContaining({ code: "ERR_COLOR_ANALYSIS_BUDGET" }),
    );
    expect(file.read).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledTimes(1);
  });

  it("enforces decoded length after a file grows and accepts split UTF-8 characters", async () => {
    const chunks = [Buffer.from([0xe6, 0xbc]), Buffer.from([0xa2]), Buffer.alloc(0)];
    let at = 0;
    const file = {
      stat: async () => ({ size: 1 }),
      read: async (target) => {
        const chunk = chunks[at++];
        chunk.copy(target);
        return { bytesRead: chunk.length };
      },
      close: jasmine.createSpy("close").and.resolveTo(),
    };
    spyOn(fs, "open").and.resolveTo(file);
    expect(await require("../lib/read-analysis-file")("unicode.css", 1)).toBe("漢");
    at = 0;
    chunks.splice(0, chunks.length, Buffer.from("abcd"));
    await expectAsync(require("../lib/read-analysis-file")("growing.css", 3)).toBeRejectedWith(
      jasmine.objectContaining({ code: "ERR_COLOR_ANALYSIS_BUDGET" }),
    );
    expect(file.close).toHaveBeenCalledTimes(2);
  });

  it("removes an oversized disk source's prior variables while preserving eligible siblings", async () => {
    const temporary = await fs.mkdtemp(path.join(lumine.getConfigDirPath(), "colors-budget-"));
    const large = path.join(temporary, "large.less"),
      small = path.join(temporary, "small.less");
    const { PathsScanner } = require("../lib/paths-scanner");
    const scanner = new PathsScanner();
    try {
      await fs.writeFile(large, " ".repeat(2048));
      await fs.writeFile(small, "@red: #f00;");
      const result = await scanner.scanProject(
        [
          [large, "less"],
          [small, "less"],
        ],
        require("../lib/variable-expressions"),
        {
          config: { maximumAnalysisLength: 1024 },
          state: {
            content: [
              {
                name: "@old",
                value: "#000",
                path: large,
                range: [0, 5],
                line: 0,
                color: [0, 0, 0, 1],
              },
            ],
          },
        },
      );
      expect(result.omittedPaths).toEqual([large]);
      expect(result.variables.map((variable) => variable.name)).toEqual(["@red"]);
    } finally {
      scanner.terminateRunningTask();
      await fs.rm(temporary, { recursive: true, force: true });
    }
  });
});

describe("color analysis budget lifecycle", () => {
  let editor, project;
  beforeEach(async () => {
    jasmine.useRealClock();
    lumine.project.setPaths([]);
    lumine.config.set("color-inline.sourceNames", []);
    lumine.config.set("color-inline.maximumAnalysisLength", 1024);
    await lumine.packages.activatePackage("language-css");
    editor = await lumine.workspace.open(
      path.join(lumine.getConfigDirPath(), "budget-lifecycle.css"),
    );
    editor.setText("a { color: #123; }");
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.css"));
    const main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
  });
  afterEach(async () => {
    editor?.destroy();
    await lumine.packages.deactivatePackage("color-inline");
    lumine.config.unset("color-inline.maximumAnalysisLength");
    lumine.config.unset("color-inline.sourceNames");
  });

  it("retires pending work and marks on growth and starts a fresh scanner after shrinking", async () => {
    const original = project.colorBufferForEditor(editor);
    await original.initialize();
    expect(original.getColorMarkers().length).toBe(1);
    const controller = new AbortController();
    original.scanControllers = new Set([controller]);
    const read = spyOn(editor, "getText").and.throwError("Oversized editor must not be read");
    editor.getBuffer().append(" ".repeat(2048));
    expect(original.destroyed).toBeTrue();
    expect(controller.signal.aborted).toBeTrue();
    expect(project.colorBufferForEditor(editor)).toBeUndefined();
    expect(project.isPathAnalysisDisabled(editor.getPath())).toBeTrue();
    expect(read).not.toHaveBeenCalled();
    read.and.callThrough();
    editor.getBuffer().setText("a { color: #abc; }");
    const resumed = project.colorBufferForEditor(editor);
    expect(resumed).not.toBe(original);
    await resumed.initialize();
    expect(resumed.getColorMarkers().length).toBe(1);
    expect(project.isPathAnalysisDisabled(editor.getPath())).toBeFalse();
  });

  it("retires in-flight project/search state when the configured budget changes", async () => {
    const file = editor.getPath();
    project.paths = [file];
    const terminate = jasmine.createSpy("terminate worker");
    project.pathsScanner = { terminateRunningTask: terminate };
    const remove = spyOn(project, "deleteVariablesForPaths").and.callThrough();
    const rescan = spyOn(project, "scanAndUpdateVariables").and.resolveTo([]);
    const Search = require("../lib/color-search");
    const search = new Search({ project, sourceNames: ["*.css"] });
    search.request = { controller: new AbortController() };
    search.fileResults = [{ filePath: file, matches: [{ matchText: "red" }] }];
    try {
      lumine.config.set("color-inline.maximumAnalysisLength", 2048);
      expect(terminate).toHaveBeenCalled();
      expect(remove).toHaveBeenCalledWith([file]);
      expect(rescan).toHaveBeenCalledWith([file]);
      expect(search.request.controller.signal.aborted).toBeTrue();
      expect(search.fileResults).toEqual([]);
      expect(search.results).toEqual([]);
    } finally {
      search.destroy();
    }
  });
});
