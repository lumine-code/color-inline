# color-inline.project

Read access to the scanned colour project: its palette, its variables, and the colour buffers attached to open editors.

|             |                                              |
| ----------- | -------------------------------------------- |
| Version     | `1.0.0`                                      |
| Provided by | `color-inline`                               |
| Consumed by | any package that wants the project's colours |
| Owner       | `color-inline`                               |

## Registration

Consume it from your `package.json`:

```json
"consumedServices": {
  "color-inline.project": {
    "versions": {
      "^1.0.0": "consumeColorInlineProject"
    }
  }
}
```

Your method is called with the API object and may return a `Disposable`.

## Contract

The provided object exposes these methods. All of them read; nothing here mutates the project.

| method                          | returns                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `getProject()`                  | the `ColorProject` itself                                                    |
| `getPalette()`                  | the `Palette` of every colour variable in the project                        |
| `getVariables()`                | every variable found, colour or not                                          |
| `getColorVariables()`           | only the variables whose value is a colour                                   |
| `observeColorBuffers(callback)` | a `Disposable`; calls back for every existing colour buffer and each new one |

A variable carries at least `name`, `value`, `path`, `line` and `isColor`; a colour variable also carries a `color` with `red`, `green`, `blue` and `alpha`.

## Minimal example

```js
module.exports = {
  consumeColorInlineProject(colorInline) {
    this.colorInline = colorInline;

    return colorInline.observeColorBuffers((colorBuffer) => {
      console.log(colorBuffer.editor.getPath(), colorBuffer.getColorMarkers().length);
    });
  },
};
```

## Behavior

The project scans lazily. `getVariables()` answers with what has been found so far, which is empty until the first scan settles, so a consumer that needs the whole set should wait on `getProject().initialize()` rather than reading immediately.

## Teardown

`observeColorBuffers` returns a `Disposable`, and whatever your consume method returns is disposed when `color-inline` deactivates. Hold no reference to a colour buffer past its `onDidDestroy`.

## Versioning

`1.0.0`. A change to any method's name, arguments or return shape is a new major version.
