// Compatibility for css-color-function 1.3.3's legacy adjusters. Adapted blend
// and contrast semantics retain their MIT provenance in the package LICENSE.
const Color = require("./color");
const names = require("./svg-colors").lowercase;

// Budget checks precede tokenization and color parsing. Every parser step
// consumes input; recursive color() evaluation is limited independently.
const MAX_LENGTH = 16384;
const MAX_DEPTH = 32;
const MAX_TOKENS = 2048;
const CHANNELS = {
  red: ["rgb", 0],
  green: ["rgb", 1],
  blue: ["rgb", 2],
  hue: ["hsl", 0],
  h: ["hsl", 0],
  saturation: ["hsl", 1],
  s: ["hsl", 1],
  lightness: ["hsl", 2],
  l: ["hsl", 2],
  whiteness: ["hwb", 1],
  w: ["hwb", 1],
  blackness: ["hwb", 2],
  b: ["hwb", 2],
};
const fail = () => {
  throw new SyntaxError("Invalid legacy color() expression");
};
const finite = (value) => {
  if (!Number.isFinite(value)) fail();
  return value;
};
const clamp = (value, max) => Math.max(0, Math.min(max, finite(value)));
const rounded = (space, values) =>
  values.map((value, index) =>
    Math.round(clamp(value, space === "rgb" ? 255 : index === 0 ? 360 : 100)),
  );

class LegacyColor {
  constructor(space, values, alpha = 1) {
    this.alpha = clamp(alpha, 1);
    this.set(space, values);
  }
  set(space, values) {
    const input = rounded(space, values);
    const color = new Color();
    if (space === "hwb") {
      const [hue, white, black] = input;
      if (white + black >= 100) {
        color.rgb = [1, 1, 1].map(() => (255 * white) / (white + black));
      } else {
        color.hsl = [hue, 100, 50];
        color.rgb = color.rgb.map(
          (channel) => channel * (1 - (white + black) / 100) + (255 * white) / 100,
        );
      }
    } else {
      color[space] = input;
    }
    // The old mutable Color caches every space, rounded independently from
    // the source space. Re-deriving HSL from rounded RGB loses this contract.
    this.values = {
      rgb: rounded("rgb", color.rgb),
      hsl: rounded("hsl", color.hsl),
      hwb: rounded("hwb", color.hwb),
    };
    this.values[space] = input;
  }
  clone() {
    const copy = new LegacyColor("rgb", this.values.rgb, this.alpha);
    copy.values = Object.fromEntries(
      Object.entries(this.values).map(([space, values]) => [space, values.slice()]),
    );
    return copy;
  }
  model() {
    return new Color(...this.values.rgb, this.alpha);
  }
  channel(space, index, value) {
    const values = this.values[space].slice();
    if (space === "hsl" && index === 0) value = ((finite(value) % 360) + 360) % 360;
    values[index] = value;
    this.set(space, values);
  }
}

function baseColor(token) {
  if (token === "transparent") return new LegacyColor("rgb", [0, 0, 0], 0);
  if (/^[a-z]+$/.test(token) && Object.hasOwn(names, token)) token = names[token];
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(token)) {
    const color = new Color();
    const hex = token.slice(1);
    color.hex = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return new LegacyColor("rgb", color.rgb);
  }
  const opening = token.indexOf("(");
  if (opening < 0 || !token.endsWith(")")) fail();
  const name = token.slice(0, opening);
  const parts = token
    .slice(opening + 1, -1)
    .split(",")
    .map((value) => value.trim());
  if (parts.length !== 3 && parts.length !== 4) fail();
  let space, values;
  const number = (value, pattern) => {
    if (!pattern.test(value)) fail();
    return finite(parseFloat(value));
  };
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (name === "rgb" || name === "rgba") {
    space = "rgb";
    const percentages = parts.slice(0, 3).every((value) => value.endsWith("%"));
    values = parts
      .slice(0, 3)
      .map((value) =>
        percentages
          ? Math.round(number(value.slice(0, -1), decimal) * 2.55)
          : number(value, /^[+-]?\d+$/),
      );
  } else if (name === "hsl" || name === "hsla" || name === "hwb") {
    space = name === "hwb" ? "hwb" : "hsl";
    const hue = number(parts[0].replace(/deg$/, ""), /^[+-]?\d+$/);
    values = [
      hue,
      ...parts.slice(1, 3).map((value) => {
        if (!value.endsWith("%")) fail();
        return number(value.slice(0, -1), decimal);
      }),
    ];
  } else {
    // Context knows more formats, but the legacy color() base did not.
    fail();
  }
  return new LegacyColor(space, values, parts.length === 4 ? number(parts[3], decimal) : 1);
}

function mix(color, other, percentage) {
  const alpha = color.alpha;
  color.alpha = 1;
  const p = percentage,
    w = 2 * p - 1,
    a = color.alpha - other.alpha;
  const w1 = ((w * a === -1 ? w : (w + a) / (1 + w * a)) + 1) / 2;
  color.set(
    "rgb",
    color.values.rgb.map((channel, index) => w1 * channel + (1 - w1) * other.values.rgb[index]),
  );
  color.alpha = alpha;
}
function contrastRatio(first, second) {
  const one = first.model().luma,
    two = second.model().luma;
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}
function contrast(color, amount) {
  const hue = color.values.hsl[0];
  const max = new LegacyColor("hwb", [
    hue,
    color.model().luma < 0.5 ? 100 : 0,
    color.model().luma < 0.5 ? 0 : 100,
  ]);
  let min = max;
  if (contrastRatio(color, max) > 4.5) {
    min = color.clone();
    let [minWhite, minBlack] = min.values.hwb.slice(1);
    let [maxWhite, maxBlack] = max.values.hwb.slice(1);
    // Integer 0..100 bounds halve each pass; the explicit cap also protects
    // malformed arithmetic from turning contrast into an unbounded loop.
    for (
      let step = 0;
      Math.abs(minWhite - maxWhite) > 1 || Math.abs(minBlack - maxBlack) > 1;
      step++
    ) {
      if (step >= 16) fail();
      const white = Math.round((maxWhite + minWhite) / 2),
        black = Math.round((maxBlack + minBlack) / 2);
      min.channel("hwb", 1, white);
      min.channel("hwb", 2, black);
      if (contrastRatio(min, color) > 4.5) [maxWhite, maxBlack] = [white, black];
      else [minWhite, minBlack] = [white, black];
    }
    const alpha = min.alpha;
    min.alpha = 1;
    mix(min, max, 1 - amount);
    min.alpha = alpha;
  }
  color.set("hwb", min.values.hwb);
}
function adjust(color, name, args) {
  if (name === "rgb") return; // Intentionally a no-op in the legacy library.
  if (name === "blend" || name === "tint" || name === "shade") {
    let other, amount;
    if (name === "blend") {
      other = args[0] instanceof LegacyColor ? args[0] : baseColor(args[0]);
      amount = args[1];
    } else {
      other = baseColor(name === "tint" ? "white" : "black");
      amount = args[0];
    }
    mix(color, other, 1 - finite(parseInt(amount, 10)) / 100);
    return;
  }
  if (name === "contrast") {
    contrast(color, args.length ? finite(parseInt(args[0], 10)) / 100 : 1);
    return;
  }
  const modifier = ["+", "-", "*"].includes(args[0]) ? args.shift() : null;
  const alpha = name === "alpha" || name === "a";
  if (!alpha && !Object.hasOwn(CHANNELS, name)) fail();
  if (typeof args[0] !== "string") fail();
  const [space, index] = alpha ? [] : CHANNELS[name];
  const current = alpha ? color.alpha : color.values[space][index];
  let value;
  if (alpha || space === "rgb") {
    const token = args[0];
    if (token.includes("%")) {
      value = finite(parseInt(token, 10)) / 100;
      if (!modifier) value *= alpha ? 1 : 255;
      else if (modifier !== "*") value *= current;
    } else value = finite(Number(token));
  } else value = finite(parseFloat(args[0]));
  if (modifier === "+") value = current + value;
  else if (modifier === "-") value = current - value;
  else if (modifier === "*") value = current * value;
  if (alpha) color.alpha = clamp(value, 1);
  else color.channel(space, index, value);
}

class Parser {
  constructor(source) {
    this.source = source;
    this.index = 0;
    this.tokens = 0;
  }
  whitespace() {
    while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index++;
  }
  token() {
    if (++this.tokens > MAX_TOKENS) fail();
  }
  name() {
    const start = this.index;
    while (this.index < this.source.length && /\w/.test(this.source[this.index])) this.index++;
    if (this.index === start) fail();
    this.token();
    return this.source.slice(start, this.index);
  }
  character(expected) {
    if (this.source[this.index++] !== expected) fail();
  }
  base(depth) {
    if (this.source.startsWith("color(", this.index)) return this.color(depth + 1);
    const start = this.index;
    while (this.index < this.source.length && !/[\s()]/.test(this.source[this.index])) this.index++;
    if (this.source[this.index] === "(") {
      this.index++;
      while (this.index < this.source.length && this.source[this.index] !== ")") {
        if (this.source[this.index] === "(") fail();
        this.index++;
      }
      this.character(")");
    }
    this.token();
    return baseColor(this.source.slice(start, this.index));
  }
  arguments(depth) {
    const args = [];
    this.whitespace();
    while (this.index < this.source.length && this.source[this.index] !== ")") {
      this.token();
      if (this.source.startsWith("color(", this.index)) args.push(this.color(depth + 1));
      else if (["+", "-", "*"].includes(this.source[this.index]))
        args.push(this.source[this.index++]);
      else {
        const start = this.index;
        while (this.index < this.source.length && !/[\s)]/.test(this.source[this.index]))
          this.index++;
        args.push(this.source.slice(start, this.index));
      }
      this.whitespace();
    }
    this.character(")");
    return args;
  }
  color(depth = 0) {
    if (depth > MAX_DEPTH || this.name() !== "color") fail();
    this.character("(");
    this.whitespace();
    const color = this.base(depth);
    this.whitespace();
    while (this.index < this.source.length && this.source[this.index] !== ")") {
      const name = this.name();
      this.character("(");
      const args = this.arguments(depth);
      adjust(color, name, args);
      this.whitespace();
    }
    this.character(")");
    return color;
  }
}

module.exports = function legacyColorFunction(source) {
  if (typeof source !== "string" || source.length > MAX_LENGTH) fail();
  const parser = new Parser(source);
  parser.whitespace();
  const color = parser.color();
  parser.whitespace();
  if (parser.index !== source.length) fail();
  return color.model();
};
