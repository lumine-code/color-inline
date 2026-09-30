describe("cooperative buffer scanning", () => {
  let scanTextForColorsAsync, scanTextForVariablesAsync, registry, clock, onFirstMatch;

  beforeEach(() => {
    jasmine.useRealClock();
    ({ scanTextForColorsAsync, scanTextForVariablesAsync } = require("../lib/buffer-scanner"));
    const ExpressionsRegistry = require("../lib/expressions-registry");
    const ColorExpression = require("../lib/color-expression");
    registry = new ExpressionsRegistry(ColorExpression);
    clock = 0;
    onFirstMatch = null;
    spyOn(Date, "now").and.callFake(() => clock);
    registry.createExpression("test:color", "#abcdef", function () {
      clock++;
      if (clock === 1) onFirstMatch?.();
      this.rgba = [171, 205, 239, 1];
    });
  });

  afterEach(() => registry.dispose());

  const options = () => ({
    registry,
    scope: "css",
    variables: [],
    colorVariables: [],
    bufferPath: "large.css",
  });

  it("lets queued input run before a scan and between batches", async () => {
    let inputProcessed = false;
    onFirstMatch = () =>
      setTimeout(() => {
        inputProcessed = true;
        expect(clock).toBeGreaterThan(0);
        expect(clock).toBeLessThan(100);
      }, 0);
    const promise = scanTextForColorsAsync("#abcdef\n".repeat(100), options());
    const results = await promise;
    expect(inputProcessed).toBe(true);
    expect(results.length).toBe(100);
    expect(results[99].line).toBe(99);
  });

  it("cancels an obsolete scan without returning partial results", async () => {
    let aborted = false;
    onFirstMatch = () => setTimeout(() => (aborted = true), 0);
    const promise = scanTextForColorsAsync("#abcdef\n".repeat(100), {
      ...options(),
      shouldAbort: () => aborted,
    });
    expect(await promise).toBeNull();
    expect(clock).toBeGreaterThan(0);
    expect(clock).toBeLessThan(100);
  });

  it("keeps contributed handlers and variable declaration ranges", async () => {
    const VariableExpression = require("../lib/variable-expression");
    const ExpressionsRegistry = require("../lib/expressions-registry");
    const variables = new ExpressionsRegistry(VariableExpression);
    const value = "#abcdef";
    variables.createExpression("test:variable", "(brand)=#[a-f]+", function (match, solver) {
      solver.appendResult(match[1], value, 0, match[0].length);
      solver.endParsing(match[0].length);
    });
    const batches = [];
    const results = await scanTextForVariablesAsync("brand=#abcdef", {
      registry: variables,
      scope: "css",
      onBatch: (batch) => batches.push(batch.range),
    });
    expect(results[0].value).toBe(value);
    expect(batches).toEqual([[0, 13]]);
    variables.dispose();
  });
});
