import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
};
const glyph = ["11110", "10001", "10001", "11110", "10001", "10001", "11110"];
for (const size of [192, 512]) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const nx = x / size, ny = y / size;
    const glow = Math.max(0, 1 - Math.hypot(nx - 0.8, ny - 0.2));
    let color = [Math.round(7 + glow * 25), Math.round(11 + glow * 18), Math.round(28 + glow * 55), 255];
    const gx = Math.floor((nx - 0.3) / 0.08), gy = Math.floor((ny - 0.22) / 0.08);
    if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && glyph[gy][gx] === "1") color = [255, Math.round(205 - ny * 65), 52, 255];
    if (Math.abs(Math.hypot(nx - 0.5, ny - 0.5) - 0.405) < 0.006) color = [96, 101, 248, 255];
    for (let c = 0; c < 4; c++) pixels[offset + c] = color[c];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(`artifacts/bonusplay/public/icon-${size}.png`, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]));
}
