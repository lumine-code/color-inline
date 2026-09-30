const fs = require("fs/promises");
const variableRegistry = require("./variable-expressions");
const colorRegistry = require("./color-expressions");
const VariablesCollection = require("./variables-collection");
const ExpressionsRegistry = require("./expressions-registry");
const VariableExpression = require("./variable-expression");
const LineCounter = require("./line-counter");

// Task children have no renderer. Collection restoration can still cooperate
// with its own event loop without depending on a browser animation frame.
global.requestAnimationFrame = (callback) => setImmediate(callback);

let nextRequestId = 0;
const pendingParses = new Map();
process.on("message", ({ event, args } = {}) => {
  if (event !== "color-inline:parsed-variable") return;
  const { requestId, parsed } = args[0];
  const pending = pendingParses.get(requestId);
  if (!pending) return;
  pendingParses.delete(requestId);
  if (parsed?.error) pending.reject(new Error(parsed.error));
  else pending.resolve(parsed);
});

function parseContributedVariable(name, source) {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId++;
    pendingParses.set(requestId, { resolve, reject });
    global.emit("color-inline:parse-variable", { requestId, name, source });
  });
}

function registryForDescriptors(descriptors) {
  if (!descriptors) return variableRegistry;
  const registry = new ExpressionsRegistry(VariableExpression);
  for (const descriptor of descriptors) {
    const builtin = descriptor.builtin && variableRegistry.getExpression(descriptor.name);
    const expression = new VariableExpression({
      ...descriptor,
      handle: builtin ? builtin.handle : () => {},
    });
    expression.contributed = !builtin;
    registry.addExpression(expression, true);
  }
  return registry;
}

async function scanDefinitions(text, filePath, scope, registry) {
  const source = registry.getRegExpForScope(scope);
  if (!source) return [];
  const regexp = new RegExp(source, "gm");
  const expressions = registry.getExpressions();
  const lineCounter = new LineCounter();
  const variables = [];
  let match;
  while ((match = regexp.exec(text))) {
    if (match[0].length === 0) {
      regexp.lastIndex = match.index + 1;
      continue;
    }
    const expression = expressions.find((candidate) => candidate.match(match[0]));
    if (!expression) continue;
    const parsed = expression.contributed
      ? await parseContributedVariable(expression.name, match[0])
      : (() => {
          const result = expression.parse(match[0]);
          return result
            ? {
                variables: result,
                lastIndex: result.lastIndex,
                range: result.range,
                match: result.match,
              }
            : null;
        })();
    if (!parsed) continue;
    const end = match.index + (Number.isFinite(parsed.lastIndex) ? parsed.lastIndex : 0);
    if (parsed.variables.length === 0) {
      regexp.lastIndex = Math.max(regexp.lastIndex, end);
      continue;
    }
    const definitionRange = parsed.range.map((index) => index + match.index);
    for (const variable of parsed.variables) {
      variable.path = filePath;
      variable.scope = scope;
      variable.range = variable.range.map((index) => index + match.index);
      variable.definitionRange = definitionRange;
      variable.line = lineCounter.lineAt(text, variable.range[0]);
      variables.push(variable);
    }
    regexp.lastIndex = Math.max(end, match.index + 1);
  }
  return variables;
}

async function scanProject({ entries = [], state, config = {}, evaluate = true, expressions }) {
  // A Task serves several requests. Recreate its expression set from the
  // imported builtins so no earlier collection's generated variable expression
  // or Sass dialect can survive into the next project's snapshot.
  colorRegistry.colorExpressions = Object.fromEntries(
    [...colorRegistry.builtinExpressions].map(([name, builtin]) => [name, builtin.expression]),
  );
  const implementation = config.sassShadeAndTintImplementation ?? "compass";
  for (const expression of colorRegistry.getExpressions()) {
    if (
      expression.scopes.some(
        (scope) =>
          /^(sass|scss):(compass|bourbon)$/.test(scope) && !scope.endsWith(`:${implementation}`),
      )
    ) {
      delete colorRegistry.colorExpressions[expression.name];
    }
  }
  colorRegistry.regexpStrings = {};
  const namedColors = colorRegistry.getExpression("color-inline:named_colors");
  namedColors.scopes =
    config.filetypesForColorWords ??
    require("../package.json").configSchema.filetypesForColorWords.default;
  colorRegistry.regexpStrings = {};

  const registry = registryForDescriptors(expressions);
  const variables = [];
  for (const [filePath, scope] of entries) {
    let text;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    variables.push(...(await scanDefinitions(text, filePath, scope, registry)));
  }

  const paths = new Set(entries.map(([filePath]) => filePath));
  for (const variable of state?.content ?? []) paths.add(variable.path);
  if (!evaluate) {
    return { variables, paths: [...paths], preEvaluated: false, workerPid: process.pid };
  }

  // Import the real registry modules, including their original closures. No
  // function source crosses IPC, and parsing/evaluation never runs in the editor.
  const collection = new VariablesCollection(state);
  collection.sassScopeSuffix = config.sassShadeAndTintImplementation ?? "compass";
  await new Promise((resolve) => collection.onceInitialized(resolve));
  collection.updateCollection(
    variables,
    entries.map(([filePath]) => filePath),
  );
  return {
    variables: collection.serialize().content,
    paths: [...paths],
    preEvaluated: true,
    workerPid: process.pid,
  };
}

module.exports = function (options) {
  const complete = this.async();
  scanProject(options).then(complete, (error) => complete({ error: error.message }));
};
