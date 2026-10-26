const fs = require("node:fs/promises");
const { StringDecoder } = require("node:string_decoder");
const { assertLength, limit } = require("./analysis-budget");

// File size can race with reads and UTF-8 bytes are not UTF-16 code units.
// Bound both before I/O and while decoding; never allocate a complete Buffer.
module.exports = async function readAnalysisFile(filePath, maximum, signal) {
  maximum = limit(maximum);
  signal?.throwIfAborted();
  const file = await fs.open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    assertLength(Math.ceil(size / 3), maximum);
    const buffer = Buffer.allocUnsafe(65536);
    const decoder = new StringDecoder("utf8");
    const chunks = [];
    let length = 0;
    for (;;) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      const text = bytesRead ? decoder.write(buffer.subarray(0, bytesRead)) : decoder.end();
      length += text.length;
      assertLength(length, maximum);
      chunks.push(text);
      if (!bytesRead) return chunks.join("");
    }
  } finally {
    await file.close();
  }
};
