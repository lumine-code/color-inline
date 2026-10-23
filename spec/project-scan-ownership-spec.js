const path = require("node:path");
const timers = require("node:timers/promises");

describe("Color Inline project-variable scan ownership", () => {
  let execution, editor, mode, project, colorBuffer;
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
    editor.getBuffer().setPath(path.join(lumine.getConfigDirPath(), "owned-project-scan.css"));
    editor.setText("a { color: #123; }\n");
    lumine.grammars.assignGrammar(
      editor.getBuffer(),
      lumine.grammars.grammarForScopeName("source.css"),
    );
    mode = editor.getBuffer().getLanguageMode();
    await editor.whenGrammarSettled();
    await mode.refresh();
    const ColorBuffer = require("../lib/color-buffer");
    colorBuffer = new ColorBuffer({ editor, project });
    await colorBuffer.variablesAvailable();
    await colorBuffer.scopeCheckPromise;
  });
  afterEach(async () => {
    if (mode) mode.service.terminalError = null;
    colorBuffer?.destroy();
    editor?.destroy();
    await lumine.packages.deactivatePackage("color-inline");
    lumine.grammars.syntaxExecution = execution;
  });

  async function drain() {
    await timers.setImmediate();
    await colorBuffer.markerUpdatePromise;
    await timers.setImmediate();
  }

  it("owns an initialized buffer's project-event rejection and can refresh after service recovery", async () => {
    const failure = new Error("Owned project color transport failure");
    const report = spyOn(console, "error");
    const scan = spyOn(colorBuffer, "scanBufferForColors").and.callThrough();
    const unhandled = [];
    const observeRejection = (event) => {
      unhandled.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", observeRejection);
    try {
      await jasmine.spyOnGlobalErrorsAsync(async (errors) => {
        mode.service.terminalError = failure;
        project.emitVariablesChangeEvent({});
        await conditionPromise(() => scan.calls.count() > 0);
        await expectAsync(scan.calls.mostRecent().returnValue).toBeRejectedWith(failure);
        await drain();
        await timers.setTimeout(25);
        expect(scan).toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        expect(unhandled).toEqual([]);
        expect(report).toHaveBeenCalledTimes(1);
        mode.service.terminalError = null;
        const previous = scan.calls.count();
        project.emitVariablesChangeEvent({});
        await conditionPromise(() => scan.calls.count() > previous);
        await scan.calls.mostRecent().returnValue;
        await drain();
        expect(colorBuffer.getColorMarkers().length).toBe(1);
        expect(errors).not.toHaveBeenCalled();
      });
    } finally {
      window.removeEventListener("unhandledrejection", observeRejection);
    }
  });

  it("keeps the newer project-variable scan when older work finishes last on the same text", async () => {
    const snapshot = await colorBuffer.scanBufferForColors();
    const Color = require("../lib/color");
    const older = snapshot.map((item) => ({ ...item, color: new Color(255, 0, 0) }));
    const newer = snapshot.map((item) => ({ ...item, color: new Color(0, 0, 255) }));
    const requests = [];
    spyOn(colorBuffer, "scanBufferForColors").and.callFake(
      () => new Promise((resolve) => requests.push(resolve)),
    );
    const revision = editor.getBuffer().getTextRevision();
    try {
      project.emitVariablesChangeEvent({});
      await conditionPromise(() => requests.length === 1);
      project.emitVariablesChangeEvent({});
      await conditionPromise(() => requests.length === 2);
      expect(requests.length).toBe(2);
      requests[1](newer);
      await drain();
      expect(colorBuffer.getColorMarkers()[0].color.rgba).toEqual([0, 0, 255, 1]);
      requests[0](older);
      await drain();
      expect(colorBuffer.getColorMarkers()[0].color.rgba).toEqual([0, 0, 255, 1]);
      expect(editor.getBuffer().getTextRevision()).toBe(revision);
    } finally {
      for (const resolve of requests) resolve([]);
      await drain();
    }
  });

  it("keeps an explicit project refresh rejection observable without an unhandled background promise", async () => {
    const failure = new Error("Owned explicit project refresh failure");
    const report = spyOn(console, "error");
    await jasmine.spyOnGlobalErrorsAsync(async (errors) => {
      mode.service.terminalError = failure;
      await expectAsync(colorBuffer.refreshProjectVariables()).toBeRejectedWith(failure);
      await timers.setTimeout(25);
      expect(report).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
      mode.service.terminalError = null;
      await colorBuffer.refreshProjectVariables();
      expect(colorBuffer.getColorMarkers().length).toBe(1);
    });
  });

  for (const retirement of ["destroy", "newer project event"])
    it(`does not report or publish a late project refresh failure after ${retirement}`, async () => {
      const snapshot = await colorBuffer.scanBufferForColors();
      const requests = [];
      spyOn(colorBuffer, "scanBufferForColors").and.callFake(
        () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
      );
      const report = spyOn(console, "error");
      const failure = new Error("Owned retired project refresh failure");
      let pending;
      await jasmine.spyOnGlobalErrorsAsync(async (errors) => {
        pending = colorBuffer.refreshProjectVariables();
        const rejected = expectAsync(pending).toBeRejectedWith(failure);
        await conditionPromise(() => requests.length === 1);
        if (retirement === "destroy") colorBuffer.destroy();
        else {
          project.emitVariablesChangeEvent({});
          await conditionPromise(() => requests.length === 2);
          requests[1].resolve(snapshot);
          await drain();
        }
        requests[0].reject(failure);
        await rejected;
        await timers.setTimeout(25);
        expect(report).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
        if (retirement !== "destroy")
          expect(colorBuffer.getColorMarkers()[0].color.rgba).toEqual([17, 34, 51, 1]);
      });
    });
});
