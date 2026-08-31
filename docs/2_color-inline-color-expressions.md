# color-inline.color-expressions

Lets a package teach `color-inline` to recognise a colour notation it does not know.

|             |                                      |
| ----------- | ------------------------------------ |
| Version     | `1.0.0`                              |
| Provided by | any package adding a colour notation |
| Consumed by | `color-inline`                       |
| Owner       | `color-inline`                       |

This is a hub contract: `color-inline` is the consumer, and other packages provide into it.

## Registration

```json
"providedServices": {
  "color-inline.color-expressions": {
    "versions": {
      "1.0.0": "provideColorExpressions"
    }
  }
}
```

Return either one expression or `{ expressions: [...] }`. `color-inline` hands back a `Disposable` that removes what you registered, so deactivating your package removes your notation with it.

## Contract

Required fields:

| field          | type     | meaning                                                        |
| -------------- | -------- | -------------------------------------------------------------- |
| `name`         | `String` | unique, namespaced by convention as `your-package:notation`    |
| `regexpString` | `String` | the notation, as regular-expression **source**, not a `RegExp` |

Optional fields:

| field      | type            | default | meaning                                                                                                                              |
| ---------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `handle`   | `Function`      | —       | `(match, expression, context)`; sets `this.rgba` and `this.colorExpression`. Without it the expression matches but yields no colour. |
| `scopes`   | `Array<String>` | `['*']` | which languages it applies to, as `language` or `language:dialect`                                                                   |
| `priority` | `Number`        | `0`     | higher wins where two expressions match the same text                                                                                |

`regexpString` is a string because every registered expression is concatenated into one alternation. It is matched by JavaScript's engine, so look-around is available — but note that a look-around expression cannot be handed to ripgrep, which is why the project search reads files itself.

## Minimal example

```js
module.exports = {
  provideColorExpressions() {
    return {
      name: "my-package:bracket_color",
      // [[red:250,0,0,1]]
      regexpString: "\\[\\[(\\w+):([^\\]]+)\\]\\]",
      scopes: ["*"],
      handle(match, expression, context) {
        const [, , components] = match;
        this.rgba = context.readColor(`rgba(${components})`).rgba;
        this.colorExpression = match[0];
      },
    };
  },
};
```

## Behavior

`handle` runs with `this` set to the colour being built. Setting `this.rgba` is what makes it a colour; leaving it unset marks the match invalid and it is not drawn. `context` resolves variables and nested expressions — see `5_color-context-api.md`.

Registering or removing an expression invalidates the cached alternation and re-scans every open buffer.

## Versioning

`1.0.0`. Adding an optional field is a minor version; changing `handle`'s arguments or the meaning of `rgba` is a major one.
