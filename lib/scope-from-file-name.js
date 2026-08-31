/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const path = require("path");
module.exports = function (p) {
  if (p == null) {
    return;
  }
  // Either separator: on Windows this only ever saw a backslash, fell through
  // to `path.extname('.color-inline')` -- which is "" for a leading-dot name -- and
  // handed back an empty scope, which matches no expression at all. The
  // defaults file was silently never scanned.
  if (p.match(/[\\/]\.color-inline$/)) {
    return "color-inline";
  } else {
    return path.extname(p).slice(1);
  }
};
