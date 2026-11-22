const { assertLength } = require("./analysis-budget");

const WINDOW_UNITS = 65536;

async function scanCandidates(text, source, exchange) {
  const regex = new RegExp(source, "g");
  let packet = [],
    units = 0;
  const resume = (next, first, end) => {
    if (!Number.isSafeInteger(next) || next <= first || next > end)
      throw new Error("Invalid color scan acknowledgement");
    regex.lastIndex = next;
  };
  const flush = async () => {
    const next = await exchange({ kind: "candidates", values: packet });
    resume(next, packet[0].index, packet.at(-1).end);
    packet = [];
    units = 0;
  };
  for (;;) {
    const match = regex.exec(text);
    if (!match) {
      if (!packet.length) break;
      await flush();
      continue;
    }
    if (!match[0].length) {
      regex.lastIndex = match.index + 1;
      continue;
    }
    const candidate = { index: match.index, end: regex.lastIndex, text: match[0] };
    if (packet.length && units + candidate.text.length > WINDOW_UNITS) {
      await flush();
      continue;
    }
    if (candidate.text.length > WINDOW_UNITS) {
      await exchange({ kind: "begin", index: candidate.index, end: candidate.end });
      for (let offset = 0; offset < candidate.text.length; offset += WINDOW_UNITS)
        await exchange({ kind: "text", text: candidate.text.slice(offset, offset + WINDOW_UNITS) });
      resume(await exchange({ kind: "end" }), candidate.index, candidate.end);
    } else {
      packet.push(candidate);
      units += candidate.text.length;
      if (packet.length === 128) await flush();
    }
  }
}

async function readSource(length, exchange) {
  const chunks = [];
  for (let offset = 0; offset < length;) {
    const size = Math.min(4 * WINDOW_UNITS, length - offset);
    const chunk = await exchange({ kind: "source", offset, size });
    if (typeof chunk !== "string" || chunk.length !== size)
      throw new Error("Invalid color scan source chunk");
    chunks.push(chunk);
    offset += chunk.length;
  }
  return chunks.join("");
}

module.exports = function ({ length, maximumAnalysisLength, source }) {
  const complete = this.async();
  let accept;
  const receive = ({ event, args } = {}) => {
    if (event !== "color-inline:candidate-reply" || !accept) return;
    const respond = accept;
    accept = null;
    respond(args[0]);
  };
  const exchange = (packet) =>
    new Promise((resolve) => {
      accept = resolve;
      global.emit("color-inline:candidate-packet", packet);
    });
  process.on("message", receive);
  const run = async () => {
    assertLength(length, maximumAnalysisLength);
    await scanCandidates(await readSource(length, exchange), source, exchange);
  };
  run().then(
    () => {
      process.removeListener("message", receive);
      complete({ done: true });
    },
    (error) => {
      process.removeListener("message", receive);
      complete({ error: error.message, code: error.code });
    },
  );
};
