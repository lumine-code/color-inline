const path = require("node:path");
const timers = require("node:timers");

describe("Color Inline candidate scan ownership", () => {
  // Processing fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let execution;
  beforeEach(() => {
    execution = lumine.grammars.syntaxExecution;
    lumine.grammars.syntaxExecution = "worker";
  });
  afterEach(() => {
    lumine.grammars.syntaxExecution = execution;
  });
  for (const retire of ["supersede", "destroy"])
    it(`cancels pending candidate work when its color scan is retired by ${retire}`, async () => {
      jasmine.useRealClock();
      lumine.project.setPaths([]);
      await lumine.packages.activatePackage("language-css");
      const main = (await lumine.packages.activatePackage("color-inline")).mainModule;
      const project = main.getProject();
      await project.initialize();
      const editor = lumine.workspace.buildTextEditor();
      editor.getBuffer().setPath(path.join(lumine.getConfigDirPath(), "owned-color-syntax.css"));
      editor.setText("a { color: #123; }\n");
      lumine.grammars.assignGrammar(
        editor.getBuffer(),
        lumine.grammars.grammarForScopeName("source.css"),
      );
      const mode = editor.getBuffer().getLanguageMode();
      expect(mode.asynchronousSyntax).toBeTrue();
      await editor.whenGrammarSettled();
      await mode.refresh();
      const ColorBuffer = require("../lib/color-buffer");
      const colorBuffer = new ColorBuffer({ editor, project });
      await colorBuffer.variablesAvailable();
      let release, entered, timeout, scanSignal;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      spyOn(project.getCandidateScanner(), "scan").and.callFake((_snapshot, { signal }) => {
        scanSignal = signal;
        return new Promise((resolve) => {
          release = () => resolve(null);
          signal.addEventListener("abort", release, { once: true });
          entered();
        });
      });
      const pending = colorBuffer.scanBufferForColors();
      try {
        await started;
        if (retire === "destroy") colorBuffer.destroy();
        else colorBuffer.terminateRunningTask();
        const result = await Promise.race([
          pending,
          new Promise((resolve) => {
            timeout = timers.setTimeout(() => resolve("still waiting"), 100);
          }),
        ]);
        expect(result).toBeNull();
        expect(scanSignal.aborted).toBeTrue();
      } finally {
        timers.clearTimeout(timeout);
        release();
        await pending;
        colorBuffer.destroy();
        editor.destroy();
        await lumine.packages.deactivatePackage("color-inline");
      }
    });
});
