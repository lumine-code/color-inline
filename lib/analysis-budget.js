const DEFAULT_LIMIT = 8 * 1024 * 1024;
const MAXIMUM_LIMIT = 32 * 1024 * 1024;
const RESULT_LIMIT = 100000;

function limit(value) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, MAXIMUM_LIMIT) : DEFAULT_LIMIT;
}

function configuredLimit() {
  return limit(lumine.config.get("color-inline.maximumAnalysisLength"));
}

function budgetError(message) {
  return Object.assign(new Error(message), { code: "ERR_COLOR_ANALYSIS_BUDGET" });
}

function assertLength(length, maximum = DEFAULT_LIMIT) {
  if (!Number.isSafeInteger(length) || length < 0 || length > limit(maximum))
    throw budgetError(`Color analysis exceeds its ${limit(maximum)} UTF-16 input budget.`);
}

function assertCount(count) {
  if (count > RESULT_LIMIT)
    throw budgetError(`Color analysis exceeds its ${RESULT_LIMIT} result budget.`);
}

// Project workers exchange plain data, not providers or executable callbacks.
// Account each occurrence (including aliases) before IPC and reject cycles.
function assertTransfer(value, maximum = DEFAULT_LIMIT) {
  createTransferBudget(maximum)(value);
}

function createTransferBudget(maximum = DEFAULT_LIMIT) {
  const ancestors = new Set();
  let units = 0,
    nodes = 0;
  const visit = (item, depth) => {
    if (++nodes > RESULT_LIMIT * 32 || depth > 64)
      throw budgetError("Color analysis exceeds its transfer structure budget.");
    if (typeof item === "string") units += item.length;
    else if (item && typeof item === "object") {
      if (ancestors.has(item)) throw budgetError("Color analysis cannot transfer cyclic data.");
      ancestors.add(item);
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        units += key.length;
        assertLength(units, maximum);
        visit(item[key], depth + 1);
      }
      ancestors.delete(item);
    }
    assertLength(units, maximum);
  };
  return (value) => visit(value, 0);
}

module.exports = {
  DEFAULT_LIMIT,
  MAXIMUM_LIMIT,
  RESULT_LIMIT,
  limit,
  configuredLimit,
  budgetError,
  assertLength,
  assertCount,
  assertTransfer,
  createTransferBudget,
};
