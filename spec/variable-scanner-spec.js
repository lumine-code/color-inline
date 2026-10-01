const { runs, _waitsFor, waitsForPromise } = require("./helpers/waiters"); /*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const VariableScanner = require("../lib/variable-scanner");
const registry = require("../lib/variable-expressions");
const scopeFromFileName = require("../lib/scope-from-file-name");

describe("VariableScanner line tracking", function () {
  let scanner;

  beforeEach(function () {
    scanner = new VariableScanner({ registry, scope: "scss" });
  });

  it("puts Sass aliases on the same line and handles mixed line endings", function () {
    const text =
      "$first-color: #fff;\r\n$second-color: #000;\r$third-color: #abc;\n$fourth-color: #def;";
    let start = 0;
    for (let line = 0; line < 4; line++) {
      const result = scanner.search(text, start);
      expect(result.length).toBe(2);
      for (const variable of result) expect(variable.line).toBe(line);
      start = result.lastIndex;
    }
    expect(scanner.search(text, 0)[0].line).toBe(0);
    expect(scanner.search("\n\n$color: #fff;")[0].line).toBe(2);
  });

  it("counts each text character at most twice across successive declarations", function () {
    const text = new String("$color: #fff;\r\n".repeat(1000));
    const characters = spyOn(text, "charCodeAt").and.callThrough();
    let start = 0;
    let result;
    let count = 0;
    while ((result = scanner.search(text, start))) {
      expect(result[0].line).toBe(count++);
      start = result.lastIndex;
    }
    expect(count).toBe(1000);
    expect(characters.calls.count()).toBeLessThan(text.length * 2);
  });

  it("rejects unfinished CSS declarations with long whitespace runs promptly", function () {
    scanner = new VariableScanner({ registry, scope: "css" });
    const started = Date.now();
    expect(scanner.search(`--theme:${" ".repeat(50000)}!`)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("preserves CSS values after leading whitespace, including whitespace-only values", function () {
    scanner = new VariableScanner({ registry, scope: "css" });
    expect(scanner.search("--color:   #ffffff;")[0].value).toBe("#ffffff");
    expect(scanner.search("--blank: \t;")[0].value).toBe("\t");
  });

  it("reuses the regexp and refreshes it when the registry changes", function () {
    const ExpressionsRegistry = require("../lib/expressions-registry");
    const VariableExpression = require("../lib/variable-expression");
    const expressions = new ExpressionsRegistry(VariableExpression);
    scanner = new VariableScanner({ registry: expressions, scope: "css" });
    const first = scanner.getRegExp();
    expect(scanner.getRegExp()).toBe(first);
    expressions.createExpression("test:variable", "(color)=(#[a-f0-9]{6})", ["css"]);
    expect(scanner.getRegExp()).not.toBe(first);
    expect(scanner.search("color=#ffffff")[0].name).toBe("color");
    expressions.removeExpression("test:variable");
    expect(scanner.search("color=#ffffff")).toBeUndefined();
    expressions.createExpression("test:empty-variable", "(?=color)", ["css"]);
    expect(scanner.search("color=#ffffff")).toBeUndefined();
    expressions.removeExpression("test:empty-variable");
    expressions.createExpression("test:empty-handler", "color=#[a-f0-9]{6}", ["css"], () => {});
    expect(scanner.search("color=#ffffff")).toBeUndefined();
    expressions.dispose();
  });
});

describe("VariableScanner", function () {
  let [scanner, editor, text, scope] = Array.from([]);

  const withTextEditor = (fixture, block) =>
    describe(`with ${fixture} buffer`, function () {
      beforeEach(async function () {
        await waitsForPromise(() => lumine.workspace.open(fixture));
        await runs(async function () {
          editor = lumine.workspace.getActiveTextEditor();
          text = editor.getText();
          return (scope = scopeFromFileName(editor.getPath()));
        });
      });

      afterEach(async function () {
        editor = null;
        return (scope = null);
      });

      return block();
    });

  const withScannerForTextEditor = (fixture, block) =>
    withTextEditor(fixture, function () {
      beforeEach(async () => (scanner = new VariableScanner({ registry, scope })));

      afterEach(async () => (scanner = null));

      return block();
    });

  return describe("::search", function () {
    let [result] = Array.from([]);

    withScannerForTextEditor("four-variables.styl", function () {
      beforeEach(async () => (result = scanner.search(text)));

      it("returns the first match", async () => expect(result).toBeDefined());

      describe("the result object", function () {
        it("has a match string", async () => expect(result.match).toEqual("base-color = #fff"));

        it("has a lastIndex property", async () => expect(result.lastIndex).toEqual(17));

        it("has a range property", async () => expect(result.range).toEqual([0, 17]));

        return it("has a variable result", async function () {
          expect(result[0].name).toEqual("base-color");
          expect(result[0].value).toEqual("#fff");
          expect(result[0].range).toEqual([0, 17]);
          return expect(result[0].line).toEqual(0);
        });
      });

      describe("the second result object", function () {
        beforeEach(async () => (result = scanner.search(text, result.lastIndex)));

        it("has a match string", async () =>
          expect(result.match).toEqual("other-color = transparentize(base-color, 50%)"));

        it("has a lastIndex property", async () => expect(result.lastIndex).toEqual(64));

        it("has a range property", async () => expect(result.range).toEqual([19, 64]));

        return it("has a variable result", async function () {
          expect(result[0].name).toEqual("other-color");
          expect(result[0].value).toEqual("transparentize(base-color, 50%)");
          expect(result[0].range).toEqual([19, 64]);
          return expect(result[0].line).toEqual(2);
        });
      });

      return describe("successive searches", () =>
        it("returns a result for each match and then undefined", async function () {
          const doSearch = () => (result = scanner.search(text, result.lastIndex));

          expect(doSearch()).toBeDefined();
          expect(doSearch()).toBeDefined();
          expect(doSearch()).toBeDefined();
          return expect(doSearch()).toBeUndefined();
        }));
    });

    withScannerForTextEditor("incomplete-stylus-hash.styl", function () {
      beforeEach(async () => (result = scanner.search(text)));

      return it("does not find any variables", async () => expect(result).toBeUndefined());
    });

    withScannerForTextEditor("variables-in-arguments.scss", function () {
      beforeEach(async () => (result = scanner.search(text)));

      return it("does not find any variables", async () => expect(result).toBeUndefined());
    });

    withScannerForTextEditor("attribute-selectors.scss", function () {
      beforeEach(async () => (result = scanner.search(text)));

      return it("does not find any variables", async () => expect(result).toBeUndefined());
    });

    withScannerForTextEditor("variables-in-conditions.scss", function () {
      beforeEach(async function () {
        result = null;
        const doSearch = () =>
          (result = scanner.search(text, result != null ? result.lastIndex : undefined));

        doSearch();
        return doSearch();
      });

      return it("does not find the variable in the if clause", async () =>
        expect(result).toBeUndefined());
    });

    withScannerForTextEditor("variables-after-mixins.scss", function () {
      beforeEach(async function () {
        result = null;
        const doSearch = () =>
          (result = scanner.search(text, result != null ? result.lastIndex : undefined));

        return doSearch();
      });

      return it("finds the variable after the mixin", async () => expect(result).toBeDefined());
    });

    withScannerForTextEditor("variables-from-other-process.less", function () {
      beforeEach(async function () {
        result = null;
        const doSearch = () =>
          (result = scanner.search(text, result != null ? result.lastIndex : undefined));

        return doSearch();
      });

      return it("finds the variable with an interpolation tag", async () =>
        expect(result).toBeDefined());
    });

    return withScannerForTextEditor("crlf.styl", function () {
      beforeEach(async function () {
        result = null;
        const doSearch = () =>
          (result = scanner.search(text, result != null ? result.lastIndex : undefined));

        doSearch();
        return doSearch();
      });

      return it("finds all the variables even with crlf mode", async () =>
        expect(result).toBeDefined());
    });
  });
});
