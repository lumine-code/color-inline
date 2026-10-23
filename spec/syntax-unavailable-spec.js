const path = require("node:path");
const timers = require("node:timers/promises");

describe("Color Inline unavailable syntax", () => {
  let execution, editor, mode, project, colorBuffer, ColorBuffer;
  beforeEach(async () => {
    jasmine.useRealClock();
    execution = lumine.grammars.syntaxExecution;
    lumine.grammars.syntaxExecution = "worker";
    lumine.project.setPaths([]);
    await lumine.packages.activatePackage("language-css");
    const main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    editor = lumine.workspace.buildTextEditor();
    editor.getBuffer().setPath(path.join(lumine.getConfigDirPath(), "owned-unavailable.css"));
    editor.setText("a { color: #123; }\n");
    lumine.grammars.assignGrammar(
      editor.getBuffer(),
      lumine.grammars.grammarForScopeName("source.css"),
    );
    mode = editor.getBuffer().getLanguageMode();
    await editor.whenGrammarSettled();
    await mode.refresh();
    ColorBuffer = require("../lib/color-buffer");
  });
  afterEach(async () => {
    colorBuffer?.destroy();
    editor?.destroy();
    await lumine.packages.deactivatePackage("color-inline");
    lumine.grammars.syntaxExecution = execution;
    colorBuffer = null;
  });

  async function failParse() {
    // Keep presentation from converting this transaction failure into a view
    // error. The semantic API independently returns null for an unavailable tree.
    spyOn(mode, "schedule");
    await editor.analyzeSyntax(require.resolve("./fixtures/failing-syntax"), "failMarkedText");
    editor.getBuffer().insert([0, 0], "/*__color_fail__*/");
    const settled = await mode.settle();
    expect(settled.parseError).toBeTruthy();
    expect(mode.error).toBeFalsy();
    expect(await editor.getScopeDescriptorsForBufferPositions([[0, 12]])).toBeNull();
  }

  async function repairParse() {
    editor.getBuffer().delete([
      [0, 0],
      [0, "/*__color_fail__*/".length],
    ]);
    expect((await mode.settle()).parseError).toBeFalsy();
  }

  it("does not resubmit initialization indefinitely for one failed syntax snapshot", async () => {
    await failParse();
    const scan = ColorBuffer.prototype.scanBufferForColors;
    let attempts = 0;
    spyOn(ColorBuffer.prototype, "scanBufferForColors").and.callFake(async function (...args) {
      const result = await scan.apply(this, args);
      attempts++;
      // Bound the pre-fix failure without allowing a runaway test process.
      if (result === null && attempts === 4) this.destroy();
      return result;
    });
    colorBuffer = new ColorBuffer({ editor, project });
    await colorBuffer.initialize();
    await timers.setImmediate();
    expect(attempts).toBe(1);
    expect(colorBuffer.destroyed).toBeFalsy();
    await repairParse();
    await colorBuffer.update();
    await colorBuffer.variablesAvailable();
    expect(colorBuffer.initialized).toBeTrue();
    expect(colorBuffer.variableInitialized).toBeTrue();
    expect(colorBuffer.getColorMarkers().length).toBe(1);
  });

  it("does not requeue scope classification indefinitely for one failed syntax snapshot", async () => {
    colorBuffer = new ColorBuffer({ editor, project });
    await colorBuffer.variablesAvailable();
    await colorBuffer.scopeCheckPromise;
    const marker = colorBuffer.getColorMarkers()[0];
    await failParse();
    const classify = editor.getScopeDescriptorsForBufferPositions.bind(editor);
    let attempts = 0;
    spyOn(editor, "getScopeDescriptorsForBufferPositions").and.callFake(async (...args) => {
      const result = await classify(...args);
      attempts++;
      if (result === null && attempts === 4) colorBuffer.destroy();
      return result;
    });
    await colorBuffer.queueScopeCheck(marker, true);
    await timers.setImmediate();
    expect(attempts).toBe(1);
    expect(colorBuffer.destroyed).toBeFalsy();
    const apply = spyOn(marker, "applyScopeDescriptor").and.callThrough();
    await repairParse();
    await colorBuffer.queueScopeCheck(marker, true);
    expect(apply).toHaveBeenCalled();
    expect(marker.lastScopeChain).toContain("source.css");
  });

  it("stops variable-resolution retries on unchanged unavailable syntax and allows a later retry", async () => {
    colorBuffer = new ColorBuffer({ editor, project });
    await colorBuffer.variablesAvailable();
    await failParse();
    colorBuffer.variablesPromise = null;
    colorBuffer.variableInitialized = false;
    const scan = colorBuffer.scanBufferForColors.bind(colorBuffer);
    let attempts = 0;
    spyOn(colorBuffer, "scanBufferForColors").and.callFake(async (...args) => {
      const result = await scan(...args);
      attempts++;
      if (result === null && attempts === 4) colorBuffer.destroy();
      return result;
    });
    expect(await colorBuffer.variablesAvailable()).toBeNull();
    expect(attempts).toBe(1);
    await repairParse();
    await colorBuffer.update();
    expect(colorBuffer.variableInitialized).toBeTrue();
  });

  for (const change of ["revision", "syntax epoch"])
    it(`retries a stale initialization result after the ${change} changes`, async () => {
      let release, entered;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const ensure = mode.service.ensureEnvironment.bind(mode.service);
      let held = false;
      spyOn(mode.service, "ensureEnvironment").and.callFake(() => {
        if (held) return ensure();
        held = true;
        entered();
        return gate.then(ensure);
      });
      const scan = spyOn(ColorBuffer.prototype, "scanBufferForColors").and.callThrough();
      colorBuffer = new ColorBuffer({ editor, project });
      try {
        await started;
        if (change === "revision") editor.getBuffer().append(" ");
        else mode.service.invalidateConfiguration();
        release();
        await colorBuffer.initialize();
        await colorBuffer.variablesAvailable();
        expect(scan.calls.count()).toBeGreaterThan(1);
        expect(colorBuffer.getColorMarkers().length).toBe(1);
        expect(colorBuffer.variableInitialized).toBeTrue();
      } finally {
        release();
      }
    });
});
