#!/usr/bin/env node
'use strict';
// 《玩轉18區》 story art (Norton, 2026-11-20): his boards in UI/storyBoardGraphics stay the source
// (never shipped - package.json leaves them out); the game reads the WebP exports below.
//   18District/chapterNN*.png -> UI/campaign/chapters/chNN.webp   each chapter's opening cut-scene
//   Event/<name>.png          -> UI/campaign/events/<name>.webp   outros and events
//   NPC/<name>.png            -> UI/campaign/portraits/<id>.webp  speakers, a square bust (head and shoulders)
//
//   node scripts/prepare-campaign-story-images.js [boards folder]
// The boards folder defaults to UI/storyBoardGraphics here, else the main checkout's (a worktree).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');

const EVENTS = ['18DistrictCompleted', 'firework1', 'firework02', 'kowloonWalledCity', 'lightRail', 'singerBirthday', 'southIslandLine', 'tramway'];

// [speaker id, board, face centre x, y (shares of the board), crop size (share of its width)] - the
// crop sits a little below the face so the shoulders come in, for the dialogue's big square portrait
const PORTRAITS = [
  ['busFan', 'busFans', 0.43, 0.31, 0.64],
  ['chanHoNam', 'chanHoNam', 0.46, 0.31, 0.64],
  ['barber', 'cheungBao', 0.5, 0.29, 0.64],
  ['playboy', 'flirtingMan', 0.46, 0.27, 0.64],
  // (神童標 left the boards 2026-11-21: his new portrait is drawn square, scripts/source-art/campaign/portraits)
  ['foodie', 'hungryViviane', 0.44, 0.29, 0.64],
  ['bankGirl', 'iBankKongGirl', 0.5, 0.32, 0.64],
  ['singh', 'indianSingh', 0.44, 0.33, 0.64],
  ['jaydenMum', 'jadenMami', 0.46, 0.33, 0.64],
  ['goddess', 'ladyGod', 0.4, 0.3, 0.64],
  ['tycoon', 'liKaShing', 0.4, 0.32, 0.64],
  ['filmStar', 'louisKoo', 0.48, 0.3, 0.64],
  ['minibus', 'minivanDriver', 0.42, 0.31, 0.64],
  ['mkGirl', 'mkMui', 0.42, 0.29, 0.64],
  ['police', 'policeOfficer', 0.44, 0.33, 0.64],
  ['railFan', 'railFans', 0.44, 0.33, 0.64],
  ['scientist', 'scientist', 0.5, 0.33, 0.64],
  ['jayden', 'student', 0.44, 0.33, 0.64],
  ['uncleBus', 'uncleBus', 0.46, 0.33, 0.64],
  ['villager', 'uncleYuenlong', 0.44, 0.37, 0.64],
];

function boardsFolder() {
  const given = process.argv[2];
  if (given) return path.resolve(given);
  const here = path.join(root, 'UI/storyBoardGraphics');
  if (fs.existsSync(here)) return here;
  // a worktree under .claude/worktrees: the main checkout's boards
  const main = path.resolve(root, '..', '..', '..', 'UI/storyBoardGraphics');
  if (fs.existsSync(main)) return main;
  throw new Error('No UI/storyBoardGraphics folder: pass the boards folder');
}

(async () => {
  const boards = boardsFolder();
  const out = (rel) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); return file; };
  const chapters = fs.readdirSync(path.join(boards, '18District')).filter((name) => /^chapter\d\d.*\.png$/i.test(name));
  for (const name of chapters) {
    const id = `ch${name.slice(7, 9)}`;
    await sharp(path.join(boards, '18District', name)).resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 }).toFile(out(`UI/campaign/chapters/${id}.webp`));
  }
  for (const name of EVENTS) {
    await sharp(path.join(boards, 'Event', `${name}.png`)).resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 }).toFile(out(`UI/campaign/events/${name}.webp`));
  }
  for (const [id, board, cx, cy, share] of PORTRAITS) {
    const file = path.join(boards, 'NPC', `${board}.png`);
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(width * share);
    const left = Math.max(0, Math.min(width - size, Math.round(width * cx - size / 2)));
    const top = Math.max(0, Math.min(height - size, Math.round(height * (cy + 0.06) - size / 2)));
    await sharp(file).extract({ left, top, width: size, height: size }).resize(384, 384)
      .webp({ quality: 85, effort: 5 }).toFile(out(`UI/campaign/portraits/${id}.webp`));
  }
  console.log(`Prepared ${chapters.length} chapter scenes, ${EVENTS.length} event scenes and ${PORTRAITS.length} portraits from ${boards}.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
