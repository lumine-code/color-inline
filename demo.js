// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: [],
  viewport: { width: 1100, height: 720 },
  async before() {},
  async prepare(context) {
    const { lumine, state, open, project } = context;
    state.editor = await open("palette.css");
    await lumine.project.setPaths([project]);
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Browse colors found in the current stylesheet.",
      timeout: 60000,
      async run(context) {
        const { lumine } = context;
        {
          await lumine.packages.getActivePackage("color-inline").mainModule.showPalette();
        }
      },
      ready(context) {
        const { lumine } = context;
        return Boolean(
          lumine.workspace.getActivePaneItem()?.getURI?.() === "color-inline://palette",
        );
      },
    },
  ],
  async cleanup() {},
};
