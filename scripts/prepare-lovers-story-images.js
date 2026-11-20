#!/usr/bin/env node
'use strict';
// Keep the artist's source composition; export the existing forum's WebP + thumbnail format.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { LOVERS_STORY_DEFS } = require('../lovers-stories');
const root = path.resolve(__dirname, '..');
(async () => {
  fs.mkdirSync(path.join(root, 'UI/news/thumbs'), { recursive: true });
  for (const def of LOVERS_STORY_DEFS.filter((item) => item.source)) {
    const source = path.join(root, 'UI/storyBoardGraphics/lovers', def.source);
    await sharp(source).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 85, effort: 5 }).toFile(path.join(root, def.image));
    await sharp(source).rotate().resize(180, 125, { fit: 'cover' }).webp({ quality: 78, effort: 5 }).toFile(path.join(root, 'UI/news/thumbs', path.basename(def.image)));
  }
  console.log('Prepared 10 lovers story illustrations and thumbnails.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
