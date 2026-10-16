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

function applySettingsChange(current, { key, value }) {
  if (!fields.includes(key)) throw new TypeError(`Unknown project setting: ${key}`);
  const settings = settingsFrom(current);
  if (value == null) delete settings[key];
  else settings[key] = structuredClone(value);
  return settings;
}

module.exports = { fields, arrays, settingsFrom, applySettingsChange };
