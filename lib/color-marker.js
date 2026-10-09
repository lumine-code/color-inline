/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let [CompositeDisposable, fill] = Array.from([]);

module.exports = class ColorMarker {
  constructor({ marker, color, text, invalid, colorBuffer }) {
    this.marker = marker;
    this.color = color;
    this.text = text;
    this.invalid = invalid;
    this.colorBuffer = colorBuffer;
    if (CompositeDisposable == null) {
      ({ CompositeDisposable } = require("lumine"));
    }

    this.id = this.marker.id;
    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(this.marker.onDidDestroy(() => this.markerWasDestroyed()));
    this.subscriptions.add(
      this.marker.onDidChange(() => {
        if (this.marker.isValid()) {
          this.invalidateScreenRangeCache();
          return this.checkMarkerScope();
        } else {
          return this.destroy();
        }
      }),
    );

    this.checkMarkerScope();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    return this.marker.destroy();
  }

  markerWasDestroyed() {
    if (this.destroyed) {
      return;
    }
    this.subscriptions.dispose();
    ({
      marker: this.marker,
      color: this.color,
      text: this.text,
      colorBuffer: this.colorBuffer,
    } = {});
    return (this.destroyed = true);
  }

  match(properties) {
    if (this.destroyed) {
      return false;
    }

    let bool = true;

    if (properties.bufferRange != null) {
      if (bool) {
        bool = this.marker.getBufferRange().isEqual(properties.bufferRange);
      }
    }
    if (properties.color != null) {
      if (bool) {
        bool = properties.color.isEqual(this.color);
      }
    }
    if (properties.match != null) {
      if (bool) {
        bool = properties.match === this.text;
      }
    }
    if (properties.text != null) {
      if (bool) {
        bool = properties.text === this.text;
      }
    }

    return bool;
  }

  serialize() {
    if (this.destroyed) {
      return;
    }
    const out = {
      markerId: String(this.marker.id),
      bufferRange: this.marker.getBufferRange().serialize(),
      color: this.color.serialize(),
      text: this.text,
      variables: this.color.variables,
    };
    if (!this.color.isValid()) {
      out.invalid = true;
    }
    return out;
  }

  checkMarkerScope(forceEvaluation = false) {
    if (this.destroyed || this.colorBuffer == null) {
      return;
    }
    const range = this.marker.getBufferRange();

    try {
      const scope =
        this.colorBuffer.editor.scopeDescriptorForBufferPosition != null
          ? this.colorBuffer.editor.scopeDescriptorForBufferPosition(range.start)
          : this.colorBuffer.editor.displayBuffer.scopeDescriptorForBufferPosition(range.start);
      const scopeChain = scope.getScopeChain();

      if (!scopeChain || (!forceEvaluation && scopeChain === this.lastScopeChain)) {
        return;
      }

      this.ignored = (
        this.colorBuffer.ignoredScopes != null ? this.colorBuffer.ignoredScopes : []
      ).some((scopeRegExp) => scopeChain.match(scopeRegExp));

      return (this.lastScopeChain = scopeChain);
    } catch (e) {
      return console.error(e);
    }
  }

  isIgnored() {
    return this.ignored;
  }

  getBufferRange() {
    return this.marker.getBufferRange();
  }

  getScreenRange() {
    return this.screenRangeCache != null
      ? this.screenRangeCache
      : (this.screenRangeCache = this.marker != null ? this.marker.getScreenRange() : undefined);
  }

  invalidateScreenRangeCache() {
    return (this.screenRangeCache = null);
  }

  convertContentToHex() {
    return this.convertContentInPlace("hex");
  }

  convertContentToRGB() {
    return this.convertContentInPlace("rgb");
  }

  convertContentToRGBA() {
    return this.convertContentInPlace("rgba");
  }

  convertContentToHSL() {
    return this.convertContentInPlace("hsl");
  }

  convertContentToHSLA() {
    return this.convertContentInPlace("hsla");
  }

  copyContentAsHex() {
    return lumine.clipboard.write(this.convertContent("hex"));
  }

  copyContentAsRGB() {
    return lumine.clipboard.write(this.convertContent("rgb"));
  }

  copyContentAsRGBA() {
    return lumine.clipboard.write(this.convertContent("rgba"));
  }

  copyContentAsHSL() {
    return lumine.clipboard.write(this.convertContent("hsl"));
  }

  copyContentAsHSLA() {
    return lumine.clipboard.write(this.convertContent("hsla"));
  }

  convertContentInPlace(mode) {
    const editor = this.colorBuffer.editor;
    if (editor.isReadOnly()) return;
    return editor
      .getBuffer()
      .setTextInRange(this.marker.getBufferRange(), this.convertContent(mode));
  }

  convertContent(mode) {
    if (fill == null) {
      ({ fill } = require("./utils"));
    }

    switch (mode) {
      case "hex":
        return "#" + fill(this.color.hex, 6);
      case "rgb":
        return `rgb(${Math.round(this.color.red)}, ${Math.round(this.color.green)}, ${Math.round(this.color.blue)})`;
      case "rgba":
        return `rgba(${Math.round(this.color.red)}, ${Math.round(this.color.green)}, ${Math.round(this.color.blue)}, ${this.color.alpha})`;
      case "hsl":
        return `hsl(${Math.round(this.color.hue)}, ${Math.round(this.color.saturation)}%, ${Math.round(this.color.lightness)}%)`;
      case "hsla":
        return `hsla(${Math.round(this.color.hue)}, ${Math.round(this.color.saturation)}%, ${Math.round(this.color.lightness)}%, ${this.color.alpha})`;
    }
  }
};
