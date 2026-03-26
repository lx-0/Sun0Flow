/**
 * Pure-JS FLAC encoder — converts raw PCM WAV to uncompressed FLAC.
 *
 * Uses VERBATIM subframes (no compression) so the output is a valid
 * lossless FLAC file. Supports 16-bit and 24-bit, mono and stereo PCM.
 *
 * Spec references: https://xiph.org/flac/format.html
 */

const BLOCK_SIZE = 4096; // samples per FLAC audio frame

// ─── CRC helpers ──────────────────────────────────────────────────────────────

/** CRC-8 with polynomial 0x07 (used in FLAC frame headers). */
function crc8(data: Uint8Array, end: number): number {
  let crc = 0;
  for (let i = 0; i < end; i++) {
    crc ^= data[i];
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xFF : (crc << 1) & 0xFF;
    }
  }
  return crc;
}

/** CRC-16 with polynomial 0x8005 (used in FLAC frame footers). */
function crc16(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

// ─── UTF-8-like frame number encoding (FLAC spec §7.1) ────────────────────────

function encodeFrameNumber(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x800) return [0xC0 | (n >> 6), 0x80 | (n & 0x3F)];
  if (n < 0x10000) return [0xE0 | (n >> 12), 0x80 | ((n >> 6) & 0x3F), 0x80 | (n & 0x3F)];
  return [
    0xF0 | (n >> 18),
    0x80 | ((n >> 12) & 0x3F),
    0x80 | ((n >> 6) & 0x3F),
    0x80 | (n & 0x3F),
  ];
}

// ─── Bit writer (MSB-first, as FLAC requires) ─────────────────────────────────

class BitWriter {
  private buf: number[] = [];
  private partial = 0;
  private bitsUsed = 0;

  write(value: number, numBits: number): void {
    for (let i = numBits - 1; i >= 0; i--) {
      this.partial = (this.partial << 1) | ((value >>> i) & 1);
      if (++this.bitsUsed === 8) {
        this.buf.push(this.partial & 0xFF);
        this.partial = 0;
        this.bitsUsed = 0;
      }
    }
  }

  align(): void {
    if (this.bitsUsed > 0) {
      this.buf.push((this.partial << (8 - this.bitsUsed)) & 0xFF);
      this.partial = 0;
      this.bitsUsed = 0;
    }
  }

  get(): Uint8Array {
    this.align();
    return new Uint8Array(this.buf);
  }
}

// ─── METADATA_BLOCK_STREAMINFO ────────────────────────────────────────────────

function buildStreamInfo(
  sampleRate: number,
  channels: number,
  bps: number,
  totalSamples: number,
): Uint8Array {
  const bw = new BitWriter();
  bw.write(BLOCK_SIZE, 16); // min block size
  bw.write(BLOCK_SIZE, 16); // max block size
  bw.write(0, 24); // min frame size (unknown = 0)
  bw.write(0, 24); // max frame size (unknown = 0)
  bw.write(sampleRate, 20);
  bw.write(channels - 1, 3);
  bw.write(bps - 1, 5);
  // 36-bit total samples (split for JS 32-bit integer limits)
  bw.write(Math.floor(totalSamples / 0x100000000) & 0xF, 4);
  bw.write(totalSamples >>> 0, 32);
  // MD5 signature — zero means "not computed"
  for (let i = 0; i < 16; i++) bw.write(0, 8);
  return bw.get(); // 34 bytes
}

// ─── Audio frame encoder ──────────────────────────────────────────────────────

function encodeFrame(
  frameNum: number,
  channels: number,
  bps: number,
  pcm: Int32Array,  // interleaved samples (all channels)
  frameStart: number,
  frameLen: number,
): Uint8Array {
  const frameNumBytes = encodeFrameNumber(frameNum);

  // Block-size code + optional extra bytes after coded number
  let bsCode: number;
  let bsExtra: number[];
  if (frameLen === 4096) { bsCode = 0xC; bsExtra = []; }
  else if (frameLen === 2048) { bsCode = 0xB; bsExtra = []; }
  else if (frameLen === 1024) { bsCode = 0xA; bsExtra = []; }
  else if (frameLen === 512) { bsCode = 0x9; bsExtra = []; }
  else if (frameLen === 256) { bsCode = 0x8; bsExtra = []; }
  else if (frameLen <= 256) { bsCode = 0x6; bsExtra = [frameLen - 1]; }
  else { bsCode = 0x7; bsExtra = [(frameLen - 1) >> 8, (frameLen - 1) & 0xFF]; }

  // Bits-per-sample code (0 = from STREAMINFO, explicit codes for known sizes)
  const bpsCode = bps === 8 ? 1 : bps === 16 ? 4 : bps === 24 ? 6 : 0;

  // ── Frame header (everything before CRC-8) ──
  const hdrLen = 4 + frameNumBytes.length + bsExtra.length;
  const hdrBuf = new Uint8Array(hdrLen + 1); // +1 for CRC-8

  hdrBuf[0] = 0xFF; // sync bits [13:6]
  hdrBuf[1] = 0xF8; // sync bits [5:0]=0b111110, reserved=0, blocking_strategy=0 (fixed)
  hdrBuf[2] = (bsCode << 4) | 0x0; // block_size_code | sample_rate=0 (from STREAMINFO)
  // channel_assignment (4 bits) | bps_code (3 bits) | reserved (1 bit)
  hdrBuf[3] = ((channels - 1) << 4) | (bpsCode << 1) | 0;

  for (let i = 0; i < frameNumBytes.length; i++) hdrBuf[4 + i] = frameNumBytes[i];
  for (let i = 0; i < bsExtra.length; i++) hdrBuf[4 + frameNumBytes.length + i] = bsExtra[i];
  hdrBuf[hdrLen] = crc8(hdrBuf, hdrLen);

  // ── Subframes — one VERBATIM subframe per channel, all bit-packed together ──
  const sfBw = new BitWriter();
  for (let ch = 0; ch < channels; ch++) {
    sfBw.write(0, 1);       // zero padding (MSB must be 0)
    sfBw.write(0b000001, 6); // subframe type = VERBATIM
    sfBw.write(0, 1);       // wasted bits flag = 0

    for (let s = 0; s < frameLen; s++) {
      const sample = pcm[(frameStart + s) * channels + ch];
      // Write as bps-bit 2's complement (handle negative via unsigned wrap)
      const unsigned = sample < 0 ? sample + (1 << bps) : sample;
      sfBw.write(unsigned, bps);
    }
  }
  sfBw.align(); // byte-align after all channels
  const sfBytes = sfBw.get();

  // ── Combine header + subframes, then append CRC-16 ──
  const bodyLen = hdrBuf.length + sfBytes.length;
  const body = new Uint8Array(bodyLen);
  body.set(hdrBuf, 0);
  body.set(sfBytes, hdrBuf.length);

  const fcrc = crc16(body);
  const result = new Uint8Array(bodyLen + 2);
  result.set(body, 0);
  result[bodyLen] = fcrc >> 8;
  result[bodyLen + 1] = fcrc & 0xFF;
  return result;
}

// ─── WAV parser ───────────────────────────────────────────────────────────────

interface WavInfo {
  sampleRate: number;
  channels: number;
  bps: number;
  totalSamples: number;
  pcm: Int32Array; // interleaved signed integers
}

function parseWav(data: Uint8Array): WavInfo | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // RIFF WAVE header
  if (
    data.length < 12 ||
    view.getUint32(0, false) !== 0x52494646 || // "RIFF"
    view.getUint32(8, false) !== 0x57415645    // "WAVE"
  ) return null;

  let offset = 12;
  let sampleRate = 0, channels = 0, bps = 0;
  let pcmOffset = 0, pcmSize = 0;

  while (offset + 8 <= data.length) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 0x666D7420) { // "fmt "
      if (view.getUint16(offset + 8, true) !== 1) return null; // must be PCM
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bps = view.getUint16(offset + 22, true);
    } else if (chunkId === 0x64617461) { // "data"
      pcmOffset = offset + 8;
      pcmSize = Math.min(chunkSize, data.length - pcmOffset);
    }

    offset += 8 + chunkSize + (chunkSize & 1); // RIFF chunks must be word-aligned
    if (sampleRate && pcmOffset) break;
  }

  if (!sampleRate || !pcmOffset || (bps !== 16 && bps !== 24)) return null;

  const bytesPerFrame = channels * (bps / 8);
  const totalSamples = Math.floor(pcmSize / bytesPerFrame);

  const pcm = new Int32Array(totalSamples * channels);
  const bytesPerSample = bps / 8;

  for (let i = 0; i < totalSamples * channels; i++) {
    const pos = pcmOffset + i * bytesPerSample;
    if (bps === 16) {
      pcm[i] = view.getInt16(pos, true);
    } else {
      // 24-bit little-endian signed
      const b0 = data[pos], b1 = data[pos + 1], b2 = data[pos + 2];
      let s = b0 | (b1 << 8) | (b2 << 16);
      if (s & 0x800000) s = (s | 0xFF000000) | 0; // sign-extend to 32 bits
      pcm[i] = s;
    }
  }

  return { sampleRate, channels, bps, totalSamples, pcm };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a PCM WAV buffer to an uncompressed FLAC buffer.
 *
 * Returns `null` if the input is not a supported PCM WAV file
 * (only 16-bit and 24-bit PCM, 1–2 channels are supported).
 */
export function wavToFlac(wavBytes: Uint8Array): Uint8Array | null {
  const info = parseWav(wavBytes);
  if (!info) return null;

  const { sampleRate, channels, bps, totalSamples, pcm } = info;

  const parts: Uint8Array[] = [];

  // fLaC stream marker
  parts.push(new Uint8Array([0x66, 0x4C, 0x61, 0x43]));

  // METADATA_BLOCK_HEADER for STREAMINFO:
  //   is_last=1, type=0 (STREAMINFO), length=34 (0x22)
  parts.push(new Uint8Array([0x80, 0x00, 0x00, 0x22]));
  parts.push(buildStreamInfo(sampleRate, channels, bps, totalSamples));

  // Audio frames
  const numFrames = Math.ceil(totalSamples / BLOCK_SIZE);
  for (let f = 0; f < numFrames; f++) {
    const frameStart = f * BLOCK_SIZE;
    const frameLen = Math.min(BLOCK_SIZE, totalSamples - frameStart);
    parts.push(encodeFrame(f, channels, bps, pcm, frameStart, frameLen));
  }

  // Concatenate all parts
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}
