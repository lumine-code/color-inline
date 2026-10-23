exports.failMarkedText = function (context) {
  const parser = context.getGrammar().createParser();
  const prototype = Object.getPrototypeOf(parser);
  const original = prototype.begin;
  const language = parser.language;
  parser.close();
  prototype.begin = function (...args) {
    if (this.language !== language) return original.apply(this, args);
    if (args[0].slice(0, 24).includes("__color_fail__"))
      throw new Error("Owned color syntax parse failure");
    prototype.begin = original;
    return original.apply(this, args);
  };
  return true;
};
