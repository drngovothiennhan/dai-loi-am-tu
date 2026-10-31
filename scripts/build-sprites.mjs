// Builds character sprite atlases from the artwork in asset-sources/.
//
// The source sheets are concept sheets, not grid atlases: the artwork already has an alpha channel,
// but the poses sit at different scales and are not aligned to a grid. So we find each figure by
// connected components on alpha, then scale every pose to a height we choose per pose (relative to a
// standing character) and anchor it bottom-centre in a fixed cell. That keeps the characters a
// consistent size in the 3D scene no matter which sheet a pose came from.
//
// Run: node scripts/build-sprites.mjs [--check]

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = {
  main: path.join(ROOT, "asset-sources/characters-main.png"),
  poses: path.join(ROOT, "asset-sources/characters-poses.png"),
  decor: path.join(ROOT, "asset-sources/decor.png"),
};
const OUT_DIR = path.join(ROOT, "public/sprites");
const DECOR_DIR = path.join(ROOT, "public/decor");
const CELL = 256;
const STAND = 210; // pixel height of a standing character inside a cell

// Height of each pose relative to a standing character.
const POSE_SCALE = {
  idle: 1, walk1: 1, walk2: 1, pray: 1, dance: 1.05,
  sit: 0.66, kneel: 0.72, prostrate: 0.44,
};

// Frame picks. index = connected component in reading order (see --check output).
// crop = optional sub-box in fractions of the component, used where two figures touch.
const CHARACTERS = {
  "chu-tieu": {
    label: "Chú tiểu",
    frames: {
      idle: { sheet: "main", index: 0 },
      walk1: { sheet: "main", index: 6 },
      walk2: { sheet: "main", index: 11 },
      pray: { sheet: "poses", index: 19 },
      sit: { sheet: "main", index: 14 },
      kneel: { sheet: "poses", index: 62 },
      prostrate: { sheet: "poses", index: 64 },
      dance: { sheet: "poses", index: 66 },
    },
  },
  "phat-tu": {
    label: "Phật tử",
    frames: {
      idle: { sheet: "main", index: 40 },
      walk1: { sheet: "main", index: 48 },
      walk2: { sheet: "main", index: 49 },
      pray: { sheet: "main", index: 46 },
      sit: { sheet: "poses", index: 104 },
      // No kneel or prostrate frame for this character. Both exist on the sheet only as figures
      // stacked against a neighbour, 26px and 41px tall once separated, which upscale to mush.
      // The bow therefore holds the pray pose; a proper "Lạy" drawing would fix this.
      dance: { sheet: "poses", index: 102 },
    },
  },
};

const ALL_POSES = ["idle", "walk1", "walk2", "pray", "sit", "kneel", "prostrate", "dance"];

// Scenery cut from the decoration artwork. height is how tall the object stands in the 3D scene,
// in world units; the width follows from the picture's own proportions.
const DECOR = {
  buddha: { index: 25, height: 7.2, maxWidth: 900 },
  dragon: { index: 39, height: 7.5, maxWidth: 520 },
  lantern: { index: 49, height: 1.9, maxWidth: 320 },
  burner: { index: 48, height: 1.7, maxWidth: 320 },
  lotus: { index: 43, height: 0.85, maxWidth: 256 },
  tree: { index: 52, height: 8.5, maxWidth: 900 },
  "stone-lantern": { index: 58, height: 2.2, maxWidth: 256 },
};

async function components(file, min = { area: 1800, w: 25, h: 22 }) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const seen = new Uint8Array(W * H);
  const labels = new Int32Array(W * H).fill(-1);
  const stack = new Int32Array(W * H);
  const found = [];
  let labelId = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const start = y * W + x;
      if (seen[start] || data[start * 4 + 3] <= 128) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      while (sp > 0) {
        const cur = stack[--sp];
        const cx = cur % W, cy = (cur / W) | 0;
        labels[cur] = labelId;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx;
            if (!seen[ni] && data[ni * 4 + 3] > 128) { seen[ni] = 1; stack[sp++] = ni; }
          }
        }
      }
      if (area > min.area && maxX - minX > min.w && maxY - minY > min.h) {
        found.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, id: labelId });
      }
      labelId++;
    }
  }
  // Reading order: group into rows, then left to right.
  found.sort((a, b) => a.y - b.y);
  const rows = [];
  let row = [];
  for (const c of found) {
    if (!row.length) { row.push(c); continue; }
    if (c.y < row[0].y + row[0].h * 0.6) row.push(c);
    else { rows.push(row); row = [c]; }
  }
  if (row.length) rows.push(row);
  rows.forEach((r) => r.sort((a, b) => a.x - b.x));
  return { boxes: rows.flat(), labels, width: W, height: H };
}

// Keep only the pixels of this one figure. The bounding box of a pose often overlaps a neighbouring
// figure on these sheets, and cropping the rectangle alone drags that neighbour's pixels in.
async function cutFigure(file, sheet, box, region) {
  const mask = Buffer.alloc(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const sx = region.left + x, sy = region.top + y;
      const inside = sx >= 0 && sy >= 0 && sx < sheet.width && sy < sheet.height
        && sheet.labels[sy * sheet.width + sx] === box.id;
      mask[y * region.width + x] = inside ? 255 : 0;
    }
  }
  const maskPng = await sharp(mask, { raw: { width: region.width, height: region.height, channels: 1 } })
    .png().toBuffer();
  return sharp(file).extract(region)
    .composite([{ input: maskPng, blend: "dest-in" }])
    .png().toBuffer();
}

async function main() {
  const check = process.argv.includes("--check");
  for (const file of Object.values(SRC)) {
    if (!fs.existsSync(file)) throw new Error(`missing source artwork: ${file}`);
  }
  const sheets = {};
  // The decoration sheet is detected with a coarser threshold than the character sheets, so small
  // flecks of artwork do not shift the component numbering the DECOR table refers to.
  const MIN = { decor: { area: 4000, w: 30, h: 30 } };
  for (const [name, file] of Object.entries(SRC)) sheets[name] = await components(file, MIN[name]);

  const manifest = { cell: CELL, characters: {}, decor: {} };
  for (const [id, cfg] of Object.entries(CHARACTERS)) {
    const poses = ALL_POSES.filter((p) => cfg.frames[p]);
    const layers = [];
    const index = {};
    for (let i = 0; i < poses.length; i++) {
      const pose = poses[i];
      index[pose] = i;
      const pick = cfg.frames[pose];
      const sheet = sheets[pick.sheet];
      const box = sheet.boxes[pick.index];
      if (!box) throw new Error(`${id}.${pose}: no component ${pick.index} in ${pick.sheet}`);
      let region = { left: box.x, top: box.y, width: box.w, height: box.h };
      if (pick.crop) {
        region = {
          left: box.x + Math.round((pick.crop.left ?? 0) * box.w),
          top: box.y + Math.round((pick.crop.top ?? 0) * box.h),
          width: Math.round((pick.crop.width ?? 1) * box.w),
          height: Math.round((pick.crop.height ?? 1) * box.h),
        };
      }
      // Trim leftover transparent margin so the pose scale is measured from the figure itself.
      const cut = await cutFigure(SRC[pick.sheet], sheet, box, region);
      const trimmed = await sharp(cut).trim({ threshold: 1 }).png().toBuffer();
      const meta = await sharp(trimmed).metadata();
      const targetH = Math.round(STAND * (POSE_SCALE[pose] ?? 1));
      const scale = targetH / meta.height;
      const w = Math.max(1, Math.round(meta.width * scale));
      const h = Math.max(1, Math.round(meta.height * scale));
      if (w > CELL || h > CELL) throw new Error(`${id}.${pose}: ${w}x${h} does not fit cell ${CELL}`);
      const resized = await sharp(trimmed).resize(w, h, { fit: "fill" }).png().toBuffer();
      layers.push({
        input: resized,
        left: i * CELL + Math.round((CELL - w) / 2),
        top: CELL - h, // bottom-centre anchor, so every pose stands on the same ground line
      });
    }
    const outFile = path.join(OUT_DIR, `${id}.webp`);
    const buf = await sharp({
      create: { width: CELL * poses.length, height: CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite(layers).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
    if (check) {
      const old = fs.existsSync(outFile) ? fs.readFileSync(outFile) : null;
      if (!old || !old.equals(buf)) throw new Error(`${outFile} is out of date; run node scripts/build-sprites.mjs`);
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(outFile, buf);
    }
    manifest.characters[id] = { label: cfg.label, file: `sprites/${id}.webp`, frames: poses.length, poses: index };
    console.log(`${check ? "checked" : "wrote"} ${path.relative(ROOT, outFile)} (${Math.round(buf.length / 1024)} KB)`);
  }
  // Scenery
  manifest.decor = {};
  for (const [name, cfg] of Object.entries(DECOR)) {
    const sheet = sheets.decor;
    const box = sheet.boxes[cfg.index];
    if (!box) throw new Error(`decor ${name}: no component ${cfg.index}`);
    const region = { left: box.x, top: box.y, width: box.w, height: box.h };
    const cut = await cutFigure(SRC.decor, sheet, box, region);
    const trimmed = await sharp(cut).trim({ threshold: 1 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const scale = Math.min(1, cfg.maxWidth / meta.width);
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));
    const buf = await sharp(trimmed).resize(w, h, { fit: "fill" }).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
    const outFile = path.join(DECOR_DIR, `${name}.webp`);
    if (check) {
      const old = fs.existsSync(outFile) ? fs.readFileSync(outFile) : null;
      if (!old || !old.equals(buf)) throw new Error(`${outFile} is out of date; run node scripts/build-sprites.mjs`);
    } else {
      fs.mkdirSync(DECOR_DIR, { recursive: true });
      fs.writeFileSync(outFile, buf);
    }
    manifest.decor[name] = { file: `decor/${name}.webp`, height: cfg.height, aspect: Number((w / h).toFixed(4)) };
    console.log(`${check ? "checked" : "wrote"} public/decor/${name}.webp (${Math.round(buf.length / 1024)} KB, ${w}x${h})`);
  }

  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const json = JSON.stringify(manifest, null, 2) + "\n";
  // The app reads the manifest from a generated module, so the page needs no extra request for it.
  const tsPath = path.join(ROOT, "lib/sprite-manifest.ts");
  const ts = `// Generated by scripts/build-sprites.mjs. Do not edit by hand.\n`
    + `export const SPRITE_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n\n`
    + `export type CharacterId = keyof typeof SPRITE_MANIFEST.characters;
export type DecorId = keyof typeof SPRITE_MANIFEST.decor;\n`
    + `export const CHARACTER_IDS = Object.keys(SPRITE_MANIFEST.characters) as CharacterId[];\n`;
  if (check) {
    if (fs.readFileSync(manifestPath, "utf8") !== json) throw new Error("manifest.json is out of date");
    if (fs.readFileSync(tsPath, "utf8") !== ts) throw new Error("lib/sprite-manifest.ts is out of date");
  } else {
    fs.writeFileSync(manifestPath, json);
    fs.writeFileSync(tsPath, ts);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
