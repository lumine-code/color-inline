module.exports = class ColorInlineAPI {
  constructor(project) {
    this.project = project;
  }

  getProject() {
    return this.project;
  }

  getPalette() {
    return this.project.getPalette();
  }

  getVariables() {
    return this.project.getVariables();
  }

  getColorVariables() {
    return this.project.getColorVariables();
  }

  observeColorBuffers(callback) {
    return this.project.observeColorBuffers(callback);
  }
};
