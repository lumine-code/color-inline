/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

const ColorContext = require("../lib/color-context");
const registry = require("../lib/color-expressions");

describe("ColorContext", function () {
  let [context, _parser] = Array.from([]);

  const itParses = (expression) => ({
    asUndefined() {
      return it(`parses '${expression}' as undefined`, () =>
        expect(context.getValue(expression)).toBeUndefined());
    },

    asUndefinedColor() {
      return it(`parses '${expression}' as undefined color`, () =>
        expect(context.readColor(expression)).toBeUndefined());
    },

    asInt(expected) {
      return it(`parses '${expression}' as an integer with value of ${expected}`, () =>
        expect(context.readInt(expression)).toEqual(expected));
    },

    asFloat(expected) {
      return it(`parses '${expression}' as a float with value of ${expected}`, () =>
        expect(context.readFloat(expression)).toEqual(expected));
    },

    asIntOrPercent(expected) {
      return it(`parses '${expression}' as an integer or a percentage with value of ${expected}`, () =>
        expect(context.readIntOrPercent(expression)).toEqual(expected));
    },

    asFloatOrPercent(expected) {
      return it(`parses '${expression}' as a float or a percentage with value of ${expected}`, () =>
        expect(context.readFloatOrPercent(expression)).toEqual(expected));
    },

    asColorExpression(expected) {
      return it(`parses '${expression}' as a color expression`, () =>
        expect(context.readColorExpression(expression)).toEqual(expected));
    },

    asColor(...expected) {
      return it(`parses '${expression}' as a color with value of ${jasmine.pp(expected)}`, () =>
        expect(context.readColor(expression)).toBeColor(...Array.from(expected || [])));
    },

    asInvalidColor(..._expected) {
      return it(`parses '${expression}' as an invalid color`, () =>
        expect(context.readColor(expression)).not.toBeValid());
    },
  });

  describe("created without any variables", function () {
    beforeEach(() => (context = new ColorContext({ registry })));

    itParses("10").asInt(10);

    itParses("10").asFloat(10);
    itParses("0.5").asFloat(0.5);
    itParses(".5").asFloat(0.5);

    itParses("10").asIntOrPercent(10);
    itParses("10%").asIntOrPercent(26);

    itParses("0.1").asFloatOrPercent(0.1);
    itParses("10%").asFloatOrPercent(0.1);

    itParses("red").asColorExpression("red");

    itParses("red").asColor(255, 0, 0);
    itParses("#ff0000").asColor(255, 0, 0);
    return itParses("rgb(255,127,0)").asColor(255, 127, 0);
  });

  describe("with a variables array", function () {
    const createVar = (name, value, path) => ({
      value,
      name,
      path: path != null ? path : "/path/to/file.coffee",
    });

    const createColorVar = function (name, value, path) {
      const v = createVar(name, value, path);
      v.isColor = true;
      return v;
    };

    describe("that contains valid variables", function () {
      beforeEach(function () {
        const variables = [
          createVar("x", "10"),
          createVar("y", "0.1"),
          createVar("z", "10%"),
          createColorVar("c", "rgb(255,127,0)"),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({ variables, colorVariables, registry }));
      });

      itParses("x").asInt(10);
      itParses("y").asFloat(0.1);
      itParses("z").asIntOrPercent(26);
      itParses("z").asFloatOrPercent(0.1);

      itParses("c").asColorExpression("rgb(255,127,0)");
      return itParses("c").asColor(255, 127, 0);
    });

    describe("that contains alias for named colors", function () {
      beforeEach(function () {
        const variables = [
          createColorVar("$text-color", "white", "/path/to/file.css.sass"),
          createColorVar("$background-color", "black", "/path/to/file.css.sass"),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({ variables, colorVariables, registry }));
      });

      itParses("$text-color").asColor(255, 255, 255);
      return itParses("$background-color").asColor(0, 0, 0);
    });

    describe("that contains invalid colors", function () {
      beforeEach(function () {
        const variables = [
          createVar("@text-height", "@scale-b-xxl * 1rem"),
          createVar("@component-line-height", "@text-height"),
          createVar("@list-item-height", "@component-line-height"),
        ];

        return (context = new ColorContext({ variables, registry }));
      });

      return itParses("@list-item-height").asUndefinedColor();
    });

    describe("that contains circular references between ordinary variables", function () {
      beforeEach(function () {
        const variables = [
          createVar("@foo", "@bar"),
          createVar("@bar", "@baz"),
          createVar("@baz", "@foo"),
          createVar("@taz", "@taz"),
        ];

        return (context = new ColorContext({ variables, registry }));
      });

      itParses("@foo").asUndefined();
      return itParses("@taz").asUndefined();
    });

    describe("that contains circular references between color variables", function () {
      beforeEach(function () {
        const variables = [
          createColorVar("@foo", "@bar"),
          createColorVar("@bar", "@baz"),
          createColorVar("@baz", "@foo"),
          createColorVar("@taz", "@taz"),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({ variables, colorVariables, registry }));
      });

      itParses("@foo").asInvalidColor();
      itParses("@foo").asUndefined();
      return itParses("@taz").asUndefined();
    });

    return describe("that contains circular references nested in operations", function () {
      beforeEach(function () {
        const variables = [
          createColorVar("@foo", "complement(@bar)"),
          createColorVar("@bar", "transparentize(@baz, 0.5)"),
          createColorVar("@baz", "darken(@foo, 10%)"),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({ variables, colorVariables, registry }));
      });

      return itParses("@foo").asInvalidColor();
    });
  });

  describe("with variables from a default file", function () {
    let [projectPath, referenceVariable] = Array.from([]);
    const createVar = function (name, value, path, isDefault = false) {
      if (path == null) {
        path = `${projectPath}/file.styl`;
      }
      return { value, name, path, default: isDefault };
    };

    const createColorVar = function (name, value, path, isDefault) {
      const v = createVar(name, value, path, isDefault);
      v.isColor = true;
      return v;
    };

    describe("when there is another valid value", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createVar("b", "10", `${projectPath}/b.styl`, true),
          createVar("b", "20", `${projectPath}/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asInt(20);
    });

    describe("when there is no another valid value", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createVar("b", "10", `${projectPath}/b.styl`, true),
          createVar("b", "c", `${projectPath}/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asInt(10);
    });

    describe("when there is another valid color", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createColorVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createColorVar("b", "#ff0000", `${projectPath}/b.styl`, true),
          createColorVar("b", "#0000ff", `${projectPath}/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asColor(0, 0, 255);
    });

    return describe("when there is no another valid color", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createColorVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createColorVar("b", "#ff0000", `${projectPath}/b.styl`, true),
          createColorVar("b", "c", `${projectPath}/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asColor(255, 0, 0);
    });
  });

  describe("with a reference variable", function () {
    let [projectPath, referenceVariable] = Array.from([]);
    const createVar = function (name, value, path) {
      if (path == null) {
        path = `${projectPath}/file.styl`;
      }
      return { value, name, path };
    };

    const _createColorVar = function (name, value) {
      const v = createVar(name, value);
      v.isColor = true;
      return v;
    };

    describe("when there is a single root path", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "10", `${projectPath}/a.styl`);

        const variables = [referenceVariable, createVar("a", "20", `${projectPath}/b.styl`)];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asInt(10);
    });

    return describe("when there are many root paths", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createVar("b", "10", `${projectPath}/b.styl`),
          createVar("b", "20", `${projectPath}2/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referenceVariable,
          rootPaths: [projectPath, `${projectPath}2`],
        }));
      });

      return itParses("a").asInt(10);
    });
  });

  return describe("with a reference path", function () {
    let [projectPath, referenceVariable] = Array.from([]);
    const createVar = function (name, value, path) {
      if (path == null) {
        path = `${projectPath}/file.styl`;
      }
      return { value, name, path };
    };

    const _createColorVar = function (name, value) {
      const v = createVar(name, value);
      v.isColor = true;
      return v;
    };

    describe("when there is a single root path", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "10", `${projectPath}/a.styl`);

        const variables = [referenceVariable, createVar("a", "20", `${projectPath}/b.styl`)];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referencePath: `${projectPath}/a.styl`,
          rootPaths: [projectPath],
        }));
      });

      return itParses("a").asInt(10);
    });

    return describe("when there are many root paths", function () {
      beforeEach(function () {
        projectPath = lumine.project.getPaths()[0];
        referenceVariable = createVar("a", "b", `${projectPath}/a.styl`);

        const variables = [
          referenceVariable,
          createVar("b", "10", `${projectPath}/b.styl`),
          createVar("b", "20", `${projectPath}2/b.styl`),
        ];

        const colorVariables = variables.filter((v) => v.isColor);

        return (context = new ColorContext({
          registry,
          variables,
          colorVariables,
          referencePath: `${projectPath}/a.styl`,
          rootPaths: [projectPath, `${projectPath}2`],
        }));
      });

      return itParses("a").asInt(10);
    });
  });
});
