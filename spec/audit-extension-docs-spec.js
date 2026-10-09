const fs = require("node:fs");
const path = require("node:path");

describe("Color Inline maintained extension examples", () => {
  let main, leases;
  beforeEach(async () => {
    lumine.project.setPaths([]);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    leases = [];
  });
  afterEach(async () => {
    leases.forEach((lease) => lease.dispose());
    await lumine.packages.deactivatePackage("color-inline");
  });
  const examples = [
    ...fs
      .readFileSync(path.join(__dirname, "../docs/4_extending-color-inline.md"), "utf8")
      .replace(/\r\n/g, "\n")
      .matchAll(/```js\n([\s\S]*?)\n```/g),
  ].map((match) => match[1]);
  for (let index = 0; index < 4; index++) {
    it(`runs documented provider example ${index + 1} through the live public consume path`, () => {
      expect(examples.length).toBe(4);
      const module = { exports: {} };
      try {
        // Accept the former ESM export spelling without repairing its function
        // syntax, captures or return shape; the provider then uses the live API.
        const source = examples[index].replace(/\bexport default\b/, "module.exports =");
        require("node:vm").runInNewContext(source, { module }, { timeout: 1000 });
      } catch (error) {
        // Report a host error; Jasmine cannot format this VM realm's stack.
        throw new Error(`Documented example could not compile: ${error.message}`, { cause: error });
      }
      const provider = module.exports;
      if (index < 2) {
        const contribution = provider.provideColorExpressions();
        leases.push(main.consumeColorExpressions(contribution));
        const Context = require("../lib/color-context");
        const context = new Context({
          registry: main.getProject().getColorExpressionsRegistry(),
          scope: "my-scope",
        });
        expect(context.readColor("color[FFC6ae]").rgba).toEqual([255, 198, 174, 1]);
        if (index === 1)
          expect(context.readColor("color[FFC6ae, 75]").rgba).toEqual([255, 198, 174, 0.75]);
      } else {
        leases.push(main.consumeVariableExpressions(provider.provideVariableExpressions()));
        const Scanner = require("../lib/variable-scanner");
        const scanner = new Scanner({
          registry: main.getProject().getVariableExpressionsRegistry(),
          scope: "my-scope",
        });
        const result = scanner.search("[[red:250,0,0,1]]", 0);
        expect(result[0].name).toBe("red");
        expect(result[0].value).toBe("250,0,0,1");
      }
    });
  }
});
