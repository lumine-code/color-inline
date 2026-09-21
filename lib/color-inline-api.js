module.exports = class ColorInlineAPI {
  constructor(projectOrGetter) {
    this.projectOrGetter = projectOrGetter;
  }

  getProject() {
    if (typeof this.projectOrGetter === "function") {
      this.projectOrGetter = this.projectOrGetter();
    }
    return this.projectOrGetter;
  }

  getPalette() {
    return this.getProject().getPalette();
  }

  getVariables() {
    return this.getProject().getVariables();
  }

  getColorVariables() {
    return this.getProject().getColorVariables();
  }

  observeColorBuffers(callback) {
    return this.getProject().observeColorBuffers(callback);
  }
};
