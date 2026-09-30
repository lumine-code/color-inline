// All project file reads and regexp scans run in a Task. A live service's
// declaration handler receives only its matched excerpt over IPC, keeping its
// original renderer closure without bringing project scanning onto the UI.
class PathsScanner {
  constructor() {
    this.scans = new Set();
    this.queue = Promise.resolve();
    this.worker = null;
  }

  // The array interface remains useful to callers that only need definitions.
  async scan(entries, registry, options = {}) {
    const result = await this.scanProject(entries, registry, { ...options, evaluate: false });
    return result?.variables ?? [];
  }

  scanProject(entries, registry, options = {}) {
    const scan = { aborted: false };
    this.scans.add(scan);
    const pending = this.queue.then(async () => {
      if (scan.aborted) return null;
      const colorRegistry = options.colorRegistry ?? require("./color-expressions");
      const externalColors =
        colorRegistry.hasExternalExpressions?.({
          ignoredNames: ["color-inline:variables"],
          mutableScopeNames: ["color-inline:named_colors"],
        }) ?? true;
      return this.scanInWorker(entries, registry, scan, {
        ...options,
        evaluate: options.evaluate !== false && !externalColors,
      });
    });
    this.queue = pending.catch(() => {});
    return pending.finally(() => this.scans.delete(scan));
  }

  scanInWorker(entries, registry, scan, { state, config, onScanned, evaluate = true } = {}) {
    return new Promise((resolve, reject) => {
      const finish = (result, error) => {
        if (scan.finished) return;
        scan.finished = true;
        scan.finish = null;
        errorSubscription?.dispose();
        parseSubscription?.dispose();
        child?.removeListener("exit", exited);
        child?.removeListener("error", failed);
        if (error) {
          task?.terminate();
          if (this.worker === task) this.worker = null;
          reject(error);
        } else {
          resolve(result);
        }
      };
      const failed = (error) => finish(null, error);
      const exited = (code, signal) =>
        failed(new Error(`Color Inline project worker exited (${signal ?? code}).`));
      let task, child, errorSubscription, parseSubscription;
      scan.finish = () => finish(null);

      try {
        if (!this.worker) {
          const { Task } = require("lumine");
          this.worker = new Task(require.resolve("./project-worker"));
        }
        task = this.worker;
        errorSubscription = task.on("task:error", (message) => failed(new Error(message)));
        parseSubscription = task.on(
          "color-inline:parse-variable",
          ({ requestId, name, source }) => {
            if (scan.aborted || scan.finished) return;
            let parsed;
            try {
              const result = registry.getExpression(name)?.parse(source);
              parsed = result
                ? {
                    variables: [...result],
                    lastIndex: result.lastIndex,
                    range: result.range,
                    match: result.match,
                  }
                : null;
            } catch (error) {
              parsed = { error: error.message };
            }
            try {
              task.send({ event: "color-inline:parsed-variable", args: [{ requestId, parsed }] });
            } catch (error) {
              failed(error);
            }
          },
        );
        const expressions = registry.getExpressions().map((expression) => {
          const builtin = registry.builtinExpressions?.get(expression.name);
          return {
            name: expression.name,
            regexpString: expression.regexpString,
            priority: expression.priority,
            scopes: expression.scopes,
            builtin: expression === builtin?.expression && expression.handle === builtin?.handle,
          };
        });
        task.start({ entries, state, config, evaluate, expressions }, (result) => {
          if (scan.aborted) return finish(null);
          if (result?.error) return failed(new Error(result.error));
          if (!result || !Array.isArray(result.variables)) {
            return failed(new Error("Color Inline project worker returned invalid results."));
          }
          if (onScanned) {
            const byPath = new Map();
            for (const variable of result.variables) {
              if (!byPath.has(variable.path)) byPath.set(variable.path, []);
              byPath.get(variable.path).push(variable);
            }
            for (const variables of byPath.values()) onScanned(variables);
          }
          finish(result);
        });
        child = task.childProcess;
        child?.once("exit", exited);
        child?.once("error", failed);
      } catch (error) {
        failed(error);
      }
    });
  }

  terminateRunningTask() {
    for (const scan of this.scans) {
      scan.aborted = true;
      scan.finish?.();
    }
    this.worker?.terminate();
    this.worker = null;
  }
}

module.exports = new PathsScanner();
module.exports.PathsScanner = PathsScanner;
