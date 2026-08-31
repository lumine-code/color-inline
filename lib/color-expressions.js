/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let registry;
let {
  int,
  float,
  percent,
  optionalPercent,
  intOrPercent,
  floatOrPercent,
  comma,
  notQuote,
  hexadecimal,
  ps,
  pe,
  variables,
  namePrefixes,
} = require("./regexes");

const { strip, insensitive, escapeRegExp } = require("./utils");

const ExpressionsRegistry = require("./expressions-registry");
const ColorExpression = require("./color-expression");
const SVGColors = require("./svg-colors");

module.exports = registry = new ExpressionsRegistry(ColorExpression);

//#    ##       #### ######## ######## ########     ###    ##
//#    ##        ##     ##    ##       ##     ##   ## ##   ##
//#    ##        ##     ##    ##       ##     ##  ##   ##  ##
//#    ##        ##     ##    ######   ########  ##     ## ##
//#    ##        ##     ##    ##       ##   ##   ######### ##
//#    ##        ##     ##    ##       ##    ##  ##     ## ##
//#    ######## ####    ##    ######## ##     ## ##     ## ########

// #6f3489ef
registry.createExpression(
  "color-inline:css_hexa_8",
  `#(${hexadecimal}{8})(?![\\d\\w-])`,
  1,
  ["css", "less", "styl", "stylus", "sass", "scss", "html", "json"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hexRGBA = hexa);
  },
);

// #6f3489ef
registry.createExpression(
  "color-inline:argb_hexa_8",
  `#(${hexadecimal}{8})(?![\\d\\w-])`,
  ["*"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hexARGB = hexa);
  },
);

// #3489ef
registry.createExpression(
  "color-inline:css_hexa_6",
  `#(${hexadecimal}{6})(?![\\d\\w-])`,
  ["*"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hex = hexa);
  },
);

// #6f34
registry.createExpression(
  "color-inline:css_hexa_4",
  `(?:${namePrefixes})#(${hexadecimal}{4})(?![\\d\\w-])`,
  ["*"],
  function (match, expression, context) {
    const [_, hexa] = Array.from(match);
    const colorAsInt = context.readInt(hexa, 16);

    this.colorExpression = `#${hexa}`;
    this.red = ((colorAsInt >> 12) & 0xf) * 17;
    this.green = ((colorAsInt >> 8) & 0xf) * 17;
    this.blue = ((colorAsInt >> 4) & 0xf) * 17;
    return (this.alpha = ((colorAsInt & 0xf) * 17) / 255);
  },
);

// #38e
registry.createExpression(
  "color-inline:css_hexa_3",
  `(?:${namePrefixes})#(${hexadecimal}{3})(?![\\d\\w-])`,
  ["*"],
  function (match, expression, context) {
    const [_, hexa] = Array.from(match);
    const colorAsInt = context.readInt(hexa, 16);

    this.colorExpression = `#${hexa}`;
    this.red = ((colorAsInt >> 8) & 0xf) * 17;
    this.green = ((colorAsInt >> 4) & 0xf) * 17;
    return (this.blue = (colorAsInt & 0xf) * 17);
  },
);

// 0xab3489ef
registry.createExpression(
  "color-inline:int_hexa_8",
  `0x(${hexadecimal}{8})(?!${hexadecimal})`,
  ["*"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hexARGB = hexa);
  },
);

// 0x3489ef
registry.createExpression(
  "color-inline:int_hexa_6",
  `0x(${hexadecimal}{6})(?!${hexadecimal})`,
  ["*"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hex = hexa);
  },
);

// rgb(50,120,200)
registry.createExpression(
  "color-inline:css_rgb",
  strip(`\
${insensitive("rgb")}${ps}\\s* \
(${intOrPercent}|${variables}) \
${comma} \
(${intOrPercent}|${variables}) \
${comma} \
(${intOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, r, g, b] = Array.from(match);

    this.red = context.readIntOrPercent(r);
    this.green = context.readIntOrPercent(g);
    this.blue = context.readIntOrPercent(b);
    return (this.alpha = 1);
  },
);

// rgba(50,120,200,0.7)
registry.createExpression(
  "color-inline:css_rgba",
  strip(`\
${insensitive("rgba")}${ps}\\s* \
(${intOrPercent}|${variables}) \
${comma} \
(${intOrPercent}|${variables}) \
${comma} \
(${intOrPercent}|${variables}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, r, g, b, a] = Array.from(match);

    this.red = context.readIntOrPercent(r);
    this.green = context.readIntOrPercent(g);
    this.blue = context.readIntOrPercent(b);
    return (this.alpha = context.readFloat(a));
  },
);

// rgba(green,0.7)
registry.createExpression(
  "color-inline:stylus_rgba",
  strip(`\
rgba${ps}\\s* \
(${notQuote}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, subexpr, a] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    this.rgb = baseColor.rgb;
    return (this.alpha = context.readFloat(a));
  },
);

// hsl(210,50%,50%)
registry.createExpression(
  "color-inline:less_hsl",
  strip(`\
hsl${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${floatOrPercent}|${variables}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["less"],
  function (match, expression, context) {
    const [_, h, s, l] = Array.from(match);

    const hsl = [
      context.readInt(h),
      context.readFloatOrPercent(s) * 100,
      context.readFloatOrPercent(l) * 100,
    ];

    if (hsl.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsl = hsl;
    return (this.alpha = 1);
  },
);

// hsl(210,50%,50%)
registry.createExpression(
  "color-inline:css_hsl",
  strip(`\
${insensitive("hsl")}${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, s, l] = Array.from(match);

    const hsl = [context.readInt(h), context.readFloat(s), context.readFloat(l)];

    if (hsl.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsl = hsl;
    return (this.alpha = 1);
  },
);

// hsla(210,50%,50%,0.7)
registry.createExpression(
  "color-inline:css_hsla",
  strip(`\
${insensitive("hsla")}${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, s, l, a] = Array.from(match);

    const hsl = [context.readInt(h), context.readFloat(s), context.readFloat(l)];

    if (hsl.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsl = hsl;
    return (this.alpha = context.readFloat(a));
  },
);

// hsv(210,70%,90%)
registry.createExpression(
  "color-inline:hsv",
  strip(`\
(?:${insensitive("hsv")}|${insensitive("hsb")})${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, s, v] = Array.from(match);

    const hsv = [context.readInt(h), context.readFloat(s), context.readFloat(v)];

    if (hsv.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsv = hsv;
    return (this.alpha = 1);
  },
);

// hsva(210,70%,90%,0.7)
registry.createExpression(
  "color-inline:hsva",
  strip(`\
(?:${insensitive("hsva")}|${insensitive("hsba")})${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, s, v, a] = Array.from(match);

    const hsv = [context.readInt(h), context.readFloat(s), context.readFloat(v)];

    if (hsv.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsv = hsv;
    return (this.alpha = context.readFloat(a));
  },
);

// hcg(210,60%,50%)
registry.createExpression(
  "color-inline:hcg",
  strip(`\
(?:${insensitive("hcg")})${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, c, gr] = Array.from(match);

    const hcg = [context.readInt(h), context.readFloat(c), context.readFloat(gr)];

    if (hcg.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hcg = hcg;
    return (this.alpha = 1);
  },
);

// hcga(210,60%,50%,0.7)
registry.createExpression(
  "color-inline:hcga",
  strip(`\
(?:${insensitive("hcga")})${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, c, gr, a] = Array.from(match);

    const hcg = [context.readInt(h), context.readFloat(c), context.readFloat(gr)];

    if (hcg.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hcg = hcg;
    return (this.alpha = context.readFloat(a));
  },
);

// vec4(0.2, 0.5, 0.9, 0.7)
registry.createExpression(
  "color-inline:vec4",
  strip(`\
vec4${ps}\\s* \
(${float}) \
${comma} \
(${float}) \
${comma} \
(${float}) \
${comma} \
(${float}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, s, l, a] = Array.from(match);

    return (this.rgba = [
      context.readFloat(h) * 255,
      context.readFloat(s) * 255,
      context.readFloat(l) * 255,
      context.readFloat(a),
    ]);
  },
);

// hwb(210,40%,40%)
registry.createExpression(
  "color-inline:hwb",
  strip(`\
${insensitive("hwb")}${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
${comma} \
(${optionalPercent}|${variables}) \
(?:${comma}(${float}|${variables}))? \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, h, w, b, a] = Array.from(match);

    this.hwb = [context.readInt(h), context.readFloat(w), context.readFloat(b)];
    return (this.alpha = a != null ? context.readFloat(a) : 1);
  },
);

// cmyk(0,0.5,1,0)
registry.createExpression(
  "color-inline:cmyk",
  strip(`\
${insensitive("cmyk")}${ps}\\s* \
(${float}|${variables}) \
${comma} \
(${float}|${variables}) \
${comma} \
(${float}|${variables}) \
${comma} \
(${float}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, c, m, y, k] = Array.from(match);

    return (this.cmyk = [
      context.readFloat(c),
      context.readFloat(m),
      context.readFloat(y),
      context.readFloat(k),
    ]);
  },
);

// gray(50%)
// The priority is set to 1 to make sure that it appears before named colors
registry.createExpression(
  "color-inline:gray",
  strip(`\
${insensitive("gray")}${ps}\\s* \
(${optionalPercent}|${variables}) \
(?:${comma}(${float}|${variables}))? \
${pe}`),
  1,
  ["*"],
  function (match, expression, context) {
    let [_, p, a] = Array.from(match);

    p = (context.readFloat(p) / 100) * 255;
    this.rgb = [p, p, p];
    return (this.alpha = a != null ? context.readFloat(a) : 1);
  },
);

// dodgerblue
const colors = Object.keys(SVGColors.allCases);
const colorRegexp = `(?:${namePrefixes})(${colors.join("|")})\\b(?![ \\t]*[-\\.:=\\(])`;

registry.createExpression(
  "color-inline:named_colors",
  colorRegexp,
  [],
  function (match, expression, context) {
    const [_, name] = Array.from(match);

    this.colorExpression = this.name = name;
    return (this.hex = context.SVGColors.allCases[name].replace("#", ""));
  },
);

//#    ######## ##     ## ##    ##  ######
//#    ##       ##     ## ###   ## ##    ##
//#    ##       ##     ## ####  ## ##
//#    ######   ##     ## ## ## ## ##
//#    ##       ##     ## ##  #### ##
//#    ##       ##     ## ##   ### ##    ##
//#    ##        #######  ##    ##  ######

// darken(#666666, 20%)
registry.createExpression(
  "color-inline:darken",
  strip(`\
darken${ps} \
(${notQuote}) \
${comma} \
(${optionalPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloat(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [h, s, context.clampInt(l - amount)];
    return (this.alpha = baseColor.alpha);
  },
);

// lighten(#666666, 20%)
registry.createExpression(
  "color-inline:lighten",
  strip(`\
lighten${ps} \
(${notQuote}) \
${comma} \
(${optionalPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloat(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [h, s, context.clampInt(l + amount)];
    return (this.alpha = baseColor.alpha);
  },
);

// fade(#ffffff, 0.5)
// alpha(#ffffff, 0.5)
registry.createExpression(
  "color-inline:fade",
  strip(`\
(?:fade|alpha)${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    this.rgb = baseColor.rgb;
    return (this.alpha = amount);
  },
);

// transparentize(#ffffff, 0.5)
// transparentize(#ffffff, 50%)
// fadeout(#ffffff, 0.5)
registry.createExpression(
  "color-inline:transparentize",
  strip(`\
(?:transparentize|fadeout|fade-out|fade_out)${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    this.rgb = baseColor.rgb;
    return (this.alpha = context.clamp(baseColor.alpha - amount));
  },
);

// opacify(0x78ffffff, 0.5)
// opacify(0x78ffffff, 50%)
// fadein(0x78ffffff, 0.5)
// alpha(0x78ffffff, 0.5)
registry.createExpression(
  "color-inline:opacify",
  strip(`\
(?:opacify|fadein|fade-in|fade_in)${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    this.rgb = baseColor.rgb;
    return (this.alpha = context.clamp(baseColor.alpha + amount));
  },
);

// red(#000,255)
// green(#000,255)
// blue(#000,255)
registry.createExpression(
  "color-inline:stylus_component_functions",
  strip(`\
(red|green|blue)${ps} \
(${notQuote}) \
${comma} \
(${int}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, channel, subexpr, amount] = Array.from(match);

    amount = context.readInt(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }
    if (isNaN(amount)) {
      return (this.invalid = true);
    }

    return (this[channel] = amount);
  },
);

// transparentify(#808080)
registry.createExpression(
  "color-inline:transparentify",
  strip(`\
transparentify${ps} \
(${notQuote}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    let [top, bottom, alpha] = Array.from(context.split(expr));

    top = context.readColor(top);
    bottom = context.readColor(bottom);
    alpha = context.readFloatOrPercent(alpha);

    if (context.isInvalid(top)) {
      return (this.invalid = true);
    }
    if (bottom != null && context.isInvalid(bottom)) {
      return (this.invalid = true);
    }

    if (bottom == null) {
      bottom = new context.Color(255, 255, 255, 1);
    }
    if (isNaN(alpha)) {
      alpha = undefined;
    }

    let bestAlpha = ["red", "green", "blue"]
      .map(function (channel) {
        const res =
          (top[channel] - bottom[channel]) /
          ((0 < top[channel] - bottom[channel] ? 255 : 0) - bottom[channel]);
        return res;
      })
      .sort((a, b) => a < b)[0];

    const processChannel = function (channel) {
      if (bestAlpha === 0) {
        return bottom[channel];
      } else {
        return bottom[channel] + (top[channel] - bottom[channel]) / bestAlpha;
      }
    };

    if (alpha != null) {
      bestAlpha = alpha;
    }
    bestAlpha = Math.max(Math.min(bestAlpha, 1), 0);

    this.red = processChannel("red");
    this.green = processChannel("green");
    this.blue = processChannel("blue");
    return (this.alpha = Math.round(bestAlpha * 100) / 100);
  },
);

// hue(#855, 60deg)
registry.createExpression(
  "color-inline:hue",
  strip(`\
hue${ps} \
(${notQuote}) \
${comma} \
(${int}deg|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloat(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }
    if (isNaN(amount)) {
      return (this.invalid = true);
    }

    const [_h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [amount % 360, s, l];
    return (this.alpha = baseColor.alpha);
  },
);

// saturation(#855, 60deg)
// lightness(#855, 60deg)
registry.createExpression(
  "color-inline:stylus_sl_component_functions",
  strip(`\
(saturation|lightness)${ps} \
(${notQuote}) \
${comma} \
(${intOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, channel, subexpr, amount] = Array.from(match);

    amount = context.readInt(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }
    if (isNaN(amount)) {
      return (this.invalid = true);
    }

    baseColor[channel] = amount;
    return (this.rgba = baseColor.rgba);
  },
);

// adjust-hue(#855, 60deg)
registry.createExpression(
  "color-inline:adjust-hue",
  strip(`\
adjust-hue${ps} \
(${notQuote}) \
${comma} \
(-?${int}deg|${variables}|-?${optionalPercent}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloat(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [(h + amount) % 360, s, l];
    return (this.alpha = baseColor.alpha);
  },
);

// mix(#f00, #00F, 25%)
// mix(#f00, #00F)
registry.createExpression(
  "color-inline:mix",
  `mix${ps}(${notQuote})${pe}`,
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    let [color1, color2, amount] = Array.from(context.split(expr));

    if (amount != null) {
      amount = context.readFloatOrPercent(amount);
    } else {
      amount = 0.5;
    }

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = context.mixColors(baseColor1, baseColor2, amount));
  },
);

// tint(red, 50%)
registry.createExpression(
  "color-inline:stylus_tint",
  strip(`\
tint${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["styl", "stylus", "less"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const white = new context.Color(255, 255, 255);

    return (this.rgba = context.mixColors(white, baseColor, amount).rgba);
  },
);

// shade(red, 50%)
registry.createExpression(
  "color-inline:stylus_shade",
  strip(`\
shade${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["styl", "stylus", "less"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const black = new context.Color(0, 0, 0);

    return (this.rgba = context.mixColors(black, baseColor, amount).rgba);
  },
);

// tint(red, 50%)
registry.createExpression(
  "color-inline:compass_tint",
  strip(`\
tint${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["sass:compass", "scss:compass"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const white = new context.Color(255, 255, 255);

    return (this.rgba = context.mixColors(baseColor, white, amount).rgba);
  },
);

// shade(red, 50%)
registry.createExpression(
  "color-inline:compass_shade",
  strip(`\
shade${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["sass:compass", "scss:compass"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const black = new context.Color(0, 0, 0);

    return (this.rgba = context.mixColors(baseColor, black, amount).rgba);
  },
);

// tint(red, 50%)
registry.createExpression(
  "color-inline:bourbon_tint",
  strip(`\
tint${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["sass:bourbon", "scss:bourbon"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const white = new context.Color(255, 255, 255);

    return (this.rgba = context.mixColors(white, baseColor, amount).rgba);
  },
);

// shade(red, 50%)
registry.createExpression(
  "color-inline:bourbon_shade",
  strip(`\
shade${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["sass:bourbon", "scss:bourbon"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const black = new context.Color(0, 0, 0);

    return (this.rgba = context.mixColors(black, baseColor, amount).rgba);
  },
);

// desaturate(#855, 20%)
// desaturate(#855, 0.2)
registry.createExpression(
  "color-inline:desaturate",
  `desaturate${ps}(${notQuote})${comma}(${floatOrPercent}|${variables})${pe}`,
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [h, context.clampInt(s - amount * 100), l];
    return (this.alpha = baseColor.alpha);
  },
);

// saturate(#855, 20%)
// saturate(#855, 0.2)
registry.createExpression(
  "color-inline:saturate",
  strip(`\
saturate${ps} \
(${notQuote}) \
${comma} \
(${floatOrPercent}|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, amount] = Array.from(match);

    amount = context.readFloatOrPercent(amount);
    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [h, context.clampInt(s + amount * 100), l];
    return (this.alpha = baseColor.alpha);
  },
);

// grayscale(red)
// greyscale(red)
registry.createExpression(
  "color-inline:grayscale",
  `gr(?:a|e)yscale${ps}(${notQuote})${pe}`,
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, _s, l] = Array.from(baseColor.hsl);

    this.hsl = [h, 0, l];
    return (this.alpha = baseColor.alpha);
  },
);

// invert(green)
registry.createExpression(
  "color-inline:invert",
  `invert${ps}(${notQuote})${pe}`,
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [r, g, b] = Array.from(baseColor.rgb);

    this.rgb = [255 - r, 255 - g, 255 - b];
    return (this.alpha = baseColor.alpha);
  },
);

// complement(green)
registry.createExpression(
  "color-inline:complement",
  `complement${ps}(${notQuote})${pe}`,
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [(h + 180) % 360, s, l];
    return (this.alpha = baseColor.alpha);
  },
);

// spin(green, 20)
// spin(green, 20deg)
registry.createExpression(
  "color-inline:spin",
  strip(`\
spin${ps} \
(${notQuote}) \
${comma} \
(-?(${int})(deg)?|${variables}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    let [_, subexpr, angle] = Array.from(match);

    const baseColor = context.readColor(subexpr);
    angle = context.readInt(angle);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [(360 + h + angle) % 360, s, l];
    return (this.alpha = baseColor.alpha);
  },
);

// contrast(#666666, #111111, #999999, threshold)
registry.createExpression(
  "color-inline:contrast_n_arguments",
  strip(`\
contrast${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    let [base, dark, light, threshold] = Array.from(context.split(expr));

    const baseColor = context.readColor(base);
    dark = context.readColor(dark);
    light = context.readColor(light);
    if (threshold != null) {
      threshold = context.readPercent(threshold);
    }

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }
    if (dark != null ? dark.invalid : undefined) {
      return (this.invalid = true);
    }
    if (light != null ? light.invalid : undefined) {
      return (this.invalid = true);
    }

    const res = context.contrast(baseColor, dark, light);

    if (context.isInvalid(res)) {
      return (this.invalid = true);
    }

    return ({ rgb: this.rgb } = context.contrast(baseColor, dark, light, threshold));
  },
);

// contrast(#666666)
registry.createExpression(
  "color-inline:contrast_1_argument",
  strip(`\
contrast${ps} \
(${notQuote}) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    return ({ rgb: this.rgb } = context.contrast(baseColor));
  },
);

// color(green tint(50%))
registry.createExpression(
  "color-inline:css_color_function",
  `(?:${namePrefixes})(${insensitive("color")}${ps}(${notQuote})${pe})`,
  ["css"],
  function (match, expression, context) {
    try {
      let [_, expr] = Array.from(match);
      for (var k in context.vars) {
        var v = context.vars[k];
        expr = expr.replace(new RegExp(escapeRegExp(k), "g"), v.value);
      }

      const cssColor = require("css-color-function");
      const rgba = cssColor.convert(expr.toLowerCase());
      this.rgba = context.readColor(rgba).rgba;
      return (this.colorExpression = expr);
    } catch {
      return (this.invalid = true);
    }
  },
);

// adjust-color(red, $lightness: 30%)
registry.createExpression(
  "color-inline:sass_adjust_color",
  `adjust-color${ps}(${notQuote})${pe}`,
  1,
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);
    const res = context.split(subexpr);
    const subject = res[0];
    const params = res.slice(1);

    const baseColor = context.readColor(subject);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    for (var param of params) {
      context.readParam(param, (name, value) => (baseColor[name] += context.readFloat(value)));
    }

    return (this.rgba = baseColor.rgba);
  },
);

// scale-color(red, $lightness: 30%)
registry.createExpression(
  "color-inline:sass_scale_color",
  `scale-color${ps}(${notQuote})${pe}`,
  1,
  ["*"],
  function (match, expression, context) {
    const MAX_PER_COMPONENT = {
      red: 255,
      green: 255,
      blue: 255,
      alpha: 1,
      hue: 360,
      saturation: 100,
      lightness: 100,
    };

    const [_, subexpr] = Array.from(match);
    const res = context.split(subexpr);
    const subject = res[0];
    const params = res.slice(1);

    const baseColor = context.readColor(subject);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    for (var param of params) {
      context.readParam(param, function (name, value) {
        let result;
        value = context.readFloat(value) / 100;

        result = (() => {
          if (value > 0) {
            const dif = MAX_PER_COMPONENT[name] - baseColor[name];
            return (result = baseColor[name] + dif * value);
          } else {
            return (result = baseColor[name] * (1 + value));
          }
        })();

        return (baseColor[name] = result);
      });
    }

    return (this.rgba = baseColor.rgba);
  },
);

// change-color(red, $lightness: 30%)
registry.createExpression(
  "color-inline:sass_change_color",
  `change-color${ps}(${notQuote})${pe}`,
  1,
  ["*"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);
    const res = context.split(subexpr);
    const subject = res[0];
    const params = res.slice(1);

    const baseColor = context.readColor(subject);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    for (var param of params) {
      context.readParam(param, (name, value) => (baseColor[name] = context.readFloat(value)));
    }

    return (this.rgba = baseColor.rgba);
  },
);

// blend(rgba(#FFDE00,.42), 0x19C261)
registry.createExpression(
  "color-inline:stylus_blend",
  strip(`\
blend${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return (this.rgba = [
      baseColor1.red * baseColor1.alpha + baseColor2.red * (1 - baseColor1.alpha),
      baseColor1.green * baseColor1.alpha + baseColor2.green * (1 - baseColor1.alpha),
      baseColor1.blue * baseColor1.alpha + baseColor2.blue * (1 - baseColor1.alpha),
      baseColor1.alpha + baseColor2.alpha - baseColor1.alpha * baseColor2.alpha,
    ]);
  },
);

// Color(50,120,200,255)
registry.createExpression(
  "color-inline:lua_rgba",
  strip(`\
(?:${namePrefixes})Color${ps}\\s* \
(${int}|${variables}) \
${comma} \
(${int}|${variables}) \
${comma} \
(${int}|${variables}) \
${comma} \
(${int}|${variables}) \
${pe}\
`),
  ["lua"],
  function (match, expression, context) {
    const [_, r, g, b, a] = Array.from(match);

    this.red = context.readInt(r);
    this.green = context.readInt(g);
    this.blue = context.readInt(b);
    return (this.alpha = context.readInt(a) / 255);
  },
);

//#    ########  ##       ######## ##    ## ########
//#    ##     ## ##       ##       ###   ## ##     ##
//#    ##     ## ##       ##       ####  ## ##     ##
//#    ########  ##       ######   ## ## ## ##     ##
//#    ##     ## ##       ##       ##  #### ##     ##
//#    ##     ## ##       ##       ##   ### ##     ##
//#    ########  ######## ######## ##    ## ########

// multiply(#f00, #00F)
registry.createExpression(
  "color-inline:multiply",
  strip(`\
multiply${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.MULTIPLY));
  },
);

// screen(#f00, #00F)
registry.createExpression(
  "color-inline:screen",
  strip(`\
screen${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.SCREEN));
  },
);

// overlay(#f00, #00F)
registry.createExpression(
  "color-inline:overlay",
  strip(`\
overlay${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.OVERLAY));
  },
);

// softlight(#f00, #00F)
registry.createExpression(
  "color-inline:softlight",
  strip(`\
softlight${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.SOFT_LIGHT));
  },
);

// hardlight(#f00, #00F)
registry.createExpression(
  "color-inline:hardlight",
  strip(`\
hardlight${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.HARD_LIGHT));
  },
);

// difference(#f00, #00F)
registry.createExpression(
  "color-inline:difference",
  strip(`\
difference${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.DIFFERENCE));
  },
);

// exclusion(#f00, #00F)
registry.createExpression(
  "color-inline:exclusion",
  strip(`\
exclusion${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.EXCLUSION));
  },
);

// average(#f00, #00F)
registry.createExpression(
  "color-inline:average",
  strip(`\
average${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.AVERAGE));
  },
);

// negation(#f00, #00F)
registry.createExpression(
  "color-inline:negation",
  strip(`\
negation${ps} \
( \
${notQuote} \
${comma} \
${notQuote} \
) \
${pe}\
`),
  ["*"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const [color1, color2] = Array.from(context.split(expr));

    const baseColor1 = context.readColor(color1);
    const baseColor2 = context.readColor(color2);

    if (context.isInvalid(baseColor1) || context.isInvalid(baseColor2)) {
      return (this.invalid = true);
    }

    return ({ rgba: this.rgba } = baseColor1.blend(baseColor2, context.BlendModes.NEGATION));
  },
);

//#    ######## ##       ##     ##
//#    ##       ##       ###   ###
//#    ##       ##       #### ####
//#    ######   ##       ## ### ##
//#    ##       ##       ##     ##
//#    ##       ##       ##     ##
//#    ######## ######## ##     ##

// rgba 50 120 200 1
registry.createExpression(
  "color-inline:elm_rgba",
  strip(`\
rgba\\s+ \
(${int}|${variables}) \
\\s+ \
(${int}|${variables}) \
\\s+ \
(${int}|${variables}) \
\\s+ \
(${float}|${variables})\
`),
  ["elm"],
  function (match, expression, context) {
    const [_, r, g, b, a] = Array.from(match);

    this.red = context.readInt(r);
    this.green = context.readInt(g);
    this.blue = context.readInt(b);
    return (this.alpha = context.readFloat(a));
  },
);

// rgb 50 120 200
registry.createExpression(
  "color-inline:elm_rgb",
  strip(`\
rgb\\s+ \
(${int}|${variables}) \
\\s+ \
(${int}|${variables}) \
\\s+ \
(${int}|${variables})\
`),
  ["elm"],
  function (match, expression, context) {
    const [_, r, g, b] = Array.from(match);

    this.red = context.readInt(r);
    this.green = context.readInt(g);
    return (this.blue = context.readInt(b));
  },
);

const elmAngle = `(?:${float}|\\(degrees\\s+(?:${int}|${variables})\\))`;

// hsl 210 50 50
registry.createExpression(
  "color-inline:elm_hsl",
  strip(`\
hsl\\s+ \
(${elmAngle}|${variables}) \
\\s+ \
(${float}|${variables}) \
\\s+ \
(${float}|${variables})\
`),
  ["elm"],
  function (match, expression, context) {
    let m;
    const elmDegreesRegexp = new RegExp(`\\(degrees\\s+(${context.int}|${context.variablesRE})\\)`);

    let [_, h, s, l] = Array.from(match);

    if ((m = elmDegreesRegexp.exec(h))) {
      h = context.readInt(m[1]);
    } else {
      h = (context.readFloat(h) * 180) / Math.PI;
    }

    const hsl = [h, context.readFloat(s), context.readFloat(l)];

    if (hsl.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsl = hsl;
    return (this.alpha = 1);
  },
);

// hsla 210 50 50 0.7
registry.createExpression(
  "color-inline:elm_hsla",
  strip(`\
hsla\\s+ \
(${elmAngle}|${variables}) \
\\s+ \
(${float}|${variables}) \
\\s+ \
(${float}|${variables}) \
\\s+ \
(${float}|${variables})\
`),
  ["elm"],
  function (match, expression, context) {
    let m;
    const elmDegreesRegexp = new RegExp(`\\(degrees\\s+(${context.int}|${context.variablesRE})\\)`);

    let [_, h, s, l, a] = Array.from(match);

    if ((m = elmDegreesRegexp.exec(h))) {
      h = context.readInt(m[1]);
    } else {
      h = (context.readFloat(h) * 180) / Math.PI;
    }

    const hsl = [h, context.readFloat(s), context.readFloat(l)];

    if (hsl.some((v) => v == null || isNaN(v))) {
      return (this.invalid = true);
    }

    this.hsl = hsl;
    return (this.alpha = context.readFloat(a));
  },
);

// grayscale 1
registry.createExpression(
  "color-inline:elm_grayscale",
  `gr(?:a|e)yscale\\s+(${float}|${variables})`,
  ["elm"],
  function (match, expression, context) {
    let [_, amount] = Array.from(match);
    amount = Math.floor(255 - context.readFloat(amount) * 255);
    return (this.rgb = [amount, amount, amount]);
  },
);

registry.createExpression(
  "color-inline:elm_complement",
  strip(`\
complement\\s+(${notQuote})\
`),
  ["elm"],
  function (match, expression, context) {
    const [_, subexpr] = Array.from(match);

    const baseColor = context.readColor(subexpr);

    if (context.isInvalid(baseColor)) {
      return (this.invalid = true);
    }

    const [h, s, l] = Array.from(baseColor.hsl);

    this.hsl = [(h + 180) % 360, s, l];
    return (this.alpha = baseColor.alpha);
  },
);

//#    ##          ###    ######## ######## ##     ##
//#    ##         ## ##      ##    ##        ##   ##
//#    ##        ##   ##     ##    ##         ## ##
//#    ##       ##     ##    ##    ######      ###
//#    ##       #########    ##    ##         ## ##
//#    ##       ##     ##    ##    ##        ##   ##
//#    ######## ##     ##    ##    ######## ##     ##

registry.createExpression(
  "color-inline:latex_gray",
  strip(`\
\\[gray\\]\\{(${float})\\}\
`),
  ["tex"],
  function (match, expression, context) {
    let [_, amount] = Array.from(match);

    amount = context.readFloat(amount) * 255;
    return (this.rgb = [amount, amount, amount]);
  },
);

registry.createExpression(
  "color-inline:latex_html",
  strip(`\
\\[HTML\\]\\{(${hexadecimal}{6})\\}\
`),
  ["tex"],
  function (match, _expression, _context) {
    const [_, hexa] = Array.from(match);

    return (this.hex = hexa);
  },
);

registry.createExpression(
  "color-inline:latex_rgb",
  strip(`\
\\[rgb\\]\\{(${float})${comma}(${float})${comma}(${float})\\}\
`),
  ["tex"],
  function (match, expression, context) {
    let [_, r, g, b] = Array.from(match);

    r = Math.floor(context.readFloat(r) * 255);
    g = Math.floor(context.readFloat(g) * 255);
    b = Math.floor(context.readFloat(b) * 255);
    return (this.rgb = [r, g, b]);
  },
);

registry.createExpression(
  "color-inline:latex_RGB",
  strip(`\
\\[RGB\\]\\{(${int})${comma}(${int})${comma}(${int})\\}\
`),
  ["tex"],
  function (match, expression, context) {
    let [_, r, g, b] = Array.from(match);

    r = context.readInt(r);
    g = context.readInt(g);
    b = context.readInt(b);
    return (this.rgb = [r, g, b]);
  },
);

registry.createExpression(
  "color-inline:latex_cmyk",
  strip(`\
\\[cmyk\\]\\{(${float})${comma}(${float})${comma}(${float})${comma}(${float})\\}\
`),
  ["tex"],
  function (match, expression, context) {
    let [_, c, m, y, k] = Array.from(match);

    c = context.readFloat(c);
    m = context.readFloat(m);
    y = context.readFloat(y);
    k = context.readFloat(k);
    return (this.cmyk = [c, m, y, k]);
  },
);

registry.createExpression(
  "color-inline:latex_predefined",
  strip(`\
\\{(black|blue|brown|cyan|darkgray|gray|green|lightgray|lime|magenta|olive|orange|pink|purple|red|teal|violet|white|yellow)\\}\
`),
  ["tex"],
  function (match, expression, context) {
    const [_, name] = Array.from(match);
    return (this.hex = context.SVGColors.allCases[name].replace("#", ""));
  },
);

registry.createExpression(
  "color-inline:latex_predefined_dvipnames",
  strip(`\
\\{(Apricot|Aquamarine|Bittersweet|Black|Blue|BlueGreen|BlueViolet|BrickRed|Brown|BurntOrange|CadetBlue|CarnationPink|Cerulean|CornflowerBlue|Cyan|Dandelion|DarkOrchid|Emerald|ForestGreen|Fuchsia|Goldenrod|Gray|Green|GreenYellow|JungleGreen|Lavender|LimeGreen|Magenta|Mahogany|Maroon|Melon|MidnightBlue|Mulberry|NavyBlue|OliveGreen|Orange|OrangeRed|Orchid|Peach|Periwinkle|PineGreen|Plum|ProcessBlue|Purple|RawSienna|Red|RedOrange|RedViolet|Rhodamine|RoyalBlue|RoyalPurple|RubineRed|Salmon|SeaGreen|Sepia|SkyBlue|SpringGreen|Tan|TealBlue|Thistle|Turquoise|Violet|VioletRed|White|WildStrawberry|Yellow|YellowGreen|YellowOrange)\\}\
`),
  ["tex"],
  function (match, expression, context) {
    const [_, name] = Array.from(match);
    return (this.hex = context.DVIPnames[name].replace("#", ""));
  },
);

registry.createExpression(
  "color-inline:latex_mix",
  strip(`\
\\{([^!\\n\\}]+[!][^\\}\\n]+)\\}\
`),
  ["tex"],
  function (match, expression, context) {
    const [_, expr] = Array.from(match);

    const op = expr.split("!");

    const mix = function (...args) {
      const [a, p, b] = Array.from(args[0]);
      const colorA = a instanceof context.Color ? a : context.readColor(`{${a}}`);
      const colorB = b instanceof context.Color ? b : context.readColor(`{${b}}`);
      percent = context.readInt(p);

      return context.mixColors(colorA, colorB, percent / 100);
    };

    if (op.length === 2) {
      op.push(new context.Color(255, 255, 255));
    }

    let nextColor = null;

    while (op.length > 0) {
      var triplet = op.splice(0, 3);
      nextColor = mix(triplet);
      if (op.length > 0) {
        op.unshift(nextColor);
      }
    }

    return (this.rgb = nextColor.rgb);
  },
);

//     #######  ########
//    ##     ##    ##
//    ##     ##    ##
//    ##     ##    ##
//    ##  ## ##    ##
//    ##    ##     ##
//     ##### ##    ##

// Qt.rgba(1.0,0.5,0.0,0.7)
registry.createExpression(
  "color-inline:qt_rgba",
  strip(`\
Qt\\.rgba${ps}\\s* \
(${float}) \
${comma} \
(${float}) \
${comma} \
(${float}) \
${comma} \
(${float}) \
${pe}\
`),
  ["qml", "c", "cc", "cpp"],
  1,
  function (match, expression, context) {
    const [_, r, g, b, a] = Array.from(match);

    this.red = context.readFloat(r) * 255;
    this.green = context.readFloat(g) * 255;
    this.blue = context.readFloat(b) * 255;
    return (this.alpha = context.readFloat(a));
  },
);
