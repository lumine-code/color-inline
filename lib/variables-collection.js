/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const { toNative } = require("./globs");

let VariablesCollection;
let [Emitter, ColorExpression, ColorContext, Color, registry] = Array.from([]);

let nextId = 0;

module.exports = VariablesCollection = (function () {
  VariablesCollection = class VariablesCollection {
    static initClass() {
      Object.defineProperty(this.prototype, "length", {
        get() {
          return this.variables.length;
        },
        enumerable: true,
      });
    }
    static deserialize(state) {
      return new VariablesCollection(state);
    }

    constructor(state) {
      if (Emitter == null) {
        ({ Emitter } = require("lumine"));
      }

      this.emitter = new Emitter();
      this.disposed = false;

      this.reset();
      this.initialize(state != null ? state.content : undefined);
    }

    onDidChange(callback) {
      return this.emitter.on("did-change", callback);
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.emitter.dispose();
    }

    onceInitialized(callback) {
      if (callback == null || this.disposed) {
        return;
      }
      if (this.initialized) {
        return callback();
      } else {
        let disposable;
        return (disposable = this.emitter.on("did-initialize", function () {
          disposable.dispose();
          return callback();
        }));
      }
    }

    // Restored variables are bucketed by their `path`, and a rescan replaces a
    // bucket by looking it up under the path the scanner reports -- this
    // platform's spelling. State written elsewhere would leave its variables in
    // a bucket nothing ever replaces, so they survive alongside the rescanned
    // ones.
    initialize(content = []) {
      let index = 0;
      var iteration = (cb) => {
        if (this.disposed) return;
        const start = Date.now();

        // Deserializing a large project runs in the renderer. Yield often
        // enough to let it paint and handle input instead of making package
        // reactivation look like a hung editor. The old loop captured its end
        // time before it started, so this condition was permanently true and
        // every saved variable was restored in one blocking pass.
        while (!this.disposed && index < content.length && Date.now() - start < 16) {
          this.restoreVariable(content[index++]);
        }
        if (this.disposed) return;

        if (index < content.length) {
          return requestAnimationFrame(() => iteration(cb));
        } else {
          return typeof cb === "function" ? cb() : undefined;
        }
      };

      return iteration(() => {
        this.initialized = true;
        return this.emitter.emit("did-initialize");
      });
    }

    reset() {
      this.variables = [];
      this.variableNames = [];
      this.variableNameCounts = new Map();
      this.colorVariables = [];
      this.variablesByPath = {};
      this.variablesByName = new Map();
      this.variablesByPathAndName = new Map();
      this.colorVariablesByName = new Map();
      this.variableSet = new Set();
      this.colorVariableSet = new Set();
      this.contextVariables = {
        vars: Object.create(null),
        defaultVars: Object.create(null),
        colorVars: Object.create(null),
        defaultColorVars: Object.create(null),
      };
      return (this.dependencyGraph = {});
    }

    getVariables() {
      return this.variables.slice();
    }

    getNonColorVariables() {
      return this.getVariables().filter((v) => !v.isColor);
    }

    getVariablesForPath(path) {
      return this.variablesByPath[path] != null ? this.variablesByPath[path] : [];
    }

    getVariableByName(name) {
      return this.variablesByName.get(name)?.at(-1);
    }

    getVariableById(id) {
      for (var v of this.variables) {
        if (v.id === id) {
          return v;
        }
      }
    }

    getVariablesForPaths(paths) {
      let res = [];

      for (var p of paths) {
        if (p in this.variablesByPath) {
          res = res.concat(this.variablesByPath[p]);
        }
      }

      return res;
    }

    getColorVariables() {
      return this.colorVariables.slice();
    }

    find(properties) {
      return __guard__(this.findAll(properties), (x) => x[0]);
    }

    findAll(properties = {}) {
      const keys = Object.keys(properties);
      if (keys.length === 0) {
        return null;
      }

      return this.variables.filter((v) =>
        keys.every(function (k) {
          let b;
          if ((v[k] != null ? v[k].isEqual : undefined) != null) {
            return v[k].isEqual(properties[k]);
          } else if (Array.isArray((b = properties[k]))) {
            const a = v[k];
            return a.length === b.length && a.every((value) => b.includes(value));
          } else {
            return v[k] === properties[k];
          }
        }),
      );
    }

    updateCollection(collection, paths) {
      if (this.disposed) return null;
      const steps = this.updateCollectionSteps(collection, paths);
      let step;
      do {
        step = steps.next();
      } while (!step.done);
      return step.value;
    }

    async updateCollectionAsync(
      collection,
      paths,
      { shouldAbort = () => false, preEvaluated = false } = {},
    ) {
      const steps = this.updateCollectionSteps(collection, paths, preEvaluated);
      let start = Date.now();
      while (!this.disposed && !shouldAbort()) {
        const step = steps.next();
        if (step.done) return step.value;
        if (Date.now() - start >= 8) {
          // Timers keep progressing when the editor is hidden, unlike frames.
          await new Promise((resolve) => setTimeout(resolve, 0));
          start = Date.now();
        }
      }
      steps.return();
      return null;
    }

    *updateCollectionSteps(collection, paths, preEvaluated = false) {
      const pathsCollection = new Map();
      for (const state of collection) {
        const variable =
          preEvaluated && typeof state.path === "string"
            ? { ...state, path: toNative(state.path) }
            : state;
        let bucket = pathsCollection.get(variable.path);
        if (bucket == null) pathsCollection.set(variable.path, (bucket = []));
        bucket.push(variable);
        yield;
      }
      if (paths != null) {
        for (const path of paths) {
          if (!pathsCollection.has(path)) pathsCollection.set(path, []);
          yield;
        }
      }

      let results = { created: [], updated: [], destroyed: [] };
      for (const [path, variables] of pathsCollection) {
        const previous = this.getVariablesForPath(path).slice();
        const names = new Map();
        for (const variable of variables) {
          let bucket = names.get(variable.name);
          if (bucket == null) names.set(variable.name, (bucket = []));
          bucket.push(variable);
          const added = preEvaluated
            ? this.addEvaluatedVariable(variable)
            : this.add(variable, true);
          if (added != null) results[added[0]].push(added[1]);
          yield;
        }
        for (const variable of previous) {
          const [status] = this.getVariableStatusInCollection(
            variable,
            names.get(variable.name) || [],
          );
          if (status === "created") results.destroyed.push(variable);
          yield;
        }
      }
      const destroyed = results.destroyed;
      let completed = false;
      try {
        yield* this.removeVariablesSteps(destroyed);
        // A worker returns the complete evaluated collection, including aliases
        // affected by a changed declaration. Mirroring it must not parse every
        // expression again in the renderer.
        if (!preEvaluated) results = yield* this.updateDependenciesSteps(results);
        for (const variable of destroyed) {
          this.deleteVariableReferences(variable);
          yield;
        }
        for (const status of ["created", "updated", "destroyed"]) {
          if (results[status]?.length === 0) delete results[status];
        }
        completed = true;
        return this.emitChangeEvent(results);
      } finally {
        if (!completed) {
          // A project revision can change while removal yields. Finish its
          // reference cleanup before a retry reads this collection's state.
          this.removeVariables(destroyed);
          for (const variable of destroyed) this.deleteVariableReferences(variable);
        }
      }
    }

    updatePathCollection(path, collection, batch = false) {
      let v;
      const pathCollection = (this.variablesByPath[path] || []).slice();

      let results = this.addMany(collection, true);

      const destroyed = [];
      const names = new Map();
      for (v of collection) {
        let bucket = names.get(v.name);
        if (bucket == null) names.set(v.name, (bucket = []));
        bucket.push(v);
      }
      for (v of pathCollection) {
        var [status] = Array.from(this.getVariableStatusInCollection(v, names.get(v.name) || []));
        if (status === "created") {
          destroyed.push(v);
        }
      }
      this.removeVariables(destroyed);

      if (destroyed.length > 0) {
        results.destroyed = destroyed;
      }

      if (batch) {
        return results;
      } else {
        results = this.updateDependencies(results);
        for (v of destroyed) {
          this.deleteVariableReferences(v);
        }
        return this.emitChangeEvent(results);
      }
    }

    add(variable, batch = false) {
      const [status, previousVariable] = Array.from(this.getVariableStatus(variable));
      if (status !== "created" && variable.scope != null) previousVariable.scope = variable.scope;

      if (!variable.default) {
        // Either separator, and an escaped dot: as written this matched no
        // Windows path at all, so a variable from the defaults file was never
        // flagged as a default.
        variable.default = variable.path.match(/[\\/]\.color-inline$/);
      }

      switch (status) {
        case "moved":
          previousVariable.range = variable.range;
          previousVariable.bufferRange = variable.bufferRange;
          return undefined;
        case "updated":
          return this.updateVariable(previousVariable, variable, batch);
        case "created":
          return this.createVariable(variable, batch);
      }
    }

    addMany(variables, batch = false) {
      const results = {};

      for (var variable of variables) {
        var res = this.add(variable, true);
        if (res != null) {
          var [status, v] = Array.from(res);

          if (results[status] == null) {
            results[status] = [];
          }
          results[status].push(v);
        }
      }

      if (batch) {
        return results;
      } else {
        return this.emitChangeEvent(this.updateDependencies(results));
      }
    }

    remove(variable, batch = false) {
      if (!this.variableSet.has(variable)) variable = this.find(variable);

      if (variable == null) {
        return;
      }

      this.removeVariables([variable]);

      if (batch) {
        return variable;
      } else {
        const results = this.updateDependencies({ destroyed: [variable] });

        this.deleteVariableReferences(variable);
        return this.emitChangeEvent(results);
      }
    }

    removeMany(variables, batch = false) {
      const destroyed = [];
      for (var variable of variables) {
        if (!this.variableSet.has(variable)) variable = this.find(variable);
        if (variable != null && !destroyed.includes(variable)) destroyed.push(variable);
      }
      this.removeVariables(destroyed);

      let results = { destroyed };

      if (batch) {
        return results;
      } else {
        results = this.updateDependencies(results);
        for (var v of destroyed) {
          if (v != null) {
            this.deleteVariableReferences(v);
          }
        }
        return this.emitChangeEvent(results);
      }
    }

    deleteVariablesForPaths(paths) {
      return this.removeMany(this.getVariablesForPaths(paths));
    }

    deleteVariableReferences(variable) {
      const dependencies = this.getVariableDependencies(variable);

      let a = this.variablesByPath[variable.path];
      const pathIndex = a?.indexOf(variable) ?? -1;
      if (pathIndex < 0) return;
      a.splice(pathIndex, 1);

      a = this.variableNames;
      const nameIndex = a.indexOf(variable.name);
      if (nameIndex >= 0) a.splice(nameIndex, 1);
      const nameCount = this.variableNameCounts.get(variable.name);
      if (nameCount > 1) this.variableNameCounts.set(variable.name, nameCount - 1);
      else this.variableNameCounts.delete(variable.name);
      this.removeDependencies(variable.name, dependencies);

      if (!this.variableNameCounts.has(variable.name)) {
        return delete this.dependencyGraph[variable.name];
      }
    }

    getContext(indexed = false) {
      if (ColorContext == null) {
        ColorContext = require("./color-context");
      }
      if (registry == null) {
        registry = require("./color-expressions");
      }

      return new ColorContext({
        variables: this.variables,
        colorVariables: this.colorVariables,
        registry,
        sassScopeSuffix: this.sassScopeSuffix,
        ...(indexed ? { ...this.contextVariables, sorted: true } : {}),
      });
    }

    evaluateVariables(variables, callback) {
      if (this.disposed) return;
      const updated = [];
      const remainingVariables = variables.slice();
      let index = 0;

      var iteration = (cb) => {
        if (this.disposed) return;
        const start = Date.now();

        // Re-evaluating restored variables runs in the renderer too. Check the
        // budget on every variable, including those whose colour status stays
        // unchanged, and use an index so a large collection is not repeatedly
        // shifted.
        while (!this.disposed && index < remainingVariables.length && Date.now() - start < 16) {
          var v = remainingVariables[index++];
          var wasColor = v.isColor;
          this.evaluateVariableColor(v, wasColor);
          var { isColor } = v;

          if (isColor !== wasColor) {
            updated.push(v);
            if (isColor) {
              this.buildDependencyGraph(v);
            }
          }
        }
        if (this.disposed) return;

        if (index < remainingVariables.length) {
          return requestAnimationFrame(() => iteration(cb));
        } else {
          return typeof cb === "function" ? cb() : undefined;
        }
      };

      return iteration(() => {
        if (updated.length > 0) {
          this.emitChangeEvent(this.updateDependencies({ updated }));
        }
        return typeof callback === "function" ? callback(updated) : undefined;
      });
    }

    updateVariable(previousVariable, variable, batch) {
      const previousDependencies = this.getVariableDependencies(previousVariable);
      previousVariable.value = variable.value;
      previousVariable.range = variable.range;
      previousVariable.bufferRange = variable.bufferRange;

      this.evaluateVariableColor(previousVariable, previousVariable.isColor);
      const newDependencies = this.getVariableDependencies(previousVariable);

      const { removed, added } = this.diffArrays(previousDependencies, newDependencies);
      this.removeDependencies(variable.name, removed);
      this.addDependencies(variable.name, added);

      if (batch) {
        return ["updated", previousVariable];
      } else {
        return this.emitChangeEvent(this.updateDependencies({ updated: [previousVariable] }));
      }
    }

    addEvaluatedVariable(state) {
      if (Color == null) Color = require("./color");
      const variable = { ...state };
      if (typeof variable.path === "string") variable.path = toNative(variable.path);
      const [status, previous] = this.getVariableStatus(variable);
      const created = status === "created";
      const target = created ? variable : previous;
      const dependencies = created ? [] : this.getVariableDependencies(target);
      const wasColor = !created && Boolean(target.isColor);
      const previousColor = created ? undefined : target.color;

      if (created) {
        this.registerVariable(target);
        target.id = nextId++;
      } else {
        target.value = variable.value;
        target.range = variable.range;
        target.bufferRange = variable.bufferRange;
        target.line = variable.line;
      }

      const isColor = Boolean(state.isColor);
      let colorChanged = wasColor !== isColor;
      if (isColor) {
        const color = new Color(state.color);
        const references = state.variables ?? state.color?.variables ?? [];
        color.variables = Array.isArray(references) ? references.slice() : references;
        colorChanged ||= !previousColor?.isEqual(color);
        target.color = color;
        target.isColor = true;
        if (!this.colorVariableSet.has(target)) {
          this.colorVariables.push(target);
          this.registerColorVariable(target);
        }
      } else {
        delete target.color;
        target.isColor = false;
        if (this.colorVariableSet.has(target)) {
          this.colorVariables = this.colorVariables.filter((v) => v !== target);
          this.unregisterColorVariable(target);
        }
      }
      delete target.variables;

      const { removed, added } = this.diffArrays(
        dependencies,
        this.getVariableDependencies(target),
      );
      this.removeDependencies(target.name, removed);
      this.addDependencies(target.name, added);
      if (created) return ["created", target];
      if (status === "updated" || colorChanged || removed.length > 0 || added.length > 0) {
        return ["updated", target];
      }
    }

    restoreVariable(state) {
      if (Color == null) {
        Color = require("./color");
      }

      // Package state can be deserialized more than once in one renderer.
      // Keep the serialized object reusable instead of replacing its color
      // array with a live Color and deleting `variables`.
      const variable = { ...state };
      if (typeof variable.path === "string") variable.path = toNative(variable.path);

      this.registerVariable(variable);
      variable.id = nextId++;

      if (variable.isColor) {
        const references = variable.variables ?? variable.color?.variables;
        variable.color = new Color(variable.color);
        if (references != null) {
          variable.color.variables = Array.isArray(references) ? references.slice() : references;
        }
        this.colorVariables.push(variable);
        this.registerColorVariable(variable);
        delete variable.variables;
      }

      return this.buildDependencyGraph(variable);
    }

    createVariable(variable, batch) {
      this.registerVariable(variable);
      variable.id = nextId++;

      this.evaluateVariableColor(variable);
      this.buildDependencyGraph(variable);

      if (batch) {
        return ["created", variable];
      } else {
        return this.emitChangeEvent(this.updateDependencies({ created: [variable] }));
      }
    }

    evaluateVariableColor(variable, wasColor = false) {
      if (this.disposed) return false;
      // Evaluation is immediate and has no path preference. Rebuilding and
      // sorting the complete context for each declaration made project loading
      // quadratic. The indexes follow the same last-definition precedence.
      const context = this.getContext(true);
      const declaredScope = variable.scope ?? context.scopeFromFileName(variable.path);
      const scope = declaredScope === "color-inline" ? "*" : declaredScope;
      const color = context.readColor(variable.value, true, scope || "*");

      if (color != null) {
        if (wasColor && color.isEqual(variable.color)) {
          // Equal channels can still come from different declarations. Keep
          // the fresh references so changing an alias does not retain the old
          // dependency merely because both names currently have the same color.
          variable.color = color;
          return false;
        }

        variable.color = color;
        variable.isColor = true;

        if (!this.colorVariableSet.has(variable)) {
          this.colorVariables.push(variable);
          this.registerColorVariable(variable);
        }
        return true;
      } else if (wasColor) {
        delete variable.color;
        variable.isColor = false;
        this.colorVariables = this.colorVariables.filter((v) => v !== variable);
        this.unregisterColorVariable(variable);
        return true;
      }
    }

    getVariableStatus(variable) {
      const byName = this.variablesByPathAndName.get(variable.path);
      return this.getVariableStatusInCollection(variable, byName?.get(variable.name) || []);
    }

    getVariableStatusInCollection(variable, collection) {
      for (var v of collection) {
        var status = this.compareVariables(v, variable);

        switch (status) {
          case "identical":
            return ["unchanged", v];
          case "move":
            return ["moved", v];
          case "update":
            return ["updated", v];
        }
      }

      return ["created", variable];
    }

    compareVariables(v1, v2) {
      const sameName = v1.name === v2.name;
      const sameValue = v1.value === v2.value;
      const sameLine = v1.line === v2.line;
      let sameRange = v1.range[0] === v2.range[0] && v1.range[1] === v2.range[1];

      if (v1.bufferRange != null && v2.bufferRange != null) {
        if (sameRange) {
          sameRange = v1.bufferRange.isEqual(v2.bufferRange);
        }
      }

      if (sameName && sameValue) {
        if (sameRange) {
          return "identical";
        } else {
          return "move";
        }
      } else if (sameName) {
        if (sameRange || sameLine) {
          return "update";
        } else {
          return "different";
        }
      }
    }

    buildDependencyGraph(variable) {
      const dependencies = this.getVariableDependencies(variable);
      return (() => {
        const result = [];
        for (var dependency of dependencies) {
          var a =
            this.dependencyGraph[dependency] != null
              ? this.dependencyGraph[dependency]
              : (this.dependencyGraph[dependency] = []);
          if (!a.includes(variable.name)) {
            result.push(a.push(variable.name));
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    addVariableName(name) {
      this.variableNames.push(name);
      this.variableNameCounts.set(name, (this.variableNameCounts.get(name) || 0) + 1);
    }

    registerVariable(variable) {
      this.addVariableName(variable.name);
      this.variables.push(variable);
      this.variableSet.add(variable);
      if (this.variablesByPath[variable.path] == null) this.variablesByPath[variable.path] = [];
      this.variablesByPath[variable.path].push(variable);
      this.addToNameIndex(this.variablesByName, variable);
      let byName = this.variablesByPathAndName.get(variable.path);
      if (byName == null) this.variablesByPathAndName.set(variable.path, (byName = new Map()));
      this.addToNameIndex(byName, variable);
      const vars = variable.default
        ? this.contextVariables.defaultVars
        : this.contextVariables.vars;
      vars[variable.name] = variable;
    }

    registerColorVariable(variable) {
      this.colorVariableSet.add(variable);
      this.addToNameIndex(this.colorVariablesByName, variable);
      const vars = variable.default
        ? this.contextVariables.defaultColorVars
        : this.contextVariables.colorVars;
      vars[variable.name] = variable;
    }

    unregisterColorVariable(variable) {
      this.colorVariableSet.delete(variable);
      this.removeFromNameIndex(this.colorVariablesByName, variable);
      this.refreshContextVariable(variable, this.colorVariablesByName, true);
    }

    addToNameIndex(index, variable) {
      let variables = index.get(variable.name);
      if (variables == null) index.set(variable.name, (variables = []));
      variables.push(variable);
    }

    removeFromNameIndex(index, variable) {
      const variables = index?.get(variable.name);
      if (variables == null) return;
      const position = variables.indexOf(variable);
      if (position >= 0) variables.splice(position, 1);
      if (variables.length === 0) index.delete(variable.name);
    }

    refreshContextVariable(variable, index, color = false) {
      const key = color
        ? variable.default
          ? "defaultColorVars"
          : "colorVars"
        : variable.default
          ? "defaultVars"
          : "vars";
      const vars = this.contextVariables[key];
      if (vars[variable.name] !== variable) return;
      delete vars[variable.name];
      const variables = index.get(variable.name) || [];
      for (let position = variables.length - 1; position >= 0; position--) {
        const candidate = variables[position];
        if (Boolean(candidate.default) === Boolean(variable.default)) {
          vars[variable.name] = candidate;
          return;
        }
      }
    }

    removeVariables(variables) {
      for (const _step of this.removeVariablesSteps(variables)) {
        // The synchronous APIs retain their existing completion timing.
      }
    }

    *removeVariablesSteps(variables) {
      if (variables.length === 0) return;
      const removed = new Set(variables);
      this.variables = this.variables.filter((v) => !removed.has(v));
      this.colorVariables = this.colorVariables.filter((v) => !removed.has(v));
      for (const variable of removed) {
        this.variableSet.delete(variable);
        this.removeFromNameIndex(this.variablesByName, variable);
        this.removeFromNameIndex(this.variablesByPathAndName.get(variable.path), variable);
        this.refreshContextVariable(variable, this.variablesByName);
        if (this.colorVariableSet.has(variable)) this.unregisterColorVariable(variable);
        yield;
      }
    }

    getVariableDependencies(variable) {
      const dependencies = [];
      // Most values are literals, so a linear lookup for every restored
      // variable made a large saved index quadratic. Counts retain a name
      // until its last definition disappears from the collection.
      if (this.variableNameCounts.has(variable.value)) {
        dependencies.push(variable.value);
      }

      if (
        __guard__(variable.color != null ? variable.color.variables : undefined, (x) => x.length) >
        0
      ) {
        const { variables } = variable.color;

        for (var v of variables) {
          if (!dependencies.includes(v)) {
            dependencies.push(v);
          }
        }
      }

      return dependencies;
    }

    collectVariablesByName(names) {
      const variables = [];
      const wanted = new Set(names);
      for (var v of this.variables) {
        if (wanted.has(v.name)) {
          variables.push(v);
        }
      }
      return variables;
    }

    removeDependencies(from, to) {
      return (() => {
        const result = [];
        for (var v of to) {
          var dependencies;
          if ((dependencies = this.dependencyGraph[v])) {
            const stillReferenced = (this.variablesByName.get(from) || []).some((variable) =>
              this.getVariableDependencies(variable).includes(v),
            );
            if (stillReferenced) continue;
            const index = dependencies.indexOf(from);
            if (index >= 0) dependencies.splice(index, 1);

            if (dependencies.length === 0) {
              result.push(delete this.dependencyGraph[v]);
            } else {
              result.push(undefined);
            }
          } else {
            result.push(undefined);
          }
        }
        return result;
      })();
    }

    addDependencies(from, to) {
      return (() => {
        const result = [];
        for (var v of to) {
          if (this.dependencyGraph[v] == null) {
            this.dependencyGraph[v] = [];
          }
          if (!this.dependencyGraph[v].includes(from)) {
            result.push(this.dependencyGraph[v].push(from));
          }
        }
        return result;
      })();
    }

    updateDependencies(results) {
      const steps = this.updateDependenciesSteps(results);
      let step;
      do {
        step = steps.next();
      } while (!step.done);
      return step.value;
    }

    *updateDependenciesSteps({ created, updated, destroyed }) {
      let createdVariableNames, variable;
      this.updateColorVariablesExpression();

      let variables = [];
      const dirtyVariableNames = new Set();

      if (created != null) {
        variables = variables.concat(created);
        createdVariableNames = new Set(created.map((v) => v.name));
      } else {
        createdVariableNames = new Set();
      }

      if (updated != null) {
        variables = variables.concat(updated);
      }
      if (destroyed != null) {
        variables = variables.concat(destroyed);
      }
      variables = variables.filter((v) => v != null);

      for (variable of variables) {
        var dependencies;
        if ((dependencies = this.dependencyGraph[variable.name])) {
          for (var name of dependencies) {
            if (!createdVariableNames.has(name)) {
              dirtyVariableNames.add(name);
            }
          }
        }
        yield;
      }

      const dirtyVariables = this.collectVariablesByName(dirtyVariableNames);

      for (variable of dirtyVariables) {
        if (this.evaluateVariableColor(variable, variable.isColor)) {
          if (updated == null) {
            updated = [];
          }
          updated.push(variable);
        }
        yield;
      }

      return { created, destroyed, updated };
    }

    emitChangeEvent({ created, destroyed, updated }) {
      if (this.disposed) return;
      if (
        (created != null ? created.length : undefined) ||
        (destroyed != null ? destroyed.length : undefined) ||
        (updated != null ? updated.length : undefined)
      ) {
        this.updateColorVariablesExpression();
        return this.emitter.emit("did-change", { created, destroyed, updated });
      }
    }

    updateColorVariablesExpression() {
      if (this.disposed) return;
      if (registry == null) {
        registry = require("./color-expressions");
      }

      const colorVariables = this.getColorVariables();
      if (colorVariables.length > 0) {
        if (ColorExpression == null) {
          ColorExpression = require("./color-expression");
        }

        return registry.addExpression(
          ColorExpression.colorExpressionForColorVariables(colorVariables),
        );
      } else {
        return registry.removeExpression("color-inline:variables");
      }
    }

    diffArrays(a, b) {
      let v;
      const removed = [];
      const added = [];

      for (v of a) {
        if (!b.includes(v)) {
          removed.push(v);
        }
      }
      for (v of b) {
        if (!a.includes(v)) {
          added.push(v);
        }
      }

      return { removed, added };
    }

    serialize() {
      return {
        deserializer: "VariablesCollection",
        content: this.variables.map(function (v) {
          const res = {
            name: v.name,
            value: v.value,
            path: v.path,
            range: v.range,
            line: v.line,
          };

          if (v.isAlternate) {
            res.isAlternate = true;
          }
          if (v.noNamePrefix) {
            res.noNamePrefix = true;
          }
          if (v.default) {
            res.default = true;
          }

          if (v.isColor) {
            res.isColor = true;
            res.color = v.color.serialize();
            if (v.color.variables != null) {
              res.variables = v.color.variables;
            }
          }

          return res;
        }),
      };
    }
  };
  VariablesCollection.initClass();
  return VariablesCollection;
})();

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
