/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

const rnd = Math.round;
// Public: Converts a color defined with its red, green and blue
// components into an hexadecimal {String}.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
//
// Returns an hexadecimal {String} as `RRGGBB`
const rgbToHex = function (r, g, b) {
  let value = ((rnd(r) << 16) + (rnd(g) << 8) + rnd(b)).toString(16);

  // The value is filled with `0` to match a length of 6.
  while (value.length < 6) {
    value = `0${value}`;
  }

  return value;
};

// Public: Converts an hexadecimal {String} such as `RRGGBB` into an array
// with the red, green and blue components.
//
// hex - A {String} such as `RRGGBB`
//
// Returns an {Array} containing the red, green and blue components
// of the color
const hexToRGB = function (hex) {
  const color = parseInt(hex, 16);

  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  return [r, g, b];
};

// Public: Converts a color defined with its red, green,
// blue and alpha components into an hexadecimal {String}.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
// a - A float in the range [O-1] for the alpha component
//
// Returns an hexadecimal {String} as `AARRGGBB`
const rgbToHexARGB = function (r, g, b, a) {
  let value = (((rnd(a * 255) << 24) + (rnd(r) << 16) + (rnd(g) << 8) + rnd(b)) >>> 0).toString(16);

  // The value is filled with `0` to match a length of 8.
  while (value.length < 8) {
    value = `0${value}`;
  }

  return value;
};

// Public: Converts a color defined with its red, green,
// blue and alpha components into an hexadecimal {String}.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
// a - A float in the range [O-1] for the alpha component
//
// Returns an hexadecimal {String} as `RRGGBBAA`
const rgbToHexRGBA = function (r, g, b, a) {
  let value = (((rnd(r) << 24) + (rnd(g) << 16) + (rnd(b) << 8) + rnd(a * 255)) >>> 0).toString(16);

  // The value is filled with `0` to match a length of 8.
  while (value.length < 8) {
    value = `0${value}`;
  }

  return value;
};

// Public: Converts an hexadecimal {String} such as `aarrggbb` into an array
// with the red, green, blue and alpha components values.
//
// hex - A {String} such as `AARRGGBB`
//
// Returns an {Array} containing the red, green, blue and alpha components
// of the color
const hexARGBToRGB = function (hex) {
  const color = parseInt(hex, 16);

  const a = ((color >> 24) & 0xff) / 255;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  return [r, g, b, a];
};

// Public: Converts an hexadecimal {String} such as `rrggbbaa` into an array
// with the red, green, blue and alpha components values.
//
// hex - A {String} such as `RRGGBBAA`
//
// Returns an {Array} containing the red, green, blue and alpha components
// of the color
const hexRGBAToRGB = function (hex) {
  const color = parseInt(hex, 16);

  const r = (color >> 24) & 0xff;
  const g = (color >> 16) & 0xff;
  const b = (color >> 8) & 0xff;
  const a = (color & 0xff) / 255;

  return [r, g, b, a];
};

// Public: Converts a color in the `rgb` color space in an
// {Array} with the color in the `hsv` color space.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
//
// Returns an {Array} containing the hue, saturation and value of the color
const rgbToHSV = function (r, g, b) {
  let h, s;
  r = r / 255;
  g = g / 255;
  b = b / 255;

  const minVal = Math.min(r, g, b);
  const maxVal = Math.max(r, g, b);
  const delta = maxVal - minVal;

  // Value is always the maximal component's value.
  const v = maxVal;

  // The color is a gray, there's no need to proceed further.
  // Both saturation and hue equals to `0`.
  if (delta === 0) {
    h = 0;
    s = 0;
  } else {
    // The lower the delta is in comparison with the value
    // the higher the saturation will be.
    s = delta / v;
    const deltaR = ((v - r) / 6 + delta / 2) / delta;
    const deltaG = ((v - g) / 6 + delta / 2) / delta;
    const deltaB = ((v - b) / 6 + delta / 2) / delta;

    // In a range from `0` to `1`, full red is at `0` and `1`,
    // full green is at `1/3` and full blue at `2/3`.
    //
    // From the point in the range corresponding to the dominant
    // component, the delta of the other components are both added
    // in order to move the hue around this point.
    if (r === v) {
      h = deltaB - deltaG;
    } else if (g === v) {
      h = 1 / 3 + deltaR - deltaB;
    } else if (b === v) {
      h = 2 / 3 + deltaG - deltaR;
    }

    // Hue is then reduced to fit in the `0-1` range.
    if (h < 0) {
      h += 1;
    }
    if (h > 1) {
      h -= 1;
    }
  }

  // And, finally, hue, saturation and value are normalized
  // to their corresponding range.
  return [h * 360, s * 100, v * 100];
};

// Public: Converts a color defined in the `hsv` color space into
// an {Array} containing the color in the `rgb` color space.
//
// h - An integer in the range [O-360] for the hue component
// s - A float in the range [O-100] for the saturation component
// v - A float in the range [O-100] for the value component
//
// Returns an {Array} containing the red, green and blue components
// of the color
const hsvToRGB = function (h, s, v) {
  // Hue is reduced to the `0-6` range when both saturation
  // and value are reduced to the `0-1`
  h = h / 60;
  s = s / 100;
  v = v / 100;

  // Short circuit when saturation is `0`, all other components
  // will end up to `0` as well.
  if (s === 0) {
    return [rnd(v * 255), rnd(v * 255), rnd(v * 255)];
  } else {
    // By rounding the hue we obtain the dominant
    // color such as :
    //
    //  * 0 = Red
    //  * 1 = Yellow
    //  * 2 = Green
    //  * 3 = Cyan
    //  * 4 = Blue
    //  * 5 = Magenta
    let b, g, r;
    const dominant = Math.floor(h);

    const comp1 = v * (1 - s);
    const comp2 = v * (1 - s * (h - dominant));
    const comp3 = v * (1 - s * (1 - (h - dominant)));

    // According to the dominant color we affect
    // the values to each component.
    switch (dominant) {
      case 0:
        [r, g, b] = Array.from([v, comp3, comp1]);
        break;
      case 1:
        [r, g, b] = Array.from([comp2, v, comp1]);
        break;
      case 2:
        [r, g, b] = Array.from([comp1, v, comp3]);
        break;
      case 3:
        [r, g, b] = Array.from([comp1, comp2, v]);
        break;
      case 4:
        [r, g, b] = Array.from([comp3, comp1, v]);
        break;
      default:
        [r, g, b] = Array.from([v, comp1, comp2]);
    }

    // And each component is normalized to fit
    // in `0-255` range.
    return [r * 255, g * 255, b * 255];
  }
};

// Public: Converts a color in the `rgb` color space in an
// {Array} with the color in the `hsl` color space.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
//
// Returns an {Array} containing the hue, saturation and luminance of the color
const rgbToHSL = function (r, g, b) {
  [r, g, b] = Array.from([r / 255, g / 255, b / 255]);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  const d = max - min;
  if (max === min) {
    h = s = 0;
  } else {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
};

// Public: Converts a color defined in the `hsl` color space into
// an {Array} containing the color in the `rgb` color space.
//
// h - An integer in the range [O-360] for the hue component
// s - A float in the range [O-100] for the saturation component
// l - A float in the range [O-100] for the luminance component
//
// Returns an {Array} containing the red, green and blue components
// of the color
const hslToRGB = function (h, s, l) {
  const clamp = (val) => Math.min(1, Math.max(0, val));

  const hue = function (h) {
    h = h < 0 ? h + 1 : h > 1 ? h - 1 : h;
    if (h * 6 < 1) {
      return m1 + (m2 - m1) * h * 6;
    } else if (h * 2 < 1) {
      return m2;
    } else if (h * 3 < 2) {
      return m1 + (m2 - m1) * (2 / 3 - h) * 6;
    } else {
      return m1;
    }
  };

  h = (h % 360) / 360;
  s = clamp(s / 100);
  l = clamp(l / 100);
  var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
  var m1 = l * 2 - m2;

  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
};

// Public: Converts a color in the `rgb` color space in an
// {Array} with the color in the `hcg` color space.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
//
// Returns an {Array} containing the hue, chroma and grayness of the color
const rgbToHCG = function (r, g, b) {
  r = r / 255;
  g = g / 255;
  b = b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  let gr = 0;
  let h = 0;

  if (c < 1) {
    gr = min / (1 - c);
  }

  if (c > 0) {
    switch (max) {
      case r:
        // CoffeeScript's (if g < b then 6 else 0), which decaffeinate turned
        // into a null check on a boolean: it always took the boolean branch
        // and added 1 rather than 6, so the hue of any colour whose red is
        // greatest and whose green is below its blue came out wrong.
        h = (g - b) / c + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / c + 2;
        break;
      case b:
        h = (r - g) / c + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, c * 100, gr * 100];
};

// Public: Converts a color defined in the `hcg` color space into
// an {Array} containing the color in the `rgb` color space.
//
// h - An integer in the range [O-360] for the hue component
// c - A float in the range [O-100] for the chroma component
// gr - A float in the range [O-100] for the grayness component
//
// Returns an {Array} containing the red, green and blue components
// of the color
const hcgToRGB = function (h, c, gr) {
  h = (h / 360) * 6;
  c = c / 100;
  gr = gr / 100;

  if (c <= 0) {
    return [gr * 255, gr * 255, gr * 255];
  }

  const i = Math.floor(h);
  const f = h - i;
  const q = c * (1 - f);
  const t = c * f;
  const mod = i % 6;
  const r = [c, q, 0, 0, t, c][mod];
  const g = [t, c, c, q, 0, 0][mod];
  const b = [0, 0, t, c, c, q][mod];
  const m = (1 - c) * gr;

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

// Public: Converts a color from the `hsv` color space to the `hwb` one.
//
// h - The {Number} for the hue component.
// s - The {Number} for the saturation component.
// v - The {Number} for the value component.
//
// Returns an {Array} containing the hue, whiteness and blackness of the color.
const hsvToHWB = function (h, s, v) {
  [s, v] = Array.from([s / 100, v / 100]);

  const w = (1 - s) * v;
  const b = 1 - v;

  return [h, w * 100, b * 100];
};

// Public: Converts a color from the `hwb` color space to the `hsv` one.
//
// h - The {Number} for the hue component.
// w - The {Number} for the whiteness component.
// b - The {Number} for the blackness component.
//
// Returns an {Array} with the hue, saturation and value of the color.
const hwbToHSV = function (h, w, b) {
  [w, b] = Array.from([w / 100, b / 100]);

  const v = 1 - b;
  const s = v === 0 ? 0 : 1 - w / v;

  return [h, s * 100, v * 100];
};

// Public: Converts a color in the `rgb` color space in an
// {Array} with the color in the `hwb` color space.
//
// r - An integer in the range [O-255] for the red component
// g - An integer in the range [O-255] for the green component
// b - An integer in the range [O-255] for the blue component
//
// Returns an {Array} containing the hue, whiteness and blackness
// of the color.
const rgbToHWB = (r, g, b) => hsvToHWB(...Array.from(rgbToHSV(r, g, b) || []));

// Public: Converts a color defined in the `hwb` color space into
// an {Array} containing the color in the `rgb` color space.
//
// h - An integer {Number} in the range [O-360] for the hue component.
// w - A float {Number} in the range [O-100] for the whiteness component.
// b - A float {Number} in the range [O-100] for the blackness component.
//
// Returns an {Array} containing the red, green and blue components.
// of the color
const hwbToRGB = (h, w, b) => hsvToRGB(...Array.from(hwbToHSV(h, w, b) || []));

// Public: Converts a color from the CMYK color space to the RGB color space
const cmykToRGB = function (c, m, y, k) {
  let r = 1 - Math.min(1, c * (1 - k) + k);
  let g = 1 - Math.min(1, m * (1 - k) + k);
  let b = 1 - Math.min(1, y * (1 - k) + k);

  r = Math.floor(r * 255);
  g = Math.floor(g * 255);
  b = Math.floor(b * 255);

  return [r, g, b];
};

// Public: Converts a color from the RGB color space to the CMYK color space
const rgbToCMYK = function (r, g, b) {
  // BLACK
  if (r === 0 && g === 0 && b === 0) {
    return [0, 0, 0, 1];
  }

  let computedC = 1 - r / 255;
  let computedM = 1 - g / 255;
  let computedY = 1 - b / 255;

  const minCMY = Math.min(computedC, Math.min(computedM, computedY));

  computedC = (computedC - minCMY) / (1 - minCMY);
  computedM = (computedM - minCMY) / (1 - minCMY);
  computedY = (computedY - minCMY) / (1 - minCMY);
  const computedK = minCMY;

  return [computedC, computedM, computedY, computedK];
};

module.exports = {
  cmykToRGB,
  hexARGBToRGB,
  hexRGBAToRGB,
  hexToRGB,
  hslToRGB,
  hsvToHWB,
  hsvToRGB,
  hcgToRGB,
  hwbToHSV,
  hwbToRGB,
  rgbToCMYK,
  rgbToHex,
  rgbToHexARGB,
  rgbToHexRGBA,
  rgbToHSL,
  rgbToHSV,
  rgbToHWB,
  rgbToHCG,
};
