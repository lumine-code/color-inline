describe("Color Inline context availability cost", () => {
  let main, fragment;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("color-inline")).mainModule;
    fragment = lumine.workspace.buildTextEditor();
    lumine.workspace.getElement().appendChild(fragment.element);
  });
  afterEach(async () => {
    fragment.destroy();
    await lumine.packages.deactivatePackage("color-inline");
  });
  it("does not initialize a project to decide whether an unobserved editor has a color menu", () => {
    const ensure = spyOn(main, "getProject").and.callThrough();
    expect(
      main.shouldDisplayContextMenu({ target: fragment.element, clientX: 1, clientY: 1 }),
    ).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
  });
});
