const ColorContext = require("./color-context");
const ColorScanner = require("./color-scanner");
const VariableScanner = require("./variable-scanner");
const timers = require("node:timers");

// Scans an editor's text for variables and colors.
//
// Keep the live expression handlers: contributed handlers can close over their
// provider's module. Renderer callers use the asynchronous variants so a long
// scan yields to input and can be cancelled when its text becomes obsolete.

const yieldToInput = () => new Promise((resolve) => timers.setTimeout(resolve, 0));

async function collectMatches(search, { shouldAbort = () => false, onBatch } = {}) {
  const results = [];
  let lastIndex = 0;
  await yieldToInput();
  let start = Date.now();

  while (!shouldAbort()) {
    const match = search(lastIndex);
    if (!match) return results;
    onBatch?.(match);
    if (Array.isArray(match)) results.push(...match);
    else results.push(match);
    // An extension's empty match must not keep a scan running forever.
    lastIndex = Math.max(match.lastIndex, lastIndex + 1);
    if (Date.now() - start >= 8) {
      await yieldToInput();
      start = Date.now();
    }
  }
  return null;
}

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
    scope,
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

function scanTextForVariablesAsync(text, options) {
  const scanner = new VariableScanner(options);
  return collectMatches((lastIndex) => scanner.search(text, lastIndex), options);
}

function scanTextForColorsAsync(text, options) {
  if (options.bufferPath == null) return Promise.resolve([]);
  const context = new ColorContext({
    ...options,
    referencePath: options.bufferPath,
  });
  const scanner = new ColorScanner({ context });
  return collectMatches((lastIndex) => scanner.search(text, options.scope, lastIndex), options);
}

async function scanBufferForColorsAsync(editor, options) {
  if (options.bufferPath == null) return [];
  const { Range } = require("lumine");
  const context = new ColorContext({ ...options, referencePath: options.bufferPath });
  const buffer = editor.getBuffer();
  const results = [];
  let large, fragments;
  const consume = ({ index, end, text }) => {
    const color = context.parser.parse(text, options.scope);
    if (!color) return end;
    const offset = text.indexOf(color.colorExpression);
    if (offset > 0) {
      index += offset;
      text = color.colorExpression;
      end = index + text.length;
    }
    const start = buffer.positionForCharacterIndex(index);
    results.push({
      color,
      match: text,
      lastIndex: end,
      range: [index, end],
      line: start.row,
      bufferRange: Range.fromObject([start, buffer.positionForCharacterIndex(end)]),
    });
    return end;
  };
  const completed = await editor.analyzeSyntax(
    require.resolve("./syntax-scan"),
    "candidates",
    {
      source: options.registry.getRegExpForScope(options.scope),
    },
    {
      signal: options.signal,
      onChunk(packet) {
        if (options.shouldAbort?.())
          throw Object.assign(new Error("Color scan superseded"), { name: "AbortError" });
        if (packet.kind === "begin") {
          large = packet;
          fragments = [];
        } else if (packet.kind === "text") fragments.push(packet.text);
        else if (packet.kind === "end") {
          const next = consume({ ...large, text: fragments.join("") });
          large = fragments = null;
          return next;
        } else {
          let next;
          for (const candidate of packet.values) {
            next = consume(candidate);
            // A handler can accept only a prefix of a regex match. Resume there
            // rather than skipping possible colors in the unconsumed suffix.
            if (next < candidate.end) break;
          }
          return next;
        }
      },
    },
  );
  return completed === null || options.shouldAbort?.() ? null : results;
}

module.exports = {
  scanTextForColors,
  scanTextForVariables,
  scanTextForColorsAsync,
  scanBufferForColorsAsync,
  scanTextForVariablesAsync,
};
