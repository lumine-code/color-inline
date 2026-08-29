require("../lib/color-buffer-element");
require("../lib/color-results-element");

describe("colors custom elements", () => {
  let frame, registration;

  beforeEach(() => {
    frame = document.createElement("iframe");
    document.body.appendChild(frame);
    registration = lumine.elements.addWindow(frame.contentWindow);
  });

  afterEach(() => {
    registration.dispose();
    frame.remove();
  });

  it("constructs views and declarative content in the target realm", () => {
    const markers = frame.contentDocument.createElement("colors-markers");
    const results = frame.contentDocument.createElement("colors-color-results");
    results.initializeContent();
    frame.contentDocument.body.appendChild(results);

    expect(markers instanceof frame.contentWindow.HTMLElement).toBe(true);
    expect(results instanceof frame.contentWindow.HTMLElement).toBe(true);
    expect(results.firstElementChild.ownerDocument).toBe(frame.contentDocument);
  });
});
