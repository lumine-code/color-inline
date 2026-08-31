# color-inline.variable-expressions

Lets a package teach `color-inline` to recognise a variable declaration it does not know, so the values it declares can be resolved wherever they are used.

|             |                                         |
| ----------- | --------------------------------------- |
| Version     | `1.0.0`                                 |
| Provided by | any package adding a declaration syntax |
| Consumed by | `color-inline`                          |
| Owner       | `color-inline`                          |

This is a hub contract: `color-inline` is the consumer, and other packages provide into it.

## Registration

```json
"providedServices": {
  "color-inline.variable-expressions": {
    "versions": {
      "1.0.0": "provideVariableExpressions"
    }
  }
}
```

Return either one expression or `{ expressions: [...] }`. `color-inline` hands back a `Disposable` that removes what you registered.

## Contract

Required fields:

| field          | type     | meaning                                                        |
| -------------- | -------- | -------------------------------------------------------------- |
| `name`         | `String` | unique, namespaced by convention as `your-package:declaration` |
| `regexpString` | `String` | the declaration, as regular-expression **source**              |

Optional fields:

| field      | type            | default | meaning                                                                                    |
| ---------- | --------------- | ------- | ------------------------------------------------------------------------------------------ |
| `handle`   | `Function`      | —       | `(match, expression, context)`; pushes results with `this.addVariable(name, value, range)` |
| `scopes`   | `Array<String>` | `['*']` | which languages it applies to                                                              |
| `priority` | `Number`        | `0`     | higher wins where two expressions match the same text                                      |

Without a `handle`, the first two capture groups are taken as the name and the value, which covers most `name: value` syntaxes.

## Minimal example

```js
module.exports = {
  provideVariableExpressions() {
    return {
      name: "my-package:arrow_declaration",
      // primary -> #ff0000
      regexpString: "([\\w-]+)\\s*->\\s*(\\S+)",
      scopes: ["*"],
    };
  },
};
```

## Behavior

Variable expressions run over the files matched by the `sourceNames` setting, not over every file, so a declaration syntax that lives elsewhere needs that setting widened before it is seen.

Registering or removing an expression re-scans the project's variables, which in turn re-resolves every colour that referred to one.

## Versioning

`1.0.0`. Adding an optional field is a minor version; changing `handle`'s arguments or the default capture-group meaning is a major one.
