const path = require("node:path");
const fs = require("node:fs/promises");
const { setImmediate } = require("node:timers/promises");

describe("Color Inline search result publication ownership", () => {
  let main, Results, ColorSearch, project, file, views, models, reads;
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  beforeEach(async () => {
    lumine.project.setPaths([]);
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    project = main.getProject();
    await project.initialize();
    Results = require("../lib/color-results-element");
    ColorSearch = require("../lib/color-search");
    file = path.join(lumine.getConfigDirPath(), "owned-search.css");
    spyOn(require("../lib/paths-loader"), "loadPaths").and.resolveTo({ dirtied: [file] });
    views = [];
    models = [];
    reads = [];
    spyOn(fs, "readFile").and.callFake((target) => {
      if (target !== file) throw Error("Unexpected read outside the owned boundary");
      const read = deferred();
      reads.push(read);
      return read.promise;
    });
  });
  afterEach(async () => {
    for (const read of reads) read.resolve("");
    await Promise.allSettled(models.flatMap((model) => model.pendingAuditSearches ?? []));
    for (const view of views) {
      view.destroy();
      view.remove();
    }
    for (const model of models) model.destroy?.();
    await lumine.packages.deactivatePackage("color-inline");
  });
  function createModel() {
    const model = new ColorSearch({ project, sourceNames: ["*.css"] });
    const search = model.search.bind(model);
    model.pendingAuditSearches = [];
    spyOn(model, "search").and.callFake(() => {
      const promise = search();
      model.pendingAuditSearches.push(promise);
      return promise;
    });
    models.push(model);
    return model;
  }
  function createView() {
    const view = new Results();
    jasmine.attachToDOM(view);
    views.push(view);
    return view;
  }
  async function started(count) {
    for (let attempt = 0; reads.length < count && attempt < 30; attempt++) await setImmediate();
    if (reads.length !== count) throw Error("Controlled search did not reach readFile");
  }

  it("discards an older completion when the same model starts a newer search", async () => {
    const model = createModel();
    const view = createView();
    const first = view.setModel(model);
    await started(1);
    const second = model.search();
    await started(2);
    reads[1].resolve("#0000ff");
    await second;
    reads[0].resolve("#ff0000");
    await first;
    expect(Array.from(view.querySelectorAll(".match"), (item) => item.textContent)).toEqual([
      "#0000ff",
    ]);
    expect(model.results.map((match) => match.matchText)).toEqual(["#0000ff"]);
  });

  it("unsubscribes the old model when the actual Results view changes models", async () => {
    const view = createView();
    const first = view.setModel(createModel());
    await started(1);
    const second = view.setModel(createModel());
    await started(2);
    reads[1].resolve("#0000ff");
    await second;
    reads[0].resolve("#ff0000");
    await first;
    expect(Array.from(view.querySelectorAll(".match"), (item) => item.textContent)).toEqual([
      "#0000ff",
    ]);
    expect(view.files).toBe(1);
  });

  it("retires a read when Core actually closes its results pane item", async () => {
    const model = createModel();
    const publication = jasmine.createSpy("late search publication");
    model.onDidFindMatches(publication);
    await lumine.workspace.open(model);
    const view = lumine.views.getView(model);
    views.push(view);
    await started(1);
    const pending = model.pendingAuditSearches[0];
    const pane = lumine.workspace.paneForItem(model);
    await pane.destroyItem(model);
    expect(pane.getItems()).not.toContain(model);
    reads[0].resolve("#ff0000");
    await pending;
    expect(publication).not.toHaveBeenCalled();
    expect(view.files).toBe(0);
    expect(view.subscriptions.disposed).toBeTrue();
  });

  it("replaces the native empty overlay when a subsequent live search finds colors", async () => {
    const view = createView();
    const model = createModel();
    const first = view.setModel(model);
    await started(1);
    reads[0].resolve("");
    await first;
    expect(view.querySelectorAll(".no-results-overlay").length).toBe(1);
    const second = model.search();
    await started(2);
    reads[1].resolve("#0000ff");
    await second;
    expect(view.querySelector(".no-results-overlay")).toBeNull();
    expect(view.pane.classList.contains("no-results")).toBeFalse();
    expect(view.colors).toBe(1);
  });

  it("disposes an icon allocation returned after its actual Results owner is destroyed", () => {
    const view = createView();
    const dispose = jasmine.createSpy("late icon cleanup");
    spyOn(lumine.icons, "applyTo").and.callFake(() => {
      view.destroy();
      return new (require("lumine").Disposable)(dispose);
    });
    const Color = require("../lib/color");
    view.addFileResult({
      filePath: file,
      matches: [
        {
          color: new Color(255, 0, 0, 1),
          matchText: "#ff0000",
          lineText: "#ff0000",
          lineTextOffset: 0,
          range: [
            [0, 0],
            [0, 7],
          ],
        },
      ],
    });
    expect(view.subscriptions.disposed).toBeTrue();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("does not start an obsolete model when icon cleanup switches the Results model", async () => {
    const view = createView();
    const older = createModel();
    const newer = createModel();
    view.iconSubscriptions.add(new (require("lumine").Disposable)(() => view.setModel(newer)));
    view.setModel(older);
    await setImmediate();
    expect(view.colorSearch).toBe(newer);
    expect(older.search).not.toHaveBeenCalled();
  });
});
