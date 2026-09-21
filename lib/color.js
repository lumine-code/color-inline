/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS201: Simplify complex destructure assignments
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const rnd = Math.round;

let Color;
let [
  SVGColors,
  cmykToRGB,
  hexARGBToRGB,
  hexRGBAToRGB,
  hexToRGB,
  hslToRGB,
  hcgToRGB,
  hsvToRGB,
  hwbToRGB,
  rgbToCMYK,
  rgbToHex,
  rgbToHexARGB,
  rgbToHexRGBA,
  rgbToHSL,
  rgbToHSV,
  rgbToHWB,
  rgbToHCG,
] = Array.from([]);

const loadConverters = function () {
  if (cmykToRGB == null) {
    return ({
      cmykToRGB,
      hexARGBToRGB,
      hexRGBAToRGB,
      hexToRGB,
      hslToRGB,
      hcgToRGB,
      hsvToRGB,
      hwbToRGB,
      rgbToCMYK,
      rgbToHex,
      rgbToHexARGB,
      rgbToHexRGBA,
      rgbToHSL,
      rgbToHSV,
      rgbToHWB,
      rgbToHCG,
    } = require("./color-conversions"));
  }
};

module.exports = Color = (function () {
  Color = class Color {
    static initClass() {
      this.colorComponents = [
        ["red", 0],
        ["green", 1],
        ["blue", 2],
        ["alpha", 3],
      ];

      this.colorComponents.forEach(function (...args) {
        const [component, index] = Array.from(args[0]);
        return Object.defineProperty(Color.prototype, component, {
          enumerable: true,
          get() {
            return this[index];
          },
          set(component) {
            this[index] = component;
          },
        });
      });

      Object.defineProperty(Color.prototype, "rgb", {
        enumerable: true,
        get() {
          return [this.red, this.green, this.blue];
        },
        set(...args) {
          [this.red, this.green, this.blue] = Array.from(args[0]);
        },
      });

      Object.defineProperty(Color.prototype, "rgba", {
        enumerable: true,
        get() {
          return [this.red, this.green, this.blue, this.alpha];
        },
        set(...args) {
          [this.red, this.green, this.blue, this.alpha] = Array.from(args[0]);
        },
      });

      Object.defineProperty(Color.prototype, "argb", {
        enumerable: true,
        get() {
          return [this.alpha, this.red, this.green, this.blue];
        },
        set(...args) {
          [this.alpha, this.red, this.green, this.blue] = Array.from(args[0]);
        },
      });

      Object.defineProperty(Color.prototype, "hsv", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHSV(this.red, this.green, this.blue);
        },
        set(hsv) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hsvToRGB.apply(this.constructor, hsv)),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hsva", {
        enumerable: true,
        get() {
          return this.hsv.concat(this.alpha);
        },
        set(hsva) {
          let h, ref, s, v;
          loadConverters();
          [h, s, v, this.alpha] = Array.from(hsva);
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hsvToRGB.apply(this.constructor, [h, s, v])),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hcg", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHCG(this.red, this.green, this.blue);
        },
        set(hcg) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hcgToRGB.apply(this.constructor, hcg)),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hcga", {
        enumerable: true,
        get() {
          return this.hcg.concat(this.alpha);
        },
        set(hcga) {
          let c, gr, h, ref;
          loadConverters();
          [h, c, gr, this.alpha] = Array.from(hcga);
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hcgToRGB.apply(this.constructor, [h, c, gr])),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hsl", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHSL(this.red, this.green, this.blue);
        },
        set(hsl) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hslToRGB.apply(this.constructor, hsl)),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hsla", {
        enumerable: true,
        get() {
          return this.hsl.concat(this.alpha);
        },
        set(hsl) {
          let h, l, ref, s;
          loadConverters();
          [h, s, l, this.alpha] = Array.from(hsl);
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hslToRGB.apply(this.constructor, [h, s, l])),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hwb", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHWB(this.red, this.green, this.blue);
        },
        set(hwb) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hwbToRGB.apply(this.constructor, hwb)),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hwba", {
        enumerable: true,
        get() {
          return this.hwb.concat(this.alpha);
        },
        set(hwb) {
          let b, h, ref, w;
          loadConverters();
          [h, w, b, this.alpha] = Array.from(hwb);
          (([this.red, this.green, this.blue] = Array.from(
            (ref = hwbToRGB.apply(this.constructor, [h, w, b])),
          )),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hex", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHex(this.red, this.green, this.blue);
        },
        set(hex) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue] = Array.from((ref = hexToRGB(hex)))), ref);
        },
      });

      Object.defineProperty(Color.prototype, "hexARGB", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHexARGB(this.red, this.green, this.blue, this.alpha);
        },
        set(hex) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue, this.alpha] = Array.from((ref = hexARGBToRGB(hex)))),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "hexRGBA", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToHexRGBA(this.red, this.green, this.blue, this.alpha);
        },
        set(hex) {
          let ref;
          loadConverters();
          (([this.red, this.green, this.blue, this.alpha] = Array.from((ref = hexRGBAToRGB(hex)))),
            ref);
        },
      });

      Object.defineProperty(Color.prototype, "cmyk", {
        enumerable: true,
        get() {
          loadConverters();
          return rgbToCMYK(this.red, this.green, this.blue, this.alpha);
        },
        set(cmyk) {
          let ref;
          loadConverters();
          const [c, m, y, k] = Array.from(cmyk);
          (([this.red, this.green, this.blue] = Array.from((ref = cmykToRGB(c, m, y, k)))), ref);
        },
      });

      Object.defineProperty(Color.prototype, "length", {
        enumerable: true,
        get() {
          return 4;
        },
      });

      Object.defineProperty(Color.prototype, "hue", {
        enumerable: true,
        get() {
          return this.hsl[0];
        },
        set(hue) {
          const { hsl } = this;
          hsl[0] = hue;
          this.hsl = hsl;
        },
      });

      Object.defineProperty(Color.prototype, "saturation", {
        enumerable: true,
        get() {
          return this.hsl[1];
        },
        set(saturation) {
          const { hsl } = this;
          hsl[1] = saturation;
          this.hsl = hsl;
        },
      });

      Object.defineProperty(Color.prototype, "lightness", {
        enumerable: true,
        get() {
          return this.hsl[2];
        },
        set(lightness) {
          const { hsl } = this;
          hsl[2] = lightness;
          this.hsl = hsl;
        },
      });

      Object.defineProperty(Color.prototype, "luma", {
        enumerable: true,
        get() {
          let r = this[0] / 255;
          let g = this[1] / 255;
          let b = this[2] / 255;
          r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
          g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
          b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        },
      });

      Object.defineProperty(Color.prototype, "suggestionValues", {
        enumerable: true,
        get() {
          return [this.alpha === 1 ? `#${this.hex}` : `#${this.hexRGBA}`, this.toCSS()];
        },
      });
    }

    static isValid(color) {
      return (
        color != null &&
        !color.invalid &&
        color.red != null &&
        color.green != null &&
        color.blue != null &&
        color.alpha != null &&
        !isNaN(color.red) &&
        !isNaN(color.green) &&
        !isNaN(color.blue) &&
        !isNaN(color.alpha)
      );
    }

    constructor(r = 0, g = 0, b = 0, a = 1) {
      if (typeof r === "object") {
        let v;
        if (Array.isArray(r)) {
          for (let i = 0; i < r.length; i++) {
            v = r[i];
            this[i] = v;
          }
        } else {
          // A Color exposes many enumerable computed properties on its
          // prototype, including the getter-only `length`. `for…in` walks all
          // of them, so cloning a restored Color tries to assign those derived
          // values and fails (or repeatedly evaluates getters it never needed).
          // Serialized colors and Color instances keep their actual state in
          // own properties; copy only those and leave computed properties to
          // this instance's prototype.
          for (const k of Object.keys(r)) {
            if (k === "length") continue;
            v = r[k];
            this[k] = v;
          }
        }
      } else if (typeof r === "string") {
        if (SVGColors == null) {
          SVGColors = require("./svg-colors");
        }

        if (r in SVGColors.allCases) {
          this.name = r;
          r = SVGColors.allCases[r];
        }

        const expr = r.replace(/#|0x/, "");
        if (expr.length === 6) {
          this.hex = expr;
          this.alpha = 1;
        } else {
          this.hexARGB = expr;
        }
      } else {
        [this.red, this.green, this.blue, this.alpha] = Array.from([r, g, b, a]);
      }
    }

    isLiteral() {
      return this.variables == null || this.variables.length === 0;
    }

    isValid() {
      return this.constructor.isValid(this);
    }

    clone() {
      return new Color(this.red, this.green, this.blue, this.alpha);
    }

    isEqual(color) {
      return (
        color.red === this.red &&
        color.green === this.green &&
        color.blue === this.blue &&
        color.alpha === this.alpha
      );
    }

    interpolate(col, ratio, preserveAlpha = true) {
      const iratio = 1 - ratio;

      if (col == null) {
        return this.clone();
      }

      return new Color(
        Math.floor(this.red * iratio + col.red * ratio),
        Math.floor(this.green * iratio + col.green * ratio),
        Math.floor(this.blue * iratio + col.blue * ratio),
        Math.floor(preserveAlpha ? this.alpha : this.alpha * iratio + col.alpha * ratio),
      );
    }

    transparentize(alpha) {
      return new Color(this.red, this.green, this.blue, alpha);
    }

    blend(color, method, preserveAlpha = true) {
      const r = method(this.red, color.red);
      const g = method(this.green, color.green);
      const b = method(this.blue, color.blue);
      const a = preserveAlpha ? this.alpha : method(this.alpha, color.alpha);

      return new Color(r, g, b, a);
    }

    // Public: Composites this color over the passed-in one the way the browser
    // does, and returns the resulting {Color}.
    //
    // A semi-transparent color is only ever seen through whatever is drawn
    // behind it, so this is what says how it really reads on screen — its own
    // components answer for a color that, at that alpha, nobody can see.
    over(backdrop) {
      if (backdrop == null) {
        return this.clone();
      }

      const sourceAlpha = this.alpha;
      const backdropAlpha = backdrop.alpha != null ? backdrop.alpha : 1;
      const alpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);

      if (alpha === 0) {
        return new Color(0, 0, 0, 0);
      }

      const composite = (source, back) =>
        Math.round((source * sourceAlpha + back * backdropAlpha * (1 - sourceAlpha)) / alpha);

      return new Color(
        composite(this.red, backdrop.red),
        composite(this.green, backdrop.green),
        composite(this.blue, backdrop.blue),
        alpha,
      );
    }

    // Public: Returns a {String} reprensenting the color with the CSS `rgba`
    // notation.
    toCSS() {
      if (this.alpha === 1) {
        return `rgb(${rnd(this.red)},${rnd(this.green)},${rnd(this.blue)})`;
      } else {
        return `rgba(${rnd(this.red)},${rnd(this.green)},${rnd(this.blue)},${this.alpha})`;
      }
    }

    serialize() {
      return [this.red, this.green, this.blue, this.alpha];
    }
  };
  Color.initClass();
  return Color;
})();
