const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GREEN = [0, 170, 85, 255];

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateIcon(size, outPath) {
  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  const center = (size - 1) / 2;
  const outerRadius = size * 0.48;
  const borderThickness = size * 0.08;
  const innerRadius = outerRadius - borderThickness;
  const crossThickness = size * 0.12;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const diag1 = Math.abs(y - x);
      const diag2 = Math.abs((size - 1 - y) - x);
      let draw = false;

      if (dist >= innerRadius && dist <= outerRadius) {
        draw = true;
      } else if ((diag1 <= crossThickness || diag2 <= crossThickness) && dist <= outerRadius) {
        draw = true;
      }

      const offset = rowOffset + 1 + x * 4;
      if (draw) {
        raw[offset] = GREEN[0];
        raw[offset + 1] = GREEN[1];
        raw[offset + 2] = GREEN[2];
        raw[offset + 3] = GREEN[3];
      } else {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 0;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(outPath, png);
}

(function main() {
  const sizes = [16, 32, 48, 96, 128];
  for (const size of sizes) {
    const outPath = path.join('images', `CB_icon_${size}.png`);
    generateIcon(size, outPath);
    console.log(`Generated ${outPath}`);
  }
})();
