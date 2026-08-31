const ColorContext = require("./color-context");
const ColorScanner = require("./color-scanner");
const VariableScanner = require("./variable-scanner");

// Scans an editor's text for variables and colors.
//
// Both of these used to be forked Tasks. Their entire payload was a string and
// a serialized-and-re-evaluated copy of the expression registry, and the work
// itself is a regular expression over a buffer that is already in memory --
// so the process hop cost more than it saved, and it was what forced the
// registry through `vm` in the first place. The callers already debounce
// through `color-inline.delayBeforeScan`, which is what actually keeps typing smooth.

function scanTextForVariables(text, { registry, scope }) {
  const scanner = new VariableScanner({ registry, scope });
  const results = [];
  let lastIndex = 0;
  let batch;

  while ((batch = scanner.search(text, lastIndex))) {
    results.push(...batch);
    ({ lastIndex } = batch);
  }

  return results;
}

function scanTextForColors(text, { registry, scope, variables, colorVariables, bufferPath }) {
  if (bufferPath == null) return [];

  const context = new ColorContext({
    variables,
    colorVariables,
    referencePath: bufferPath,
    registry,
  });
  const scanner = new ColorScanner({ context });
  const results = [];
  let lastIndex = 0;
  let result;

  while ((result = scanner.search(text, scope, lastIndex))) {
    results.push(result);
    ({ lastIndex } = result);
  }

  return results;
}

module.exports = { scanTextForColors, scanTextForVariables };
