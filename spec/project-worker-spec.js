const path = require("path");
const { EventEmitter } = require("events");

describe("Color Inline project worker", () => {
  let scanner, registry;

  beforeEach(() => {
    jasmine.useRealClock();
    const { PathsScanner } = require("../lib/paths-scanner");
    registry = require("../lib/variable-expressions");
    scanner = new PathsScanner();
  });

  afterEach(() => scanner.terminateRunningTask());

  it("scans and evaluates builtin variables in a separate persistent process", async () => {
    const filePath = path.join(__dirname, "fixtures", "four-variables.styl");
    const first = await scanner.scanProject([[filePath, "styl"]], registry);

    expect(first.preEvaluated).toBe(true);
    expect(first.workerPid).not.toBe(process.pid);
    expect(first.variables.length).toBe(4);
    expect(first.variables[0].color).toEqual([255, 255, 255, 1]);
    expect(first.variables[1].color).toEqual([255, 255, 255, 0.5]);
    expect(first.variables[1].variables).toContain("base-color");

    const second = await scanner.scanProject([[filePath, "styl"]], registry, {
      state: { content: first.variables },
    });
    expect(second.workerPid).toBe(first.workerPid);
    expect(second.variables.map((variable) => variable.color)).toEqual(
      first.variables.map((variable) => variable.color),
    );
  });

  it("loads builtin declaration handlers with their module closures intact", async () => {
    const filePath = path.join(__dirname, "fixtures", "variables-after-mixins.scss");
    const result = await scanner.scanProject([[filePath, "scss:compass"]], registry);

    expect(result.preEvaluated).toBe(true);
    expect(result.variables.map((variable) => variable.name)).toEqual(["$white"]);
    expect(result.variables[0].default).toBe(true);
    expect(result.variables[0].color).toEqual([255, 255, 255, 1]);
  });

  it("returns removed source paths with the complete evaluated snapshot", async () => {
    const filePath = path.join(__dirname, "fixtures", "missing-source.styl");
    const result = await scanner.scanProject([[filePath, "styl"]], registry, {
      state: {
        content: [
          {
            name: "accent",
            value: "#abc",
            path: filePath,
            range: [0, 12],
            line: 0,
            isColor: true,
            color: [170, 187, 204, 1],
            variables: [],
          },
        ],
      },
    });

    expect(result.variables).toEqual([]);
    expect(result.paths).toEqual([filePath]);
  });

  it("applies Sass implementation settings independently on each worker request", async () => {
    const filePath = path.join(__dirname, "fixtures", "worker-functions.txt");
    const compass = await scanner.scanProject([[filePath, "scss:compass"]], registry, {
      config: { sassShadeAndTintImplementation: "compass" },
    });
    const bourbon = await scanner.scanProject([[filePath, "scss:bourbon"]], registry, {
      config: { sassShadeAndTintImplementation: "bourbon" },
    });

    expect(compass.workerPid).toBe(bourbon.workerPid);
    expect(compass.variables.find((variable) => variable.name === "$tint").color).toEqual([
      255, 191, 191, 1,
    ]);
    expect(bourbon.variables.find((variable) => variable.name === "$tint").color).toEqual([
      255, 63, 63, 1,
    ]);
  });

  describe("when the worker fails or is cancelled", () => {
    let task, start;

    beforeEach(() => {
      task = {
        childProcess: new EventEmitter(),
        on: () => ({ dispose() {} }),
        start: (_options, callback) => (start = callback),
        terminate: jasmine.createSpy("terminate"),
      };
      spyOn(require("lumine"), "Task").and.returnValue(task);
    });

    it("rejects worker errors instead of leaving initialization pending", async () => {
      const pending = scanner.scanProject([["palette.css", "css"]], registry);
      const rejected = expectAsync(pending).toBeRejectedWithError("worker failure");
      await flushMicrotasks();
      start({ error: "worker failure" });
      await rejected;
      expect(task.terminate).toHaveBeenCalled();
      expect(scanner.worker).toBe(null);
    });

    it("rejects an unexpected worker exit", async () => {
      const pending = scanner.scanProject([["palette.css", "css"]], registry);
      const rejected = expectAsync(pending).toBeRejectedWithError(
        "Color Inline project worker exited (1).",
      );
      await flushMicrotasks();
      task.childProcess.emit("exit", 1);
      await rejected;
      expect(scanner.worker).toBe(null);
    });

    it("terminates the process and drops active and queued results on cancellation", async () => {
      const first = scanner.scanProject([["first.css", "css"]], registry);
      const second = scanner.scanProject([["second.css", "css"]], registry);
      await flushMicrotasks();
      scanner.terminateRunningTask();
      start({ variables: [{ name: "stale" }], paths: [], preEvaluated: true });

      expect(await first).toBe(null);
      expect(await second).toBe(null);
      expect(task.terminate).toHaveBeenCalledTimes(1);
    });
  });
});
