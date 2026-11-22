const { TextBuffer } = require("lumine");
const CandidateScanner = require("../lib/candidate-scanner");

describe("Color Inline candidate transport", () => {
  let scanner;

  beforeEach(() => {
    jasmine.useRealClock();
    scanner = new CandidateScanner();
  });

  afterEach(() => scanner.dispose());

  it("resumes a regex match at the renderer's consumed prefix", async () => {
    const buffer = new TextBuffer("😀 red blue\r\nblue red blue");
    const matches = [];
    try {
      const completed = await scanner.scan(
        buffer.getTextSnapshot(),
        { source: "red blue|blue" },
        ({ values }) => {
          let next;
          for (const { index, end, text } of values) {
            matches.push([index, text]);
            next = text === "red blue" ? index + 3 : end;
            if (next < end) break;
          }
          return next;
        },
      );
      expect(completed).toBeTrue();
      expect(matches).toEqual([
        [3, "red blue"],
        [7, "blue"],
        [13, "blue"],
        [18, "red blue"],
        [22, "blue"],
      ]);
    } finally {
      buffer.destroy();
    }
  });

  it("cancels an owned scan and starts the next request on a fresh task", async () => {
    const buffer = new TextBuffer("red blue");
    const controller = new AbortController();
    const snapshot = buffer.getTextSnapshot();
    try {
      const cancelled = scanner.scan(snapshot, { source: "red", signal: controller.signal }, () =>
        controller.abort(),
      );
      const received = jasmine.createSpy("receive").and.callFake(({ values }) => values[0].end);
      const fresh = scanner.scan(snapshot, { source: "blue" }, received);
      expect(await cancelled).toBeNull();
      expect(await fresh).toBeTrue();
      expect(received).toHaveBeenCalledOnceWith({
        kind: "candidates",
        values: [{ index: 4, end: 8, text: "blue" }],
      });
    } finally {
      buffer.destroy();
    }
  });

  it("bounds input chunks and resumes after consuming part of a large candidate", async () => {
    const source = "a".repeat(270000) + " blue";
    const buffer = new TextBuffer(source);
    const snapshot = buffer.getTextSnapshot();
    const input = [];
    const output = [];
    const sliced = {
      length: snapshot.length,
      slice(start, end) {
        input.push(end - start);
        return snapshot.slice(start, end);
      },
    };
    const matches = [];
    try {
      const completed = await scanner.scan(sliced, { source: "a+|blue" }, (packet) => {
        if (packet.kind === "begin") matches.push([packet.index, packet.end]);
        else if (packet.kind === "text") output.push(packet.text.length);
        else if (packet.kind === "end") return 269998;
        else {
          matches.push(...packet.values.map(({ index, end }) => [index, end]));
          return packet.values.at(-1).end;
        }
      });
      expect(completed).toBeTrue();
      expect(input).toEqual([262144, 7861]);
      expect(output).toEqual([65536, 65536, 65536, 65536, 7856]);
      expect(matches).toEqual([
        [0, 270000],
        [269998, 270000],
        [270001, 270005],
      ]);
    } finally {
      buffer.destroy();
    }
  });

  it("clips marker positions at the editor's CRLF boundary", async () => {
    const ColorExpression = require("../lib/color-expression");
    const ExpressionsRegistry = require("../lib/expressions-registry");
    const { scanBufferForColorsAsync } = require("../lib/buffer-scanner");
    const registry = new ExpressionsRegistry(ColorExpression);
    registry.createExpression("crlf-color", "red\\r", 0, ["css"], function () {
      this.rgba = [255, 0, 0, 1];
    });
    const buffer = new TextBuffer("red\r\nnext");
    try {
      const results = await scanBufferForColorsAsync(
        { getBuffer: () => buffer },
        { scanner, registry, scope: "css", bufferPath: "crlf.css", variables: [] },
      );
      expect(results[0].lastIndex).toBe(4);
      expect(results[0].bufferRange.serialize()).toEqual([
        [0, 0],
        [0, 3],
      ]);
    } finally {
      buffer.destroy();
      registry.dispose();
    }
  });
});
