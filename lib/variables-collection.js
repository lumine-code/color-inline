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

      this.reset();
      this.initialize(state != null ? state.content : undefined);
    }

    onDidChange(callback) {
      return this.emitter.on("did-change", callback);
    }

    onceInitialized(callback) {
      if (callback == null) {
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
        const start = Date.now();

        // Deserializing a large project runs in the renderer. Yield often
        // enough to let it paint and handle input instead of making package
        // reactivation look like a hung editor. The old loop captured its end
        // time before it started, so this condition was permanently true and
        // every saved variable was restored in one blocking pass.
        while (index < content.length && Date.now() - start < 16) {
          const variable = content[index++];
          // State may have been written on another platform. Normalize each
          // path inside the same time-bounded loop as the rest of restoration.
          if (typeof variable?.path === "string") variable.path = toNative(variable.path);
          this.restoreVariable(variable);
        }

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
      this.colorVariables = [];
      this.variablesByPath = {};
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
      return this.collectVariablesByName([name]).pop();
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
      let created, destroyed, path, updated, v;
      const pathsCollection = {};
      const remainingPaths = [];

      for (v of collection) {
        if (pathsCollection[v.path] == null) {
          pathsCollection[v.path] = [];
        }
        pathsCollection[v.path].push(v);
        if (!remainingPaths.includes(v.path)) {
          remainingPaths.push(v.path);
        }
      }

      let results = {
        created: [],
        destroyed: [],
        updated: [],
      };

      for (path in pathsCollection) {
        collection = pathsCollection[path];
        ({ created, updated, destroyed } = this.updatePathCollection(path, collection, true) || {});

        if (created != null) {
          results.created = results.created.concat(created);
        }
        if (updated != null) {
          results.updated = results.updated.concat(updated);
        }
        if (destroyed != null) {
          results.destroyed = results.destroyed.concat(destroyed);
        }
      }

      if (paths != null) {
        const pathsToDestroy =
          collection.length === 0 ? paths : paths.filter((p) => !remainingPaths.includes(p));

        for (path of pathsToDestroy) {
          ({ created, updated, destroyed } =
            this.updatePathCollection(path, collection, true) || {});

          if (created != null) {
            results.created = results.created.concat(created);
          }
          if (updated != null) {
            results.updated = results.updated.concat(updated);
          }
          if (destroyed != null) {
            results.destroyed = results.destroyed.concat(destroyed);
          }
        }
      }

      results = this.updateDependencies(results);

      if ((results.created != null ? results.created.length : undefined) === 0) {
        delete results.created;
      }
      if ((results.updated != null ? results.updated.length : undefined) === 0) {
        delete results.updated;
      }
      if ((results.destroyed != null ? results.destroyed.length : undefined) === 0) {
        delete results.destroyed;
      }

      if (results.destroyed != null) {
        for (v of results.destroyed) {
          this.deleteVariableReferences(v);
        }
      }

      return this.emitChangeEvent(results);
    }

    updatePathCollection(path, collection, batch = false) {
      let v;
      const pathCollection = this.variablesByPath[path] || [];

      let results = this.addMany(collection, true);

      const destroyed = [];
      for (v of pathCollection) {
        var [status] = Array.from(this.getVariableStatusInCollection(v, collection));
        if (status === "created") {
          destroyed.push(this.remove(v, true));
        }
      }

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

      if (!variable.default) {
        // Either separator, and an escaped dot: as written this matched no
        // Windows path at all, so a variable from the defaults file was never
        // flagged as a default.
        variable.default = variable.path.match(/[\\/]\.colors$/);
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
      variable = this.find(variable);

      if (variable == null) {
        return;
      }

      this.variables = this.variables.filter((v) => v !== variable);
      if (variable.isColor) {
        this.colorVariables = this.colorVariables.filter((v) => v !== variable);
      }

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
        destroyed.push(this.remove(variable, true));
      }

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
      a.splice(a.indexOf(variable), 1);

      a = this.variableNames;
      a.splice(a.indexOf(variable.name), 1);
      this.removeDependencies(variable.name, dependencies);

      return delete this.dependencyGraph[variable.name];
    }

    getContext() {
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
      });
    }

    evaluateVariables(variables, callback) {
      const updated = [];
      const remainingVariables = variables.slice();

      var iteration = (cb) => {
        const start = new Date();
        let end = new Date();

        while (remainingVariables.length > 0 && end - start < 100) {
          var v = remainingVariables.shift();
          var wasColor = v.isColor;
          this.evaluateVariableColor(v, wasColor);
          var { isColor } = v;

          if (isColor !== wasColor) {
            updated.push(v);
            if (isColor) {
              this.buildDependencyGraph(v);
            }

            end = new Date();
          }
        }

        if (remainingVariables.length > 0) {
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

    restoreVariable(variable) {
      if (Color == null) {
        Color = require("./color");
      }

      this.variableNames.push(variable.name);
      this.variables.push(variable);
      variable.id = nextId++;

      if (variable.isColor) {
        variable.color = new Color(variable.color);
        variable.color.variables = variable.variables;
        this.colorVariables.push(variable);
        delete variable.variables;
      }

      if (this.variablesByPath[variable.path] == null) {
        this.variablesByPath[variable.path] = [];
      }
      this.variablesByPath[variable.path].push(variable);

      return this.buildDependencyGraph(variable);
    }

    createVariable(variable, batch) {
      this.variableNames.push(variable.name);
      this.variables.push(variable);
      variable.id = nextId++;

      if (this.variablesByPath[variable.path] == null) {
        this.variablesByPath[variable.path] = [];
      }
      this.variablesByPath[variable.path].push(variable);

      this.evaluateVariableColor(variable);
      this.buildDependencyGraph(variable);

      if (batch) {
        return ["created", variable];
      } else {
        return this.emitChangeEvent(this.updateDependencies({ created: [variable] }));
      }
    }

    evaluateVariableColor(variable, wasColor = false) {
      const context = this.getContext();
      const color = context.readColor(variable.value, true);

      if (color != null) {
        if (wasColor && color.isEqual(variable.color)) {
          return false;
        }

        variable.color = color;
        variable.isColor = true;

        if (!this.colorVariables.includes(variable)) {
          this.colorVariables.push(variable);
        }
        return true;
      } else if (wasColor) {
        delete variable.color;
        variable.isColor = false;
        this.colorVariables = this.colorVariables.filter((v) => v !== variable);
        return true;
      }
    }

    getVariableStatus(variable) {
      if (this.variablesByPath[variable.path] == null) {
        return ["created", variable];
      }
      return this.getVariableStatusInCollection(variable, this.variablesByPath[variable.path]);
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

    getVariableDependencies(variable) {
      const dependencies = [];
      if (this.variableNames.includes(variable.value)) {
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
      for (var v of this.variables) {
        if (names.includes(v.name)) {
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
            dependencies.splice(dependencies.indexOf(from), 1);

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
          result.push(this.dependencyGraph[v].push(from));
        }
        return result;
      })();
    }

    updateDependencies({ created, updated, destroyed }) {
      let createdVariableNames, variable;
      this.updateColorVariablesExpression();

      let variables = [];
      const dirtyVariableNames = [];

      if (created != null) {
        variables = variables.concat(created);
        createdVariableNames = created.map((v) => v.name);
      } else {
        createdVariableNames = [];
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
            if (!dirtyVariableNames.includes(name) && !createdVariableNames.includes(name)) {
              dirtyVariableNames.push(name);
            }
          }
        }
      }

      const dirtyVariables = this.collectVariablesByName(dirtyVariableNames);

      for (variable of dirtyVariables) {
        if (this.evaluateVariableColor(variable, variable.isColor)) {
          if (updated == null) {
            updated = [];
          }
          updated.push(variable);
        }
      }

      return { created, destroyed, updated };
    }

    emitChangeEvent({ created, destroyed, updated }) {
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
        return registry.removeExpression("colors:variables");
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
