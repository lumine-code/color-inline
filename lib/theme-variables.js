// Read the public contract at sampling time so newly added colors are included.
module.exports = function getThemeColorVariables() {
  return lumine.themes.getVariables().filter(({ type }) => type === "color");
};
