const fields = [
  "sourceNames",
  "searchNames",
  "ignoredNames",
  "ignoredScopes",
  "supportedFiletypes",
  "ignoreGlobalSourceNames",
  "ignoreGlobalSearchNames",
  "ignoreGlobalIgnoredNames",
  "ignoreGlobalIgnoredScopes",
  "ignoreGlobalSupportedFiletypes",
  "sassShadeAndTintImplementation",
  "includeThemes",
];

const arrays = new Set(fields.slice(0, 5));

function settingsFrom(value) {
  return Object.fromEntries(
    fields.flatMap((name) => (value?.[name] == null ? [] : [[name, structuredClone(value[name])]])),
  );
}

module.exports = { fields, arrays, settingsFrom };
