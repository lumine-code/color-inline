const { Disposable } = require("lumine");

module.exports = class ColorInlineAPI {
  constructor(projectOrGetter, isAvailable = () => true) {
    this.projectOrGetter = projectOrGetter;
    this.isAvailable = isAvailable;
  }

  getProject() {
    if (!this.isAvailable()) return null;
    if (typeof this.projectOrGetter === "function") {
      this.projectOrGetter = this.projectOrGetter();
    }
    return this.projectOrGetter;
  }

  getPalette() {
    return this.getProject()?.getPalette();
  }

  getVariables() {
    return this.getProject()?.getVariables() ?? [];
  }

  getColorVariables() {
    return this.getProject()?.getColorVariables() ?? [];
  }

  observeColorBuffers(callback) {
    return this.getProject()?.observeColorBuffers(callback) ?? new Disposable();
  }
};
