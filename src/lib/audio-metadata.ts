/**
 * Pure-JS audio metadata embedding utilities.
 *
 * - `embedId3Tags`   – prepend ID3v2.3 tags to an MP3 buffer
 * - `embedWavMetadata` – append a RIFF LIST INFO chunk to a WAV buffer
 *
 * No native dependencies; works in Node.js ≥ 18 (TextEncoder available).
 */

export interface SongMetadata {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  year?: number | null;
  genre?: string | null;
  /** Stored in the COMM (comment) tag — used for the generation prompt. */
  comment?: string | null;
  /**
   * Album art as a raw binary buffer plus its MIME type.
   * Only JPEG and PNG are reliably supported by players.
   */
  coverArt?: { data: Uint8Array; mimeType: string } | null;
}

// ---------------------------------------------------------------------------
// ID3v2.3 for MP3
// ---------------------------------------------------------------------------

/**
 * Encode a JavaScript number as a 4-byte ID3 syncsafe integer (big-endian).
 * Each byte uses only 7 bits (MSB is always 0).
 */
function toSyncsafe(n: number): [number, number, number, number] {
  return [
    (n >>> 21) & 0x7f,
    (n >>> 14) & 0x7f,
    (n >>> 7) & 0x7f,
    n & 0x7f,
  ];
}

/**
 * Build a single ID3v2.3 text frame (TIT2, TPE1, TALB, TYER, TCON, …).
 * Uses UTF-8 encoding byte (0x03), which ID3v2.3 players handle fine in practice.
 */
function id3TextFrame(id: string, text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  // Frame layout: id(4) + size(4 big-endian) + flags(2) + encoding(1) + text
  const frameData = new Uint8Array(10 + 1 + textBytes.length);
  const view = new DataView(frameData.buffer);

  // Frame ID (4 ASCII bytes)
  for (let i = 0; i < 4; i++) frameData[i] = id.charCodeAt(i);

  // Frame size = encoding byte (1) + text data — regular big-endian in v2.3
  view.setUint32(4, 1 + textBytes.length, false);

  // Flags: 0x00 0x00 (no compression, no encryption)
  // frameData[8] and [9] remain 0

  // Encoding: 0x03 = UTF-8
  frameData[10] = 0x03;

  frameData.set(textBytes, 11);
  return frameData;
}

/**
 * Build an ID3v2.3 COMM frame (comment).
 * Layout: id(4) + size(4) + flags(2) + encoding(1) + lang(3) + desc(1 null) + text
 */
function id3CommFrame(text: string): Uint8Array {
  // Truncate very long prompts — some tag editors have limits
  const truncated = text.slice(0, 1000);
  const textBytes = new TextEncoder().encode(truncated);
  // encoding(1) + lang(3) + null desc(1) + text
  const bodyLen = 1 + 3 + 1 + textBytes.length;
  const frame = new Uint8Array(10 + bodyLen);
  const view = new DataView(frame.buffer);

  // "COMM"
  [0x43, 0x4f, 0x4d, 0x4d].forEach((b, i) => (frame[i] = b));
  view.setUint32(4, bodyLen, false);
  // flags = 0x0000

  // Body
  frame[10] = 0x03; // UTF-8
  frame[11] = 0x65; // 'e'
  frame[12] = 0x6e; // 'n'
  frame[13] = 0x67; // 'g'
  frame[14] = 0x00; // empty short description (null-terminated)
  frame.set(textBytes, 15);
  return frame;
}

/**
 * Build an ID3v2.3 APIC frame (Attached Picture) for album art.
 * Layout: id(4) + size(4) + flags(2) + encoding(1) + mimeType(n) + null(1) +
 *         picType(1) + description(1) + imageData(n)
 */
function id3ApicFrame(imageData: Uint8Array, mimeType: string): Uint8Array {
  const mimeBytes = new TextEncoder().encode(mimeType);
  // encoding(1) + mime(n) + null(1) + picType(1) + desc-null(1) + data(n)
  const bodyLen = 1 + mimeBytes.length + 1 + 1 + 1 + imageData.length;
  const frame = new Uint8Array(10 + bodyLen);
  const view = new DataView(frame.buffer);

  // "APIC"
  [0x41, 0x50, 0x49, 0x43].forEach((b, i) => (frame[i] = b));
  view.setUint32(4, bodyLen, false);
  // flags = 0x0000

  let off = 10;
  frame[off++] = 0x00; // encoding: ISO-8859-1 (safe for binary data)
  frame.set(mimeBytes, off);
  off += mimeBytes.length;
  frame[off++] = 0x00; // null-terminate MIME
  frame[off++] = 0x03; // picture type: 0x03 = Cover (front)
  frame[off++] = 0x00; // empty description (null-terminated)
  frame.set(imageData, off);
  return frame;
}

/**
 * Prepend ID3v2.3 tags to an MP3 audio buffer.
 * Returns the original buffer unchanged if no metadata is provided.
 */
export function embedId3Tags(audioData: Uint8Array, meta: SongMetadata): Uint8Array {
  const frames: Uint8Array[] = [];

  if (meta.title) frames.push(id3TextFrame("TIT2", meta.title));
  if (meta.artist) frames.push(id3TextFrame("TPE1", meta.artist));
  if (meta.album) frames.push(id3TextFrame("TALB", meta.album));
  if (meta.year) frames.push(id3TextFrame("TYER", String(meta.year)));
  if (meta.genre) frames.push(id3TextFrame("TCON", meta.genre));
  if (meta.comment) frames.push(id3CommFrame(meta.comment));
  if (meta.coverArt) frames.push(id3ApicFrame(meta.coverArt.data, meta.coverArt.mimeType));

  if (frames.length === 0) return audioData;

  const framesSize = frames.reduce((s, f) => s + f.length, 0);

  // ID3 header: "ID3" + version(3,0) + flags(0) + syncsafe size(4)
  const header = new Uint8Array(10);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 0x03; // major version 2.3
  header[4] = 0x00; // revision
  header[5] = 0x00; // flags

  const [s0, s1, s2, s3] = toSyncsafe(framesSize);
  header[6] = s0;
  header[7] = s1;
  header[8] = s2;
  header[9] = s3;

  const result = new Uint8Array(10 + framesSize + audioData.length);
  result.set(header, 0);
  let offset = 10;
  for (const frame of frames) {
    result.set(frame, offset);
    offset += frame.length;
  }
  result.set(audioData, offset);
  return result;
}

// ---------------------------------------------------------------------------
// RIFF LIST INFO for WAV
// ---------------------------------------------------------------------------

/**
 * Build a RIFF INFO sub-chunk: fourcc(4) + ckSize(4 LE) + data + optional pad.
 * The data is the null-terminated UTF-8 text; pad byte added if data length is odd.
 */
function riffInfoSubChunk(fourcc: string, text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text + "\0"); // null-terminate
  const dataSize = encoded.length;
  const padded = dataSize % 2 !== 0; // RIFF chunks align to 2-byte boundary
  const buf = new Uint8Array(4 + 4 + dataSize + (padded ? 1 : 0));
  for (let i = 0; i < 4; i++) buf[i] = fourcc.charCodeAt(i);
  new DataView(buf.buffer).setUint32(4, dataSize, true); // size does NOT include pad
  buf.set(encoded, 8);
  return buf;
}

/**
 * Append a RIFF LIST INFO chunk to a WAV buffer and update the RIFF header size.
 * Returns the original buffer unchanged if no metadata is provided or if the
 * buffer does not look like a valid RIFF/WAVE file.
 */
export function embedWavMetadata(audioData: Uint8Array, meta: SongMetadata): Uint8Array {
  const subChunks: Uint8Array[] = [];

  if (meta.title) subChunks.push(riffInfoSubChunk("INAM", meta.title));
  if (meta.artist) subChunks.push(riffInfoSubChunk("IART", meta.artist));
  if (meta.genre) subChunks.push(riffInfoSubChunk("IGNR", meta.genre));
  if (meta.comment) subChunks.push(riffInfoSubChunk("ICMT", meta.comment.slice(0, 500)));
  if (meta.year) subChunks.push(riffInfoSubChunk("ICRD", String(meta.year)));

  if (subChunks.length === 0) return audioData;

  // Verify RIFF/WAVE header before modifying
  if (
    audioData.length < 12 ||
    audioData[0] !== 0x52 || audioData[1] !== 0x49 || // 'R','I'
    audioData[2] !== 0x46 || audioData[3] !== 0x46 || // 'F','F'
    audioData[8] !== 0x57 || audioData[9] !== 0x41 || // 'W','A'
    audioData[10] !== 0x56 || audioData[11] !== 0x45   // 'V','E'
  ) {
    // Not a RIFF/WAVE file — return as-is
    return audioData;
  }

  const subChunksTotal = subChunks.reduce((s, c) => s + c.length, 0);
  // LIST chunk: "LIST"(4) + ckSize(4) + "INFO"(4) + sub-chunks
  const listDataSize = 4 + subChunksTotal; // "INFO" + sub-chunks
  const listPadding = listDataSize % 2 !== 0 ? 1 : 0;
  const listChunk = new Uint8Array(8 + listDataSize + listPadding);
  const listView = new DataView(listChunk.buffer);

  // "LIST"
  [0x4c, 0x49, 0x53, 0x54].forEach((b, i) => (listChunk[i] = b));
  // ckSize (does NOT include its own 8-byte header or trailing pad)
  listView.setUint32(4, listDataSize, true);
  // "INFO"
  [0x49, 0x4e, 0x46, 0x4f].forEach((b, i) => (listChunk[8 + i] = b));

  let off = 12;
  for (const sub of subChunks) {
    listChunk.set(sub, off);
    off += sub.length;
  }

  // Combine original + LIST chunk
  const result = new Uint8Array(audioData.length + listChunk.length);
  result.set(audioData, 0);
  result.set(listChunk, audioData.length);

  // Update RIFF ckSize (bytes 4–7 LE) = total file size - 8
  new DataView(result.buffer).setUint32(4, result.length - 8, true);

  return result;
}

// ---------------------------------------------------------------------------
// File size estimation helpers
// ---------------------------------------------------------------------------

/**
 * Rough file size estimate in bytes for a given duration and format.
 * MP3 @ ~192 kbps, WAV @ 44100 Hz / 16-bit / stereo.
 */
export function estimateAudioBytes(durationSeconds: number, format: "mp3" | "wav"): number {
  if (format === "wav") {
    return Math.round(durationSeconds * 176_400); // 44100 * 2ch * 2bytes
  }
  return Math.round(durationSeconds * 24_000); // ~192 kbps
}

/** Format bytes as a human-readable string (e.g. "3.2 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
