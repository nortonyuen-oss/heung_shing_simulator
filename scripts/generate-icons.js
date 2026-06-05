const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');
const inputPath = path.join(rootDir, 'build', 'icon.png');
const outputPath = path.join(rootDir, 'build', 'icon.ico');
const sizes = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing icon source: ${inputPath}`);
  }

  const images = await Promise.all(sizes.map(async (size) => {
    const buffer = await sharp(inputPath)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();
    return { size, buffer };
  }));

  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + (images.length * entrySize);
  let imageOffset = directorySize;

  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entryOffset = headerSize + (index * entrySize);
    const iconSize = image.size === 256 ? 0 : image.size;

    header.writeUInt8(iconSize, entryOffset);
    header.writeUInt8(iconSize, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.buffer.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.buffer.length;
  });

  fs.writeFileSync(outputPath, Buffer.concat([header, ...images.map((image) => image.buffer)]));
  console.log(`Wrote ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
