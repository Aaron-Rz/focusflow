// Generates 192x192 and 512x512 PNG icons for the PWA manifest.
// Solid indigo (#6366f1) background with a white "F" lettermark.
// Uses only Node.js built-ins (zlib + Buffer).

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, payload, crc]);
}

function generatePNG(size) {
  // Colors
  const BG  = [99, 102, 241];  // indigo-500
  const FG  = [255, 255, 255]; // white

  // Draw pixels for the "F" lettermark (scaled relative to size)
  // We'll draw a simple bold "F" using filled rectangles
  const pixels = new Uint8Array(size * size * 3).fill(0);
  const s = size;

  function setPixel(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= s || y >= s) return;
    const i = (y * s + x) * 3;
    pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b;
  }

  function fillRect(x, y, w, h, r, g, b) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, r, g, b);
  }

  // Fill background
  fillRect(0, 0, s, s, ...BG);

  // Scale the "F" lettermark proportionally
  const u = Math.max(1, Math.round(s / 32)); // unit = 1/32 of icon size
  const lx = Math.round(s * 0.28);          // left edge of letter
  const ty = Math.round(s * 0.22);          // top edge
  const lw = u * 3;                          // stroke width
  const lh = Math.round(s * 0.56);          // letter height
  const bw = Math.round(s * 0.32);          // bar width

  // Vertical stroke
  fillRect(lx, ty, lw, lh, ...FG);
  // Top horizontal bar
  fillRect(lx, ty, bw, lw, ...FG);
  // Mid horizontal bar (at ~45% of height)
  const midY = ty + Math.round(lh * 0.43);
  fillRect(lx, midY, Math.round(bw * 0.8), lw, ...FG);

  // Build PNG raw data (filter byte 0 per row, then RGB pixels)
  const rowLen = 1 + s * 3;
  const raw = Buffer.alloc(s * rowLen);
  for (let y = 0; y < s; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < s; x++) {
      const src = (y * s + x) * 3;
      const dst = y * rowLen + 1 + x * 3;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const buf = generatePNG(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}
