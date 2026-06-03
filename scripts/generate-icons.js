// Generates 192x192 and 512x512 PNG icons for the PWA manifest.
// Solid indigo (#6366f1) background with a white "F" lettermark.
// Uses only Node.js built-ins (zlib + Buffer).

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

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
  const BG = [99, 102, 241];   // indigo-500
  const FG = [255, 255, 255];  // white

  // Write directly into the PNG raw buffer (filter byte + RGB per row) — single pass.
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLen); // zero-initialized: filter bytes already 0

  function setPixel(x, y, r, g, b) {
    const i = y * rowLen + 1 + x * 3;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
  }

  function fillRect(x, y, w, h, r, g, b) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x + dx, y + dy, r, g, b);
  }

  // Background
  fillRect(0, 0, size, size, ...BG);

  // "F" lettermark scaled to icon size
  const u  = Math.max(1, Math.round(size / 32));
  const lx = Math.round(size * 0.28);
  const ty = Math.round(size * 0.22);
  const lw = u * 3;
  const lh = Math.round(size * 0.56);
  const bw = Math.round(size * 0.32);

  fillRect(lx, ty, lw, lh, ...FG);                                      // vertical stroke
  fillRect(lx, ty, bw, lw, ...FG);                                      // top bar
  fillRect(lx, ty + Math.round(lh * 0.43), Math.round(bw * 0.8), lw, ...FG); // mid bar

  const compressed = zlib.deflateSync(raw, { level: 6 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
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
