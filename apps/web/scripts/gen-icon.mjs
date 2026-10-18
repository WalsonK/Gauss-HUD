// Generates public/icon-192.png: an original gauge glyph (arc + needle), drawn pixel by pixel so
// the repository needs no image tooling and ships no third-party artwork.
// Meta Ray-Ban Display wants a PNG favicon of at least 52×52 (SVG is not supported).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 192;
const SAMPLES = 4; // supersampling per axis, for smooth edges
const COLOR = [235, 245, 255];

const cx = SIZE / 2;
const cy = SIZE * 0.58;
const radius = SIZE * 0.36;
const ringWidth = SIZE * 0.07;
// The arc spans 240°, open at the bottom.
const ARC_START = (150 * Math.PI) / 180;
const ARC_SPAN = (240 * Math.PI) / 180;
const needleAngle = ARC_START + ARC_SPAN * 0.7;
const needleWidth = SIZE * 0.035;

function inArc(x, y) {
  const d = Math.hypot(x - cx, y - cy);
  if (Math.abs(d - radius) > ringWidth / 2) return false;
  let a = Math.atan2(y - cy, x - cx) - ARC_START;
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return a <= ARC_SPAN;
}

function inNeedle(x, y) {
  const ux = Math.cos(needleAngle);
  const uy = Math.sin(needleAngle);
  const along = (x - cx) * ux + (y - cy) * uy;
  const across = Math.abs(-(x - cx) * uy + (y - cy) * ux);
  return (
    (along >= 0 && along <= radius * 0.8 && across <= needleWidth / 2) || Math.hypot(x - cx, y - cy) <= SIZE * 0.05
  );
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 4 + 1);
  raw[row] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    let hits = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const px = x + (sx + 0.5) / SAMPLES;
        const py = y + (sy + 0.5) / SAMPLES;
        if (inArc(px, py) || inNeedle(px, py)) hits++;
      }
    }
    const i = row + 1 + x * 4;
    raw[i] = COLOR[0];
    raw[i + 1] = COLOR[1];
    raw[i + 2] = COLOR[2];
    raw[i + 3] = Math.round((255 * hits) / (SAMPLES * SAMPLES));
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = new URL('../public/icon-192.png', import.meta.url);
writeFileSync(out, png);
console.log(`Wrote ${out.pathname} (${png.length} bytes)`);
