# color-inline

Show colors inline and collect them across the project.

Every colour in an open file is marked where it is written, and the variables a project declares are scanned so that a name resolves to the colour it stands for, wherever it was defined.

## Features

- **Inline marks**: every colour in the editor is marked, as a background, an underline, an outline, a dot or a gutter mark.
- **Variable resolution**: a colour written as a variable resolves to its value, including through other variables and across files.
- **Colour functions**: `darken`, `lighten`, `mix`, `tint`, `shade`, `hsl`, `hwb` and the rest, in CSS, Less, Sass, Stylus and their dialects.
- **Palette**: every colour the project defines, in one pane, sorted or grouped by file.
- **Find colors**: every use of a colour across the project, with its file and line.
- **Conversions**: convert or copy the colour under the cursor as hexadecimal, RGB, RGBA, HSL or HSLA.
- **Completions**: colour names and colour variables offered while typing.
- **Extensible**: other packages contribute their own colour and variable expressions through the services.

## Installation

To install `color-inline` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/color-inline`.

## Commands

Commands available in `lumine-workspace`:

- `color-inline:show-palette`: open the project's colour palette,
- `color-inline:find-colors`: search the project for every use of a colour,
- `color-inline:report`: write a report of the project's colours,
- `color-inline:reload`: rescan the project for variables,
- `color-inline:project-settings`: open this project's colour settings.

Commands available in `lumine-text-editor`, acting on the colour under the cursor:

- `color-inline:convert-to-hex`: rewrite it as hexadecimal,
- `color-inline:convert-to-rgb`: rewrite it as RGB,
- `color-inline:convert-to-rgba`: rewrite it as RGBA,
- `color-inline:convert-to-hsl`: rewrite it as HSL,
- `color-inline:convert-to-hsla`: rewrite it as HSLA,
- `color-inline:copy-as-hex`: copy it as hexadecimal,
- `color-inline:copy-as-rgb`: copy it as RGB,
- `color-inline:copy-as-rgba`: copy it as RGBA,
- `color-inline:copy-as-hsl`: copy it as HSL,
- `color-inline:copy-as-hsla`: copy it as HSLA.

## Usage

Variables are scanned from the files matching the `sourceNames` setting, which covers CSS, Less, Sass, SCSS and Stylus by default. Which files get colour marks is a separate question, answered by `supportedFiletypes` — every file by default. Colour _words_ such as `red` or `whitesmoke` are only marked in the file types listed in `filetypesForColorWords`, so prose is not littered with them.

The scan uses the editor's bundled ripgrep to find candidate files and honours the repository's ignore rules; `ignoredNames` excludes further paths, and a pattern naming a directory excludes everything beneath it.

## Customization

The marks are styled from the theme's own variables. To change how a colour mark reads, paste something like this into your `styles.css`:

```css
lumine-text-editor .color-inline-background {
  border-radius: 3px;
  opacity: 0.85;
}
```

## Services

- [`color-inline.project`](docs/1_color-inline-project.md): provided to expose the scanned colour project, its palette, its variables and its buffers.
- `autocomplete.provider`: provided to complete colour names and colour variables while typing.
- [`color-inline.color-expressions`](docs/2_color-inline-color-expressions.md): consumed so other packages can add colour expressions.
- [`color-inline.variable-expressions`](docs/3_color-inline-variable-expressions.md): consumed so other packages can add variable expressions.

Extending the colour and variable expressions is described in [docs/4_extending-color-inline.md](docs/4_extending-color-inline.md), and the parsing context in [docs/5_color-context-api.md](docs/5_color-context-api.md).

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
