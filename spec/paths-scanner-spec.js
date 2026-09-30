const path = require("path");
const fs = require("fs/promises");

describe("PathsScanner contributed expressions", () => {
  let scanner, registry;
  const filePath = path.join(__dirname, "worker-fixtures", "service.css");

  beforeEach(() => {
    jasmine.useRealClock();
    const { PathsScanner } = require("../lib/paths-scanner");
    const ExpressionsRegistry = require("../lib/expressions-registry");
    const VariableExpression = require("../lib/variable-expression");
    registry = new ExpressionsRegistry(VariableExpression);
    scanner = new PathsScanner();
  });

  afterEach(() => scanner.terminateRunningTask());

  it("scans files in the worker while calling only matched service handlers in their original closure", async () => {
    const value = "#456";
    const handlerPids = [];
    registry.createExpression(
      "test:closed-variable",
      "(--[a-z]+):\\s*(#[0-9a-f]+);",
      100,
      ["css"],
      function (match, solver) {
        handlerPids.push(process.pid);
        if (match[1] !== "--skip")
          solver.appendResult(`provided:${match[1]}`, value, 0, match[0].length);
        return solver.endParsing(match[0].length);
      },
    );
    // Project reads must stay out of the renderer even with a live provider.
    const readFile = fs.readFile;
    spyOn(fs, "readFile").and.callFake((target, ...args) => {
      if (target === filePath) throw new Error("renderer must not read project files");
      return readFile(target, ...args);
    });

    const result = await scanner.scanProject([[filePath, "css"]], registry);

    expect(result.workerPid).not.toBe(process.pid);
    expect(result.preEvaluated).toBe(true);
    expect(result.variables.map((variable) => variable.name)).toEqual([
      "provided:--accent",
      "provided:--next",
    ]);
    expect(result.variables.map((variable) => variable.value)).toEqual([value, value]);
    expect(result.variables.map((variable) => variable.line)).toEqual([0, 2]);
    expect(handlerPids).toEqual([process.pid, process.pid, process.pid]);
    expect(fs.readFile.calls.allArgs().some(([target]) => target === filePath)).toBe(false);
  });

  it("preserves contributed declaration priority over builtin expressions", async () => {
    const builtin = require("../lib/variable-expressions");
    for (const expression of builtin.getExpressions()) registry.addExpression(expression, true);
    registry.sealBuiltins();
    registry.createExpression(
      "test:priority",
      "(--[a-z]+):\\s*(#[0-9a-f]+);",
      100,
      ["css"],
      function (match, solver) {
        solver.appendResult(`custom:${match[1]}`, "#fff", 0, match[0].length);
        return solver.endParsing(match[0].length);
      },
    );

    const variables = await scanner.scan([[filePath, "css"]], registry);

    expect(variables.map((variable) => variable.name)).toEqual([
      "custom:--accent",
      "custom:--skip",
      "custom:--next",
    ]);
    expect(variables[0].definitionRange).toEqual([0, 15]);
  });

  it("keeps filesystem scans in the worker when color evaluation needs a live provider", async () => {
    const colorRegistry = {
      hasExternalExpressions: () => true,
    };
    const builtin = require("../lib/variable-expressions");
    const readFile = fs.readFile;
    spyOn(fs, "readFile").and.callFake((target, ...args) => {
      if (target === filePath) throw new Error("renderer must not read project files");
      return readFile(target, ...args);
    });

    const result = await scanner.scanProject([[filePath, "css"]], builtin, { colorRegistry });

    expect(result.workerPid).not.toBe(process.pid);
    expect(result.preEvaluated).toBe(false);
    expect(result.variables.length).toBe(3);
    expect(fs.readFile.calls.allArgs().some(([target]) => target === filePath)).toBe(false);
  });

  it("reports an error thrown by a contributed handler without leaving its worker waiting", async () => {
    registry.createExpression("test:broken", "(--[a-z]+):\\s*(#[0-9a-f]+);", ["css"], function () {
      throw new Error("contributed declaration failed");
    });

    await expectAsync(scanner.scan([[filePath, "css"]], registry)).toBeRejectedWithError(
      "contributed declaration failed",
    );
    expect(scanner.worker).toBe(null);
  });
});
