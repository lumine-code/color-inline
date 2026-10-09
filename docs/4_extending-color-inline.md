## Extending Color Inline

A package provides `color-inline.color-expressions` or `color-inline.variable-expressions`, and Color Inline consumes its contribution. Declare the provided service in `package.json`; the consume lease removes the registered instances when your package withdraws the service.

### Adding Color Expressions

```json
"providedServices": {
  "color-inline.color-expressions": {
    "versions": { "1.0.0": "provideColorExpressions" }
  }
}
```

A provider can return one expression:

```js
module.exports = {
  provideColorExpressions() {
    return {
      name: "my-package:custom-color",
      regexpString: "color\\[([a-fA-F0-9]{6})\\]",
      scopes: ["my-scope"],
      handle(match) {
        this.hex = match[1];
      },
    };
  },
};
```

To register several expressions, return an `expressions` array:

```js
module.exports = {
  provideColorExpressions() {
    return {
      expressions: [
        {
          name: "my-package:custom-color",
          regexpString: "color\\[([a-fA-F0-9]{6})\\]",
          scopes: ["my-scope"],
          handle(match) {
            this.hex = match[1];
          },
        },
        {
          name: "my-package:custom-color-alpha",
          regexpString: "color\\[([a-fA-F0-9]{6}),\\s*(\\d+)\\]",
          scopes: ["my-scope"],
          handle(match) {
            this.hex = match[1];
            this.alpha = Number(match[2]) / 100;
          },
        },
      ],
    };
  },
};
```

`name` is unique and conventionally namespaced. `regexpString` is JavaScript regular-expression source; its captures are passed to `handle(match, expression, context)`, with `this` bound to the color being constructed. Set its channels, `hex` or `rgba` to produce a color. `scopes` defaults to `['*']`, and higher `priority` values are tried first. See the [color expression contract](2_color-inline-color-expressions.md) and [ColorContext API](5_color-context-api.md).

Contributed handlers retain their live module scope. Built-in project evaluation can run in a worker; external handlers execute in the renderer or receive their matched excerpt over IPC. They are not rebuilt from `toString()`.

### Adding Variable Expressions

```json
"providedServices": {
  "color-inline.variable-expressions": {
    "versions": { "1.0.0": "provideVariableExpressions" }
  }
}
```

Without a handler, the first two captures become the variable name and value:

```js
module.exports = {
  provideVariableExpressions() {
    return {
      name: "my-package:custom-variable",
      regexpString: "\\[\\[(\\w+):([^\\]]+)\\]\\]",
      scopes: ["my-scope"],
    };
  },
};
```

The array form has the same shape:

```js
module.exports = {
  provideVariableExpressions() {
    return {
      expressions: [
        {
          name: "my-package:custom-variable",
          regexpString: "\\[\\[(\\w+):([^\\]]+)\\]\\]",
          scopes: ["my-scope"],
        },
      ],
    };
  },
};
```

Variable expressions are scanned only in files matched by `sourceNames`. An optional complex handler receives `(match, solver)` and calls `solver.appendResult(name, value, startIndex, endIndex)`, followed by `solver.endParsing(endIndex)`, or `solver.abortParsing()` to discard the result. Offsets are relative to the matched excerpt. See the [variable expression contract](3_color-inline-variable-expressions.md).
