/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { findClosingIndex, split } = require("../lib/utils");

describe(".split()", function () {
  const tests = [
    ["a,b,c", ["a", "b", "c"]],
    ["a,b(),c", ["a", "b()", "c"]],
    ["a,b(c)", ["a", "b(c)"]],
    ["a,(b, c)", ["a", "(b,c)"]],
    ["a,(b, c())", ["a", "(b,c())"]],
    ["a(b, c())", ["a(b,c())"]],
    ["a,)(", ["a"]],
    ["a(,", []],
    ["(,", []],
    ["(,(,(,)", []],
    ["a,(,", ["a"]],
    ["a,((),", ["a"]],
    ["a,()),", ["a", "()"]],
  ];

  return tests.forEach(function (...args) {
    const [source, expected] = Array.from(args[0]);
    return it(`splits ${jasmine.pp(source)} as ${jasmine.pp(expected)}`, () =>
      expect(split(source)).toEqual(expected));
  });
});

describe(".findClosingIndex()", function () {
  const tests = [
    ["a(", -1],
    ["a()", 2],
    ["a(((()", -1],
  ];

  return tests.forEach(function (...args) {
    const [source, expected] = Array.from(args[0]);
    return it(`returns the closing character index for ${jasmine.pp(source)}`, () =>
      expect(findClosingIndex(source, 2, "(", ")")).toEqual(expected));
  });
});
