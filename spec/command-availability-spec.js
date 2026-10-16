describe("Color Inline command availability", () => {
  let editor;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("color-inline");
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    editor.destroy();
    await lumine.packages.deactivatePackage("color-inline");
  });
  it("keeps copying available readonly while declining every conversion", () => {
    editor.setReadOnly(true);
    for (const format of ["hex", "rgb", "rgba", "hsl", "hsla"]) {
      expect(lumine.commands.canDispatch(editor.element, `color-inline:convert-to-${format}`)).toBe(
        false,
      );
      expect(lumine.commands.canDispatch(editor.element, `color-inline:copy-as-${format}`)).toBe(
        true,
      );
    }
  });
});
