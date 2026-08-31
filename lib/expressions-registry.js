const { Emitter } = require("lumine");

// Holds the color and variable expressions, keyed by name.
//
// There used to be a `serialize`/`deserialize` pair here whose only purpose was
// to carry the registry into a forked Task: every handler was turned into
// source with `toString()` and rebuilt with `vm.runInNewContext(source,
// {console, require})`. That could never have worked for a handler closing over
// anything at module scope -- which the built-in ones all do -- and it silently
// dropped every expression contributed by another package through the
// `color-inline.*-expressions` services, because a service handler lives in that
// package's module scope too. Scanning now happens in the renderer against this
// object, so there is nothing to serialize.
module.exports = class ExpressionsRegistry {
  constructor(expressionsType) {
    this.expressionsType = expressionsType;
    this.colorExpressions = {};
    this.emitter = new Emitter();
    this.regexpStrings = {};
  }

  dispose() {
    this.emitter.dispose();
  }

  onDidAddExpression(callback) {
    return this.emitter.on("did-add-expression", callback);
  }

  onDidRemoveExpression(callback) {
    return this.emitter.on("did-remove-expression", callback);
  }

  onDidUpdateExpressions(callback) {
    return this.emitter.on("did-update-expressions", callback);
  }

  getExpressions() {
    return Object.values(this.colorExpressions).sort((a, b) => b.priority - a.priority);
  }

  getExpressionsForScope(scope) {
    const expressions = this.getExpressions();
    if (scope === "*") return expressions;

    // A scope is `language` or `language:dialect`; a registered `language`
    // matches every dialect of it, and vice versa.
    const matchesScope = (candidate) => {
      const [candidateLanguage, candidateDialect] = candidate.split(":");
      const [language, dialect] = scope.split(":");
      return (
        candidateLanguage === language &&
        (candidateDialect == null || dialect == null || candidateDialect === dialect)
      );
    };

    return expressions.filter(
      (expression) => expression.scopes.includes("*") || expression.scopes.some(matchesScope),
    );
  }

  getExpression(name) {
    return this.colorExpressions[name];
  }

  getRegExp() {
    return this.getRegExpForScope("none");
  }

  getRegExpForScope(scope) {
    if (this.regexpStrings[scope] == null) {
      const expressions =
        scope === "none" ? this.getExpressions() : this.getExpressionsForScope(scope);
      this.regexpStrings[scope] = expressions
        .map((expression) => `(${expression.regexpString})`)
        .join("|");
    }
    return this.regexpStrings[scope];
  }

  createExpression(name, regexpString, priority = 0, scopes = ["*"], handle) {
    if (typeof priority === "function") {
      handle = priority;
      scopes = ["*"];
      priority = 0;
    } else if (typeof priority === "object") {
      if (typeof scopes === "function") handle = scopes;
      scopes = priority;
      priority = 0;
    }

    // A scoped expression stays reachable from this package's own scope, so the
    // palette and the search can ask for everything at once.
    if (scopes.length !== 1 || scopes[0] !== "*") scopes.push("color-inline");

    return this.addExpression(
      new this.expressionsType({ name, regexpString, scopes, priority, handle }),
    );
  }

  addExpression(expression, batch = false) {
    this.regexpStrings = {};
    this.colorExpressions[expression.name] = expression;

    if (!batch) {
      this.emitter.emit("did-add-expression", { name: expression.name, registry: this });
      this.emitter.emit("did-update-expressions", { name: expression.name, registry: this });
    }
    return expression;
  }

  createExpressions(expressions) {
    return this.addExpressions(
      // `scopes` defaults here exactly as it does in `createExpression`. It did
      // not, so an expression registered through the array form of the service
      // without one carried `undefined`, and the first scope lookup after it
      // threw on `scopes.includes`.
      expressions.map(({ name, regexpString, handle, priority = 0, scopes = ["*"] }) => {
        const expression = new this.expressionsType({ name, regexpString, scopes, handle });
        expression.priority = priority;
        return expression;
      }),
    );
  }

  addExpressions(expressions) {
    for (const expression of expressions) {
      this.addExpression(expression, true);
      this.emitter.emit("did-add-expression", { name: expression.name, registry: this });
    }
    return this.emitter.emit("did-update-expressions", { registry: this });
  }

  removeExpression(name) {
    delete this.colorExpressions[name];
    this.regexpStrings = {};
    this.emitter.emit("did-remove-expression", { name, registry: this });
    return this.emitter.emit("did-update-expressions", { name, registry: this });
  }
};
