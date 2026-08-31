// Registers what activating the package would register, for specs that build a
// ColorProject or a ColorBuffer directly instead.
//
// The manifest's `viewProviders` and `deserializers` entries only take effect
// on activation, so a spec that constructs the model itself gets "Can't create
// a view for ColorBuffer instance" the moment the project opens an editor, and
// a deserialized project comes back with `variables` undefined.
//
// Registered per spec rather than once per file: the harness rebuilds the
// environment between specs, and anything added to the previous registry is not
// on the new one.

// Named explicitly rather than relying on each class's `.name`, which is what
// the serialized state carries and what a minifier would be free to change.
const DESERIALIZERS = [
  ["VariablesCollection", "../../lib/variables-collection"],
  ["ColorProject", "../../lib/color-project"],
  ["ColorSearch", "../../lib/color-search"],
  ["Palette", "../../lib/palette"],
];

function registerViewProvider() {
  const main = require("../../lib/main");

  for (const [name, modulePath] of DESERIALIZERS) {
    const Klass = require(modulePath);
    lumine.deserializers.add({ name, deserialize: (state) => Klass.deserialize(state) });
  }

  return lumine.views.addViewProvider((model) => main.colorInlineViewProvider(model));
}

module.exports = { registerViewProvider };
