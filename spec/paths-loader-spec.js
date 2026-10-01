const path = require("path");
const { EventEmitter } = require("events");

describe("PathsLoader", () => {
  let loader;
  const root = path.join(__dirname, "fixtures", "project");

  beforeEach(() => {
    jasmine.useRealClock();
    loader = require("../lib/paths-loader");
  });

  it("filters source paths in a separate process and excludes dependency directories", async () => {
    const { Task } = require("lumine");
    const start = Task.prototype.start;
    const workerPids = [];
    spyOn(Task.prototype, "start").and.callFake(function (...args) {
      workerPids.push(this.childProcess.pid);
      return start.apply(this, args);
    });
    spyOn(lumine.project, "crawl").and.throwError("renderer must not enumerate project files");

    const { dirtied } = await loader.loadPaths({
      paths: [root],
      sourceNames: ["*.styl", "*.less"],
      ignoredNames: ["vendor"],
      ignoreVcsIgnores: false,
    });

    expect(dirtied).toEqual([
      path.join(root, "styles", "buttons.styl"),
      path.join(root, "styles", "variables.styl"),
    ]);
    expect(workerPids.length).toBe(1);
    expect(workerPids[0]).not.toBe(process.pid);
    expect(lumine.project.crawl).not.toHaveBeenCalled();
  });

  it("preserves relative paths returned by listFiles", async () => {
    const files = await loader.listFiles(root, { ignoreVcsIgnores: false });
    expect(files).toContain(path.join("styles", "variables.styl"));
    expect(files).toContain(path.join("vendor", "css", "variables.less"));
    expect(files.every((filePath) => !path.isAbsolute(filePath))).toBe(true);
  });

  it("checks known timestamps and missing paths entirely inside the worker", async () => {
    const knownPaths = [
      path.join(root, "styles", "buttons.styl"),
      path.join(root, "styles", "variables.styl"),
      path.join(root, "styles", "missing.styl"),
    ];
    const result = await loader.loadPaths({
      paths: [root],
      sourceNames: ["*.styl"],
      knownPaths,
      timestamp: new Date(Date.now() + 60000),
    });

    expect(result.dirtied).toEqual([]);
    expect(result.removed).toEqual([knownPaths[2]]);
  });

  it("preserves a private extra ignore predicate for unchanged source candidates", async () => {
    const knownPaths = [
      path.join(root, "styles", "buttons.styl"),
      path.join(root, "styles", "variables.styl"),
    ];
    const result = await loader.loadPaths({
      paths: [root],
      sourceNames: ["*.styl"],
      knownPaths,
      timestamp: new Date(Date.now() + 60000),
      isIgnored: (relativePath) => relativePath.endsWith("variables.styl"),
    });

    expect(result.dirtied).toEqual([]);
    expect(result.removed).toEqual([knownPaths[1]]);
  });

  it("passes VCS and symlink options to the path worker", async () => {
    const task = {
      childProcess: new EventEmitter(),
      on: () => ({ dispose() {} }),
      start: jasmine
        .createSpy("start")
        .and.callFake((_options, complete) =>
          queueMicrotask(() => complete({ dirtied: [], removed: [] })),
        ),
      terminate() {},
    };
    spyOn(require("lumine"), "Task").and.returnValue(task);

    await loader.loadPaths({
      paths: [root],
      ignoreVcsIgnores: false,
      traverseIntoSymlinkDirectories: true,
    });

    const options = task.start.calls.first().args[0];
    expect(options.paths).toEqual([root]);
    expect(options.traverseIntoSymlinkDirectories).toBe(true);
    expect(options.ignoreVcsIgnores).toBe(false);
    expect(options.sourceNames).toBeUndefined();
  });

  it("cancels without reporting known paths as removed and lets the worker stop its crawl", async () => {
    let complete;
    const task = {
      childProcess: new EventEmitter(),
      on: () => ({ dispose() {} }),
      start: (_options, callback) => (complete = callback),
      send: jasmine.createSpy("send"),
      terminate: jasmine.createSpy("terminate"),
    };
    spyOn(require("lumine"), "Task").and.returnValue(task);
    const controller = new AbortController();

    const pending = loader.loadPaths({
      paths: [root],
      knownPaths: [path.join(root, "styles", "variables.styl")],
      signal: controller.signal,
    });
    controller.abort();

    expect(await pending).toEqual({ dirtied: [], removed: [] });
    expect(task.send.calls.first().args[0].event).toBe("color-inline:cancel-paths");
    expect(task.terminate).not.toHaveBeenCalled();
    complete({ dirtied: [], removed: [] });
    expect(task.terminate).toHaveBeenCalledTimes(1);
  });

  it("does not start a worker after cancellation", async () => {
    const Task = spyOn(require("lumine"), "Task");
    const controller = new AbortController();
    controller.abort();

    expect(await loader.loadPaths({ paths: [root], signal: controller.signal })).toEqual({
      dirtied: [],
      removed: [],
    });
    expect(Task).not.toHaveBeenCalled();
  });
});
