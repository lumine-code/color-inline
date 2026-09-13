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

const { ColorInlineElement, defineElement } = require("./element");
const Color = require("./color");

let [Emitter, CompositeDisposable] = Array.from([]);

let nextHighlightId = 0;

// The computed value of a background color is the browser's own serialization,
// which is `rgb()` or `rgba()` for every color a theme can write today. Anything
// else — a wide-gamut `color()` for instance — is left unknown rather than
// guessed at, and the caller falls back to reading the color on its own.
const COMPUTED_RGB =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

function parseComputedColor(value) {
  const match = COMPUTED_RGB.exec(String(value).trim());
  if (match == null) {
    return null;
  }

  const [, red, green, blue, alpha] = match;

  return new Color(
    parseFloat(red),
    parseFloat(green),
    parseFloat(blue),
    alpha == null ? 1 : parseFloat(alpha) / (alpha.endsWith("%") ? 100 : 1),
  );
}

class ColorBufferElement extends ColorInlineElement {
  createdCallback() {
    if (Emitter == null) {
      ({ Emitter, CompositeDisposable } = require("lumine"));
    }

    [this.editorScrollLeft, this.editorScrollTop] = Array.from([0, 0]);
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.displayedMarkers = [];
    this.usedMarkers = [];
    this.unusedMarkers = [];
    return (this.viewsByMarkers = new WeakMap());
  }

  attachedCallback() {
    this.attached = true;
    return this.update();
  }

  detachedCallback() {
    return (this.attached = false);
  }

  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  getModel() {
    return this.colorBuffer;
  }

  setModel(colorBuffer) {
    this.colorBuffer = colorBuffer;
    ({ editor: this.editor } = this.colorBuffer);
    if (this.editor.isDestroyed()) {
      return;
    }
    this.editorElement = lumine.views.getView(this.editor);

    this.colorBuffer.initialize().then(() => this.update());

    this.subscriptions.add(this.colorBuffer.onDidUpdateColorMarkers(() => this.update()));
    this.subscriptions.add(this.colorBuffer.onDidDestroy(() => this.destroy()));

    this.subscriptions.add(
      this.editor.onDidChange(() => {
        return this.usedMarkers.forEach(function (marker) {
          if (marker.colorMarker != null) {
            marker.colorMarker.invalidateScreenRangeCache();
          }
          return marker.checkScreenRange();
        });
      }),
    );

    this.subscriptions.add(
      this.editor.onDidAddCursor(() => {
        return this.requestSelectionUpdate();
      }),
    );
    this.subscriptions.add(
      this.editor.onDidRemoveCursor(() => {
        return this.requestSelectionUpdate();
      }),
    );
    this.subscriptions.add(
      this.editor.onDidChangeCursorPosition(() => {
        return this.requestSelectionUpdate();
      }),
    );
    this.subscriptions.add(
      this.editor.onDidAddSelection(() => {
        return this.requestSelectionUpdate();
      }),
    );
    this.subscriptions.add(
      this.editor.onDidRemoveSelection(() => {
        return this.requestSelectionUpdate();
      }),
    );
    this.subscriptions.add(
      this.editor.onDidChangeSelectionRange(() => {
        return this.requestSelectionUpdate();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.maxDecorationsInGutter", () => {
        return this.update();
      }),
    );

    this.subscriptions.add(
      lumine.config.observe("color-inline.markerType", (type) => {
        this.initializeNativeDecorations(type);
        return (this.previousType = type);
      }),
    );

    // A background marker takes its text color from the editor background it is
    // composited against, so the markers already on screen are stale once that
    // background changes.
    this.subscriptions.add(
      lumine.themes.onDidChangeActiveThemes(() => {
        if (this.isGutterType()) {
          return;
        }

        this.destroyHighlightDecorations();
        this.updateHighlightDecorations(this.previousType);
      }),
    );

    this.subscriptions.add(this.editorElement.onDidAttach(() => this.attach()));
    return this.subscriptions.add(this.editorElement.onDidDetach(() => this.detach()));
  }

  attach() {
    if (this.parentNode != null) {
      return;
    }
    if (this.editorElement == null) {
      return;
    }
    return __guard__(this.getEditorRoot().querySelector(".lines"), (x) => x.appendChild(this));
  }

  detach() {
    if (this.parentNode == null) {
      return;
    }

    return this.parentNode.removeChild(this);
  }

  destroy() {
    this.detach();
    this.subscriptions.dispose();
    this.destroyNativeDecorations();

    return (this.colorBuffer = null);
  }

  update() {
    if (this.isGutterType()) {
      return this.updateGutterDecorations();
    } else {
      return this.updateHighlightDecorations(this.previousType);
    }
  }

  getEditorRoot() {
    return this.editorElement;
  }

  // Returns the opaque {Color} the editor paints behind its text, or `null`
  // when it cannot be read — a detached editor has no computed style, and a
  // theme may name its background in a notation this does not parse. Themes
  // leave the background on `lumine-text-editor` more often than not, but not
  // always, so an element painting nothing hands the question to its parent.
  getEditorBackgroundColor() {
    let backdrop = null;
    let element = this.editorElement;

    while (element != null) {
      const layer = parseComputedColor(getComputedStyle(element).backgroundColor);

      if (layer != null && layer.alpha > 0) {
        backdrop = backdrop != null ? backdrop.over(layer) : layer;

        if (backdrop.alpha >= 1) {
          return backdrop;
        }
      }

      element = element.parentElement;
    }

    return null;
  }

  isGutterType(type = this.previousType) {
    return ["gutter", "dot", "square-dot"].includes(type);
  }

  isDotType(type = this.previousType) {
    return ["dot", "square-dot"].includes(type);
  }

  initializeNativeDecorations(type) {
    this.destroyNativeDecorations();

    if (this.isGutterType(type)) {
      return this.initializeGutter(type);
    } else {
      return this.updateHighlightDecorations(type);
    }
  }

  destroyNativeDecorations() {
    if (this.isGutterType()) {
      return this.destroyGutter();
    } else {
      return this.destroyHighlightDecorations();
    }
  }

  //#   ##     ## ##  ######   ##     ## ##       ##  ######   ##     ## ########
  //#   ##     ## ## ##    ##  ##     ## ##       ## ##    ##  ##     ##    ##
  //#   ##     ## ## ##        ##     ## ##       ## ##        ##     ##    ##
  //#   ######### ## ##   #### ######### ##       ## ##   #### #########    ##
  //#   ##     ## ## ##    ##  ##     ## ##       ## ##    ##  ##     ##    ##
  //#   ##     ## ## ##    ##  ##     ## ##       ## ##    ##  ##     ##    ##
  //#   ##     ## ##  ######   ##     ## ######## ##  ######   ##     ##    ##

  updateHighlightDecorations(type) {
    let m;
    if (this.editor.isDestroyed()) {
      return;
    }

    if (this.styleByMarkerId == null) {
      this.styleByMarkerId = {};
    }
    if (this.decorationByMarkerId == null) {
      this.decorationByMarkerId = {};
    }

    if (this.colorBuffer == null) {
      return;
    }

    const markers = this.colorBuffer.getValidColorMarkers();

    for (m of this.displayedMarkers) {
      if (!markers.includes(m)) {
        if (this.decorationByMarkerId[m.id] != null) {
          this.decorationByMarkerId[m.id].destroy();
        }
        this.removeChild(this.styleByMarkerId[m.id]);
        delete this.styleByMarkerId[m.id];
        delete this.decorationByMarkerId[m.id];
      }
    }

    // Only the background type draws text on the color, so it is the only one
    // that needs to know what the color composites against — and reading it once
    // here keeps a style recalc off every marker in the pass.
    const backdrop = type === "background" ? this.getEditorBackgroundColor() : null;

    for (m of markers) {
      if ((m.color != null ? m.color.isValid() : undefined) && !this.displayedMarkers.includes(m)) {
        var { className, style } = this.getHighlighDecorationCSS(m, type, backdrop);
        this.appendChild(style);
        this.styleByMarkerId[m.id] = style;
        if (type === "background") {
          this.decorationByMarkerId[m.id] = this.editor.decorateMarker(m.marker, {
            type: "text",
            class: `color-inline-${type} ${className}`,
          });
        } else {
          this.decorationByMarkerId[m.id] = this.editor.decorateMarker(m.marker, {
            type: "highlight",
            class: `color-inline-${type} ${className}`,
          });
        }
      }
    }

    this.displayedMarkers = markers;
    this.updateSelections();
    return this.emitter.emit("did-update");
  }

  destroyHighlightDecorations() {
    for (var id in this.decorationByMarkerId) {
      var deco = this.decorationByMarkerId[id];
      if (this.styleByMarkerId[id] != null) {
        this.removeChild(this.styleByMarkerId[id]);
      }
      deco.destroy();
    }

    delete this.decorationByMarkerId;
    delete this.styleByMarkerId;
    return (this.displayedMarkers = []);
  }

  getHighlighDecorationCSS(marker, type, backdrop = this.getEditorBackgroundColor()) {
    const className = `color-inline-highlight-${nextHighlightId++}`;
    const style = document.createElement("style");
    const css = marker.color.toCSS();
    const opaque = marker.color.alpha === 1;

    // An opaque color has no transparency to reveal, so a solid background
    // avoids rasterizing a hidden checkerboard for every visible marker. A
    // translucent color is painted once over that checkerboard: painting it as
    // the background color as well would composite it twice, so a color at half
    // alpha would cover three quarters of whatever was behind it.
    if (type === "background") {
      // The text sits on top of the marker, so what decides its color is what
      // the marker composites to on this editor, not the color on its own: at a
      // low alpha the glyphs really sit on the editor's background. The
      // checkerboard in the translucent branch is faint for the same reason —
      // it has text over it.
      const l = marker.color.over(backdrop).luma;

      style.innerHTML = opaque
        ? `\
.${className} {
  background-color: ${css};
  color: ${l > 0.43 ? "black" : "white"};
}\
`
        : `\
.${className} {
  background-image:
    linear-gradient(to bottom, ${css} 0%, ${css} 100%),
    repeating-conic-gradient(rgba(128, 128, 128, 0.18) 0% 25%, transparent 0% 50%);
  background-size: auto, 6px 6px;
  color: ${l > 0.43 ? "black" : "white"};
}\
`;
    } else if (type === "underline") {
      style.innerHTML = opaque
        ? `\
.${className} .region {
  background-color: ${css};
}\
`
        : `\
.${className} .region {
  background-image:
    linear-gradient(to bottom, ${css} 0%, ${css} 100%),
    repeating-conic-gradient(rgba(128, 128, 128, 0.45) 0% 25%, transparent 0% 50%);
  background-size: auto, 10px 10px;
}\
`;
    } else if (type === "outline") {
      style.innerHTML = `\
.${className} .region {
  border-color: ${marker.color.toCSS()};
}\
`;
    }

    return { className, style };
  }

  //#     ######   ##     ## ######## ######## ######## ########
  //#    ##    ##  ##     ##    ##       ##    ##       ##     ##
  //#    ##        ##     ##    ##       ##    ##       ##     ##
  //#    ##   #### ##     ##    ##       ##    ######   ########
  //#    ##    ##  ##     ##    ##       ##    ##       ##   ##
  //#    ##    ##  ##     ##    ##       ##    ##       ##    ##
  //#     ######    #######     ##       ##    ######## ##     ##

  initializeGutter(type) {
    const options = { name: `color-inline-${type}` };
    if (type !== "gutter") {
      options.priority = 1000;
    }

    this.gutter = this.editor.addGutter(options);
    this.displayedMarkers = [];
    if (this.decorationByMarkerId == null) {
      this.decorationByMarkerId = {};
    }
    const gutterContainer = this.getEditorRoot().querySelector(".gutter-container");
    this.gutterSubscription = new CompositeDisposable();

    this.gutterSubscription.add(
      this.subscribeTo(gutterContainer, {
        mousedown: (e) => {
          let targetDecoration = e.target;

          if (!targetDecoration.matches("span")) {
            targetDecoration = targetDecoration.querySelector("span");
          }

          if (targetDecoration == null) {
            return;
          }

          const { markerId } = targetDecoration.dataset;
          const colorMarker = this.displayedMarkers.filter((m) => m.id === Number(markerId))[0];

          if (colorMarker == null || this.colorBuffer == null) {
            return;
          }

          return this.colorBuffer.selectColorMarker(colorMarker);
        },
      }),
    );

    if (this.isDotType(type)) {
      this.gutterSubscription.add(
        this.editorElement.onDidChangeScrollLeft(() => {
          return this.scheduleDotDecorationsOffsetsUpdate();
        }),
      );

      this.gutterSubscription.add(
        this.editor.onDidChange(() => {
          return this.scheduleDotDecorationsOffsetsUpdate();
        }),
      );
    }

    return this.updateGutterDecorations(type);
  }

  destroyGutter() {
    this.cancelDotDecorationsOffsetsUpdate();
    try {
      this.gutter.destroy();
    } catch {
      // Already destroyed with the editor.
    }
    this.gutterSubscription.dispose();
    this.displayedMarkers = [];
    for (var id in this.decorationByMarkerId) {
      var decoration = this.decorationByMarkerId[id];
      decoration.destroy();
    }
    delete this.decorationByMarkerId;
    return delete this.gutterSubscription;
  }

  updateGutterDecorations(type = this.previousType) {
    let decoWidth, m;
    if (this.editor.isDestroyed()) {
      return;
    }

    if (this.colorBuffer == null) {
      return;
    }

    const markers = this.colorBuffer.getValidColorMarkers();

    for (m of this.displayedMarkers) {
      if (!markers.includes(m)) {
        if (this.decorationByMarkerId[m.id] != null) {
          this.decorationByMarkerId[m.id].destroy();
        }
        delete this.decorationByMarkerId[m.id];
      }
    }

    const markersByRows = {};
    const rowLengths = new Map();
    let maxRowLength = 0;
    const scrollLeft = this.editorElement.getScrollLeft();
    const maxDecorationsInGutter = lumine.config.get("color-inline.maxDecorationsInGutter");

    for (m of markers) {
      if ((m.color != null ? m.color.isValid() : undefined) && !this.displayedMarkers.includes(m)) {
        this.decorationByMarkerId[m.id] = this.gutter.decorateMarker(m.marker, {
          type: "gutter",
          class: "color-inline-gutter-marker",
          item: this.getGutterDecorationItem(m),
        });
      }

      var deco = this.decorationByMarkerId[m.id];
      const item = deco?.getProperties?.().item;
      if (item == null) {
        continue;
      }
      var { row } = m.marker.getStartScreenPosition();
      if (markersByRows[row] == null) {
        markersByRows[row] = 0;
      }

      if (markersByRows[row] >= maxDecorationsInGutter) {
        continue;
      }

      var rowLength = 0;

      if (type !== "gutter") {
        if (rowLengths.has(row)) {
          rowLength = rowLengths.get(row);
        } else {
          try {
            rowLength = this.editorElement.pixelPositionForScreenPosition([row, Infinity]).left;
            rowLengths.set(row, rowLength);
          } catch {
            // Already destroyed with the editor.
          }
        }
      }

      decoWidth = 14;

      item.style.left = `${rowLength + markersByRows[row] * decoWidth - scrollLeft}px`;

      markersByRows[row]++;
      maxRowLength = Math.max(maxRowLength, markersByRows[row]);
    }

    if (type === "gutter") {
      lumine.views.getView(this.gutter).style.minWidth = `${maxRowLength * decoWidth}px`;
    } else {
      lumine.views.getView(this.gutter).style.width = "0px";
    }

    this.displayedMarkers = markers;
    this.updateSelections();
    return this.emitter.emit("did-update");
  }

  scheduleDotDecorationsOffsetsUpdate() {
    if (this.dotDecorationsOffsetsFrame != null || !this.isDotType()) {
      return;
    }

    this.dotDecorationsOffsetsFrame = requestAnimationFrame(() => {
      this.dotDecorationsOffsetsFrame = null;
      if (!this.isDotType() || this.editor.isDestroyed() || this.decorationByMarkerId == null) {
        return;
      }

      this.updateDotDecorationsOffsets(
        this.editorElement.getFirstVisibleScreenRow(),
        this.editorElement.getLastVisibleScreenRow(),
      );
    });
  }

  cancelDotDecorationsOffsetsUpdate() {
    if (this.dotDecorationsOffsetsFrame == null) {
      return;
    }
    cancelAnimationFrame(this.dotDecorationsOffsetsFrame);
    this.dotDecorationsOffsetsFrame = null;
  }

  updateDotDecorationsOffsets(rowStart, rowEnd) {
    if (
      !Number.isFinite(rowStart) ||
      !Number.isFinite(rowEnd) ||
      this.editor.isDestroyed() ||
      this.decorationByMarkerId == null
    ) {
      return;
    }

    const firstRow = Math.min(rowStart, rowEnd);
    const lastRow = Math.max(rowStart, rowEnd);
    const markersByRows = {};
    const rowLengths = new Map();
    const scrollLeft = this.editorElement.getScrollLeft();
    const maxDecorationsInGutter = lumine.config.get("color-inline.maxDecorationsInGutter");
    let updated = 0;

    for (const marker of this.displayedMarkers) {
      if (marker.marker == null) {
        continue;
      }
      const row = marker.marker.getStartScreenPosition().row;
      if (row < firstRow || row > lastRow) {
        continue;
      }

      if (markersByRows[row] == null) {
        markersByRows[row] = 0;
      }
      if (markersByRows[row] >= maxDecorationsInGutter) {
        continue;
      }

      const item = this.decorationByMarkerId[marker.id]?.getProperties?.().item;
      if (item == null) {
        continue;
      }

      let rowLength = rowLengths.get(row);
      if (rowLength == null) {
        try {
          rowLength = this.editorElement.pixelPositionForScreenPosition([row, Infinity]).left;
          rowLengths.set(row, rowLength);
        } catch {
          return updated;
        }
      }

      item.style.left = `${rowLength + markersByRows[row] * 14 - scrollLeft}px`;
      markersByRows[row]++;
      updated++;
    }

    return updated;
  }

  getGutterDecorationItem(marker) {
    const div = document.createElement("div");
    const span = document.createElement("span");
    const css = marker.color.toCSS();

    if (marker.color.alpha === 1) {
      span.style.backgroundColor = css;
    } else {
      span.style.backgroundImage = `linear-gradient(to bottom, ${css} 0%, ${css} 100%), repeating-conic-gradient(rgba(128, 128, 128, 0.45) 0% 25%, transparent 0% 50%)`;
      span.style.backgroundSize = "auto, 10px 10px";
    }

    span.dataset.markerId = marker.id;
    div.appendChild(span);
    return div;
  }

  //#     ######  ######## ##       ########  ######  ########
  //#    ##    ## ##       ##       ##       ##    ##    ##
  //#    ##       ##       ##       ##       ##          ##
  //#     ######  ######   ##       ######   ##          ##
  //#          ## ##       ##       ##       ##          ##
  //#    ##    ## ##       ##       ##       ##    ##    ##
  //#     ######  ######## ######## ########  ######     ##

  requestSelectionUpdate() {
    if (this.updateRequested) {
      return;
    }

    this.updateRequested = true;
    return requestAnimationFrame(() => {
      this.updateRequested = false;
      if (this.editor.getBuffer().isDestroyed()) {
        return;
      }
      return this.updateSelections();
    });
  }

  updateSelections() {
    if (this.editor.isDestroyed()) {
      return;
    }
    return (() => {
      const result = [];
      for (var marker of this.displayedMarkers) {
        var decoration = this.decorationByMarkerId[marker.id];

        if (decoration != null) {
          result.push(this.hideDecorationIfInSelection(marker, decoration));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }

  hideDecorationIfInSelection(marker, decoration) {
    const selections = this.editor.getSelections();

    const props = decoration.getProperties();
    let classes = props.class.split(/\s+/g);

    for (var selection of selections) {
      var range = selection.getScreenRange();
      var markerRange = marker.getScreenRange();

      if (markerRange == null || range == null) {
        continue;
      }
      if (markerRange.intersectsWith(range)) {
        if (classes[0].match(/-in-selection$/) == null) {
          classes[0] += "-in-selection";
        }
        props.class = classes.join(" ");
        decoration.setProperties(props);
        return;
      }
    }

    classes = classes.map((cls) => cls.replace("-in-selection", ""));
    props.class = classes.join(" ");
    return decoration.setProperties(props);
  }

  hideMarkerIfInSelectionOrFold(marker, view) {
    const selections = this.editor.getSelections();

    return (() => {
      const result = [];
      for (var selection of selections) {
        var range = selection.getScreenRange();
        var markerRange = marker.getScreenRange();

        if (markerRange == null || range == null) {
          continue;
        }

        if (markerRange.intersectsWith(range)) {
          view.classList.add("hidden");
        }
        if (this.editor.isFoldedAtBufferRow(marker.getBufferRange().start.row)) {
          result.push(view.classList.add("in-fold"));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }

  //#     ######   #######  ##    ## ######## ######## ##     ## ########
  //#    ##    ## ##     ## ###   ##    ##    ##        ##   ##     ##
  //#    ##       ##     ## ####  ##    ##    ##         ## ##      ##
  //#    ##       ##     ## ## ## ##    ##    ######      ###       ##
  //#    ##       ##     ## ##  ####    ##    ##         ## ##      ##
  //#    ##    ## ##     ## ##   ###    ##    ##        ##   ##     ##
  //#     ######   #######  ##    ##    ##    ######## ##     ##    ##
  //#
  //#    ##     ## ######## ##    ## ##     ##
  //#    ###   ### ##       ###   ## ##     ##
  //#    #### #### ##       ####  ## ##     ##
  //#    ## ### ## ######   ## ## ## ##     ##
  //#    ##     ## ##       ##  #### ##     ##
  //#    ##     ## ##       ##   ### ##     ##
  //#    ##     ## ######## ##    ##  #######

  colorMarkerForMouseEvent(event) {
    const position = this.screenPositionForMouseEvent(event);

    if (position == null) {
      return;
    }

    const bufferPosition = this.colorBuffer.editor.bufferPositionForScreenPosition(position);

    return this.colorBuffer.getColorMarkerAtBufferPosition(bufferPosition);
  }

  screenPositionForMouseEvent(event) {
    const pixelPosition = this.pixelPositionForMouseEvent(event);

    if (pixelPosition == null) {
      return;
    }

    if (this.editorElement.screenPositionForPixelPosition != null) {
      return this.editorElement.screenPositionForPixelPosition(pixelPosition);
    } else {
      return this.editor.screenPositionForPixelPosition(pixelPosition);
    }
  }

  pixelPositionForMouseEvent(event) {
    const { clientX, clientY } = event;

    const scrollTarget = this.editorElement.getScrollTop != null ? this.editorElement : this.editor;

    const rootElement = this.getEditorRoot();

    if (rootElement.querySelector(".lines") == null) {
      return;
    }

    let { top, left } = rootElement.querySelector(".lines").getBoundingClientRect();
    top = clientY - top + scrollTarget.getScrollTop();
    left = clientX - left + scrollTarget.getScrollLeft();
    return { top, left };
  }
}

module.exports = defineElement("color-inline-markers", ColorBufferElement);

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null ? transform(value) : undefined;
}
