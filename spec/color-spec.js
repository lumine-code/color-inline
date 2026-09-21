/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
require("./helpers/matchers");

const Color = require("../lib/color");

describe("Color", function () {
  let [color] = Array.from([]);

  beforeEach(() => (color = new Color("#66ff6933")));

  describe("created with separated components", () =>
    it("creates the color with the provided components", () =>
      expect(new Color(255, 127, 64, 0.5)).toBeColor(255, 127, 64, 0.5)));

  it("copies another color without assigning its computed properties", function () {
    color.variables = ["accent"];

    const copy = new Color(color);

    expect(copy).toBeColor(color.red, color.green, color.blue, color.alpha);
    expect(copy.variables).toEqual(["accent"]);
  });

  describe("created with a hexa rgb string", () =>
    it("creates the color with the provided components", () =>
      expect(new Color("#ff6933")).toBeColor(255, 105, 51, 1)));

  describe("created with a hexa argb string", () =>
    it("creates the color with the provided components", () =>
      expect(new Color("#66ff6933")).toBeColor(255, 105, 51, 0.4)));

  describe("created with the name of a svg color", () =>
    it("creates the color using its name", () => expect(new Color("orange")).toBeColor("#ffa500")));

  describe("::isValid", function () {
    it("returns true when all the color components are valid", () =>
      expect(new Color()).toBeValid());

    it("returns false when one component is NaN", function () {
      expect(new Color(NaN, 0, 0, 1)).not.toBeValid();
      expect(new Color(0, NaN, 0, 1)).not.toBeValid();
      expect(new Color(0, 0, NaN, 1)).not.toBeValid();
      return expect(new Color(0, 0, 1, NaN)).not.toBeValid();
    });

    return it("returns false when the color has the invalid flag", function () {
      color = new Color();
      color.invalid = true;
      return expect(color).not.toBeValid();
    });
  });

  describe("::isLiteral", function () {
    it("returns true when the color does not rely on variables", () =>
      expect(new Color("orange").isLiteral()).toBeTruthy());

    return it("returns false when the color does rely on variables", function () {
      color = new Color(0, 0, 0, 1);
      color.variables = ["foo"];

      return expect(color.isLiteral()).toBeFalsy();
    });
  });

  describe("::rgb", function () {
    it("returns an array with the color components", () =>
      expect(color.rgb).toBeComponentArrayCloseTo([color.red, color.green, color.blue]));

    return it("sets the color components based on the passed-in values", function () {
      color.rgb = [1, 2, 3];

      return expect(color).toBeColor(1, 2, 3, 0.4);
    });
  });

  describe("::rgba", function () {
    it("returns an array with the color and alpha components", () =>
      expect(color.rgba).toBeComponentArrayCloseTo([
        color.red,
        color.green,
        color.blue,
        color.alpha,
      ]));

    return it("sets the color components based on the passed-in values", function () {
      color.rgba = [1, 2, 3, 0.7];

      return expect(color).toBeColor(1, 2, 3, 0.7);
    });
  });

  describe("::argb", function () {
    it("returns an array with the alpha and color components", () =>
      expect(color.argb).toBeComponentArrayCloseTo([
        color.alpha,
        color.red,
        color.green,
        color.blue,
      ]));

    return it("sets the color components based on the passed-in values", function () {
      color.argb = [0.7, 1, 2, 3];

      return expect(color).toBeColor(1, 2, 3, 0.7);
    });
  });

  describe("::hsv", function () {
    it("returns an array with the hue, saturation and value components", () =>
      expect(color.hsv).toBeComponentArrayCloseTo([16, 80, 100]));

    return it("sets the color components based on the passed-in values", function () {
      color.hsv = [200, 50, 50];

      return expect(color).toBeColor(64, 106, 128, 0.4);
    });
  });

  describe("::hsva", function () {
    it("returns an array with the hue, saturation, value and alpha components", () =>
      expect(color.hsva).toBeComponentArrayCloseTo([16, 80, 100, 0.4]));

    return it("sets the color components based on the passed-in values", function () {
      color.hsva = [200, 50, 50, 0.7];

      return expect(color).toBeColor(64, 106, 128, 0.7);
    });
  });

  describe("::hcg", function () {
    it("returns an array with the hue, chroma and gray components", () =>
      expect(color.hcg).toBeComponentArrayCloseTo([16, 80, 100]));

    return it("sets the color components based on the passed-in values", function () {
      color.hcg = [200, 50, 50];

      return expect(color).toBeColor(64, 149, 191, 0.4);
    });
  });

  describe("::hcga", function () {
    it("returns an array with the hue, chroma, gray and alpha components", () =>
      expect(color.hcga).toBeComponentArrayCloseTo([16, 80, 100, 0.4]));

    return it("sets the color components based on the passed-in values", function () {
      color.hcga = [200, 50, 50, 0.7];

      return expect(color).toBeColor(64, 149, 191, 0.7);
    });
  });

  describe("::hsl", function () {
    it("returns an array with the hue, saturation and luminosity components", () =>
      expect(color.hsl).toBeComponentArrayCloseTo([16, 100, 60]));

    return it("sets the color components based on the passed-in values", function () {
      color.hsl = [200, 50, 50];

      return expect(color).toBeColor(64, 149, 191, 0.4);
    });
  });

  describe("::hsla", function () {
    it("returns an array with the hue, saturation, luminosity and alpha components", () =>
      expect(color.hsla).toBeComponentArrayCloseTo([16, 100, 60, 0.4]));

    return it("sets the color components based on the passed-in values", function () {
      color.hsla = [200, 50, 50, 0.7];

      return expect(color).toBeColor(64, 149, 191, 0.7);
    });
  });

  describe("::hwb", function () {
    it("returns an array with the hue, whiteness and blackness components", () =>
      expect(color.hwb).toBeComponentArrayCloseTo([16, 20, 0]));

    return it("sets the color components based on the passed-in values", function () {
      color.hwb = [210, 40, 40];

      return expect(color).toBeColor(102, 128, 153, 0.4);
    });
  });

  describe("::hwba", function () {
    it("returns an array with the hue, whiteness, blackness and alpha components", () =>
      expect(color.hwba).toBeComponentArrayCloseTo([16, 20, 0, 0.4]));

    return it("sets the color components based on the passed-in values", function () {
      color.hwba = [210, 40, 40, 0.7];

      return expect(color).toBeColor(102, 128, 153, 0.7);
    });
  });

  describe("::hex", function () {
    it("returns the color as a hexadecimal string", () => expect(color.hex).toEqual("ff6933"));

    return it("parses the string and sets the color components accordingly", function () {
      color.hex = "00ff00";

      return expect(color).toBeColor(0, 255, 0, 0.4);
    });
  });

  describe("::hexARGB", function () {
    it("returns the color component as a hexadecimal string", () =>
      expect(color.hexARGB).toEqual("66ff6933"));

    return it("parses the string and sets the color components accordingly", function () {
      color.hexARGB = "ff00ff00";

      return expect(color).toBeColor(0, 255, 0, 1);
    });
  });

  describe("::hue", function () {
    it("returns the hue component", () => expect(color.hue).toEqual(color.hsl[0]));

    return it("sets the hue component", function () {
      color.hue = 20;

      return expect(color.hsl).toBeComponentArrayCloseTo([20, 100, 60]);
    });
  });

  describe("::saturation", function () {
    it("returns the saturation component", () => expect(color.saturation).toEqual(color.hsl[1]));

    return it("sets the saturation component", function () {
      color.saturation = 20;

      return expect(color.hsl).toBeComponentArrayCloseTo([16, 20, 60]);
    });
  });

  describe("::lightness", function () {
    it("returns the lightness component", () => expect(color.lightness).toEqual(color.hsl[2]));

    return it("sets the lightness component", function () {
      color.lightness = 20;

      return expect(color.hsl).toBeComponentArrayCloseTo([16, 100, 20]);
    });
  });

  describe("::cmyk", function () {
    it("returns an array with the color in CMYK color space", function () {
      color = new Color("#FF7F00");

      return expect(color.cmyk).toBeComponentArrayCloseTo([0, 0.5, 1, 0]);
    });

    return it("sets the color components using cmyk values", function () {
      color.alpha = 1;
      color.cmyk = [0, 0.5, 1, 0];

      return expect(color).toBeColor("#FF7F00");
    });
  });

  describe("::clone", () =>
    it("returns a copy of the current color", function () {
      expect(color.clone()).toBeColor(color);
      return expect(color.clone()).not.toBe(color);
    }));

  describe("::toCSS", function () {
    describe("when the color alpha channel is not 1", () =>
      it("returns the color as a rgba() color", () =>
        expect(color.toCSS()).toEqual("rgba(255,105,51,0.4)")));

    describe("when the color alpha channel is 1", () =>
      it("returns the color as a rgb() color", function () {
        color.alpha = 1;
        return expect(color.toCSS()).toEqual("rgb(255,105,51)");
      }));

    return describe("when the color have a CSS name", () =>
      it("only returns the color name", function () {
        color = new Color("orange");
        return expect(color.toCSS()).toEqual("rgb(255,165,0)");
      }));
  });

  describe("::interpolate", () =>
    it("blends the passed-in color linearly based on the passed-in ratio", function () {
      const colorA = new Color("#ff0000");
      const colorB = new Color("#0000ff");
      const colorC = colorA.interpolate(colorB, 0.5);

      return expect(colorC).toBeColor("#7f007f");
    }));

  describe("::blend", () =>
    it("blends the passed-in color based on the passed-in blend function", function () {
      const colorA = new Color("#ff0000");
      const colorB = new Color("#0000ff");
      const colorC = colorA.blend(colorB, (a, b) => a / 2 + b / 2);

      return expect(colorC).toBeColor("#800080");
    }));

  describe("::transparentize", () =>
    it("returns a new color whose alpha is the passed-in value", function () {
      expect(color.transparentize(1)).toBeColor(255, 105, 51, 1);
      expect(color.transparentize(0.7)).toBeColor(255, 105, 51, 0.7);
      return expect(color.transparentize(0.1)).toBeColor(255, 105, 51, 0.1);
    }));

  describe("::over", function () {
    it("returns the color itself when it is opaque", () =>
      expect(new Color(255, 105, 51).over(new Color("#000000"))).toBeColor(255, 105, 51, 1));

    it("composites the color over the passed-in one", function () {
      expect(new Color(0, 0, 0, 0.5).over(new Color("#ffffff"))).toBeColor(128, 128, 128, 1);
      return expect(new Color(255, 255, 255, 0.25).over(new Color("#000000"))).toBeColor(
        64,
        64,
        64,
        1,
      );
    });

    it("keeps the transparency the backdrop has of its own", () =>
      expect(new Color(0, 0, 0, 0.5).over(new Color(255, 255, 255, 0.5))).toBeColor(
        85,
        85,
        85,
        0.75,
      ));

    it("returns a copy of the color when there is no backdrop", () =>
      expect(new Color(255, 105, 51, 0.1).over(null)).toBeColor(255, 105, 51, 0.1));
  });

  return describe("::luma", () =>
    it("returns the luma value of the color", () => expect(color.luma).toBeCloseTo(0.31, 1)));
});
