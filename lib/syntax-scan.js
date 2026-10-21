// Search the authoritative worker mirror. Handlers stay with their package in
// the renderer; acknowledgement supplies a shorter consumed span when needed.
exports.candidates = async (context, { source }, { signal, emit }) => {
  if (!source) return true;
  const text = context.getText();
  const regex = new RegExp(source, "g");
  let packet = [],
    units = 0;
  const flush = async () => {
    if (!packet.length) return;
    const first = packet[0].index,
      end = packet.at(-1).end;
    const next = await emit({ kind: "candidates", values: packet });
    signal.throwIfAborted();
    if (!Number.isSafeInteger(next) || next <= first || next > end)
      throw new Error("Invalid color scan acknowledgement");
    regex.lastIndex = next;
    packet = [];
    units = 0;
  };
  for (;;) {
    signal.throwIfAborted();
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
    if (packet.length && units + candidate.text.length > 65536) {
      await flush();
      continue;
    }
    if (candidate.text.length > 65536) {
      await emit({ kind: "begin", index: candidate.index, end: candidate.end });
      for (let offset = 0; offset < candidate.text.length; offset += 65536)
        await emit({ kind: "text", text: candidate.text.slice(offset, offset + 65536) });
      const next = await emit({ kind: "end" });
      if (!Number.isSafeInteger(next) || next <= candidate.index || next > candidate.end)
        throw new Error("Invalid color scan acknowledgement");
      regex.lastIndex = next;
    } else {
      packet.push(candidate);
      units += candidate.text.length;
      if (packet.length === 128) await flush();
    }
  }
  return true;
};
