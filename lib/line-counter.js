// Count lines up to a match without rescanning its entire text prefix for every
// match. A scanner can also restart, search backwards, or receive new text.
module.exports = class LineCounter {
  constructor() {
    this.text = null;
    this.index = 0;
    this.line = 0;
  }

  lineAt(text, index) {
    const end = Math.min(index + 1, text.length);
    if (text !== this.text || end < this.index) {
      this.text = text;
      this.index = 0;
      this.line = 0;
    }

    while (this.index < end) {
      const character = text.charCodeAt(this.index);
      if (
        character === 13 ||
        (character === 10 && (this.index === 0 || text.charCodeAt(this.index - 1) !== 13))
      ) {
        this.line++;
      }
      this.index++;
    }

    return this.line;
  }
};
