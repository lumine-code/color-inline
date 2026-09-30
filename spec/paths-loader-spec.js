const path = require("path");

describe("PathsLoader", () => {
  let loader;
  const root = path.join(__dirname, "fixtures", "project");

  beforeEach(() => {
    loader = require("../lib/paths-loader");
  });

  it("excludes dependency directories before paths reach the renderer", async () => {
    const emitted = [];
    const crawl = lumine.project.crawl.bind(lumine.project);
    spyOn(lumine.project, "crawl").and.callFake((options) =>
      crawl({
        ...options,
        didFindPaths: (paths) => {
          emitted.push(...paths);
          options.didFindPaths(paths);
        },
      }),
    );

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
    expect(emitted).not.toContain(path.join(root, "vendor", "css", "variables.less"));
    const options = lumine.project.crawl.calls.first().args[0];
    expect(options.ignoredNames).toEqual(["vendor"]);
    expect(options.inclusion).toBeUndefined();
  });

  it("preserves relative paths returned by listFiles", async () => {
    const files = await loader.listFiles(root, { ignoreVcsIgnores: false });
    expect(files).toContain(path.join("styles", "variables.styl"));
    expect(files).toContain(path.join("vendor", "css", "variables.less"));
    expect(files.every((filePath) => !path.isAbsolute(filePath))).toBe(true);
  });

  it("passes the project's VCS and symlink settings to the crawler", async () => {
    spyOn(lumine.project, "crawl").and.returnValue(Promise.resolve());

    await loader.loadPaths({
      paths: [root],
      ignoreVcsIgnores: false,
      traverseIntoSymlinkDirectories: true,
    });

    const options = lumine.project.crawl.calls.first().args[0];
    expect(options.directoryPaths).toEqual([root]);
    expect(options.useCoreIgnoredNames).toBe(false);
    expect(options.followSymlinks).toBe(true);
    expect(options.excludeVcsIgnoredPaths).toBe(false);
  });

  it("cancels an active crawl without reporting known paths as removed", async () => {
    let finish;
    const crawl = new Promise((resolve) => (finish = resolve));
    crawl.cancel = jasmine.createSpy("cancel").and.callFake(() => finish());
    spyOn(lumine.project, "crawl").and.returnValue(crawl);
    const controller = new AbortController();

    const pending = loader.loadPaths({
      paths: [root],
      knownPaths: [path.join(root, "styles", "variables.styl")],
      signal: controller.signal,
    });
    controller.abort();

    expect(await pending).toEqual({ dirtied: [], removed: [] });
    expect(crawl.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not start a crawl after cancellation", async () => {
    spyOn(lumine.project, "crawl");
    const controller = new AbortController();
    controller.abort();

    expect(await loader.loadPaths({ paths: [root], signal: controller.signal })).toEqual({
      dirtied: [],
      removed: [],
    });
    expect(lumine.project.crawl).not.toHaveBeenCalled();
  });
});
