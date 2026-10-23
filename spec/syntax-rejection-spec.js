const path = require("node:path");
const timers = require("node:timers/promises");

describe("Color Inline rejected syntax ownership", () => {
  let execution, editor, mode, project, colorBuffer, ColorBuffer, view;
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
    editor.getBuffer().setPath(path.join(lumine.getConfigDirPath(), "owned-rejected.css"));
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
    if (mode) mode.service.terminalError = null;
    view?.destroy();
    colorBuffer?.destroy();
    editor?.destroy();
    await lumine.packages.deactivatePackage("color-inline");
    lumine.grammars.syntaxExecution = execution;
    colorBuffer = null;
    view = null;
  });

  for (const phase of ["initial", "variables"])
    it(`owns ${phase} background failures while preserving explicit rejection and allowing changed-input recovery`, async () => {
      const failure = new Error("Owned color transport failure");
      const report = spyOn(console, "error");
      let calls = 0,
        failVariables = phase === "variables";
      const request = mode.service.request.bind(mode.service);
      spyOn(mode.service, "request").and.callFake((session, operation, data, options) => {
        if (operation === "analyze" && data.module === require.resolve("../lib/syntax-scan")) {
          calls++;
          if (failVariables && calls >= 2) return Promise.reject(failure);
        }
        return request(session, operation, data, options);
      });
      if (phase === "initial") mode.service.terminalError = failure;
      await jasmine.spyOnGlobalErrorsAsync(async (errors) => {
        colorBuffer = new ColorBuffer({ editor, project });
        if (phase === "initial") {
          const View = require("../lib/color-buffer-element");
          view = new View();
          jasmine.attachToDOM(lumine.views.getView(editor));
          view.setModel(colorBuffer);
        }
        if (phase === "variables") await colorBuffer.initialize();
        const pending =
          phase === "initial" ? colorBuffer.initialize() : colorBuffer.variablesAvailable();
        await expectAsync(pending).toBeRejectedWith(failure);
        await timers.setImmediate();
        const before = calls;
        await expectAsync(
          phase === "initial" ? colorBuffer.initialize() : colorBuffer.variablesAvailable(),
        ).toBeRejectedWith(failure);
        await timers.setImmediate();
        expect(calls).toBe(before);
        expect(errors).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledTimes(1);
        mode.service.terminalError = null;
        failVariables = false;
        if (phase === "initial") mode.service.invalidateConfiguration();
        else editor.getBuffer().append(" ");
        await colorBuffer.update();
        await colorBuffer.variablesAvailable();
        expect(colorBuffer.initialized).toBeTrue();
        expect(colorBuffer.variableInitialized).toBeTrue();
        expect(colorBuffer.getColorMarkers().length).toBe(1);
        expect(errors).not.toHaveBeenCalled();
      });
    });
});
