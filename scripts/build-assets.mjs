// Builds every runtime image for the scene and writes lib/sprite-manifest.ts.
//
// Characters: taken as-is from the v3 production atlas (asset-sources/v3/). The atlas already has
// transparent frames, exact rectangles and a per-animation manifest, so this script only maps the
// poses the game uses onto those frames and checks the rectangles against the atlas.
//
// Scenery: the decoration sheet (asset-sources/decor.png) is an opaque concept sheet, so each object
// is found by connected components on alpha, masked to its own pixels, and trimmed.
//
// Run: node scripts/build-assets.mjs [--check]

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const V3 = path.join(ROOT, "asset-sources/v3");
const DECOR_SRC = path.join(ROOT, "asset-sources/decor.png");
const CHAR_DIR = path.join(ROOT, "public/characters");
const DECOR_DIR = path.join(ROOT, "public/decor");
const MANIFEST_TS = path.join(ROOT, "lib/sprite-manifest.ts");

// Pose -> frame in the v3 atlas. Indices come from animation.json; the choices below are the ones
// verified on the contact sheet. Missing poses fall back to idle in the scene.
//   chu_tieu_16 is not a monk (it shows a dark-haired figure), so it is never used.
const POSE_FRAMES = {
  idle: 0,
  walk1: 1,
  walk2: 3,
  sit: 7,
  kneel: 11,
  prostrate: 15,
};

// Scenery cut from the decoration sheet. height is the object's height in the 3D scene.
const DECOR = {
  buddha: { index: 25, height: 7.2, maxWidth: 900 },
  dragon: { index: 39, height: 7.5, maxWidth: 520 },
  lantern: { index: 49, height: 1.9, maxWidth: 320 },
  burner: { index: 48, height: 1.7, maxWidth: 320 },
  lotus: { index: 43, height: 0.85, maxWidth: 256 },
  tree: { index: 52, height: 8.5, maxWidth: 900 },
  "stone-lantern": { index: 58, height: 2.2, maxWidth: 256 },
};
const DECOR_THRESHOLD = { area: 4000, w: 30, h: 30 };

async function components(file, min) {
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
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (!seen[ni] && data[ni * 4 + 3] > 128) { seen[ni] = 1; stack[sp++] = ni; }
        }
      }
      if (area > min.area && maxX - minX > min.w && maxY - minY > min.h) {
        found.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, id: labelId });
      }
      labelId++;
    }
  }
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

// Keep only the pixels that belong to this figure, so a neighbour's bounding box cannot bleed in.
async function cutFigure(file, sheet, box) {
  const region = { left: box.x, top: box.y, width: box.w, height: box.h };
  const mask = Buffer.alloc(region.width * region.height);
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    const sx = region.left + x, sy = region.top + y;
    mask[y * region.width + x] = sheet.labels[sy * sheet.width + sx] === box.id ? 255 : 0;
  }
  const maskPng = await sharp(mask, { raw: { width: region.width, height: region.height, channels: 1 } }).png().toBuffer();
  return sharp(file).extract(region).composite([{ input: maskPng, blend: "dest-in" }]).png().toBuffer();
}

function writeOrCheck(file, buf, check) {
  if (check) {
    const old = fs.existsSync(file) ? fs.readFileSync(file) : null;
    if (!old || !old.equals(buf)) throw new Error(`${path.relative(ROOT, file)} is out of date; run npm run build:sprites`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

async function main() {
  const check = process.argv.includes("--check");

  // ---- characters from the v3 atlas --------------------------------------------------------
  const atlasJson = JSON.parse(fs.readFileSync(path.join(V3, "atlas.json"), "utf8"));
  const animations = JSON.parse(fs.readFileSync(path.join(V3, "animation.json"), "utf8"));
  const atlasFile = path.join(V3, "atlas.png");
  const atlasMeta = await sharp(atlasFile).metadata();
  const atlasW = atlasMeta.width, atlasH = atlasMeta.height;
  if (atlasW !== atlasJson.meta.size.w || atlasH !== atlasJson.meta.size.h) throw new Error("atlas size does not match atlas.json");

  const manifest = { atlas: { file: "characters/atlas.png", width: atlasW, height: atlasH }, characters: {}, decor: {} };
  for (const [id, label] of [["chu_tieu", "Chú tiểu"], ["phat_tu", "Phật tử"]]) {
    const poses = {};
    for (const [pose, frame] of Object.entries(POSE_FRAMES)) {
      const name = `${id}_${String(frame).padStart(2, "0")}`;
      const rect = atlasJson.frames[name];
      if (!rect) throw new Error(`${id}.${pose}: ${name} is not in atlas.json`);
      const { x, y, w, h } = rect.frame;
      if (x + w > atlasW || y + h > atlasH) throw new Error(`${name} lies outside the atlas`);
      poses[pose] = [x, y, w, h];
    }
    manifest.characters[id] = { label, frameSize: animations[id].frameSize, poses };
  }
  writeOrCheck(path.join(CHAR_DIR, "atlas.png"), fs.readFileSync(atlasFile), check);

  // ---- scenery -------------------------------------------------------------------------------
  const sheet = await components(DECOR_SRC, DECOR_THRESHOLD);
  for (const [name, cfg] of Object.entries(DECOR)) {
    const box = sheet.boxes[cfg.index];
    if (!box) throw new Error(`decor ${name}: no component ${cfg.index}`);
    const cut = await cutFigure(DECOR_SRC, sheet, box);
    const trimmed = await sharp(cut).trim({ threshold: 1 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    const scale = Math.min(1, cfg.maxWidth / meta.width);
    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));
    const buf = await sharp(trimmed).resize(w, h, { fit: "fill" }).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
    writeOrCheck(path.join(DECOR_DIR, `${name}.webp`), buf, check);
    manifest.decor[name] = { file: `decor/${name}.webp`, height: cfg.height, aspect: Number((w / h).toFixed(4)) };
    console.log(`${check ? "checked" : "wrote"} public/decor/${name}.webp (${Math.round(buf.length / 1024)} KB, ${w}x${h})`);
  }

  const ts = `// Generated by scripts/build-assets.mjs. Do not edit by hand.\n`
    + `export const SPRITE_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n\n`
    + `export type CharacterId = keyof typeof SPRITE_MANIFEST.characters;\n`
    + `export type DecorId = keyof typeof SPRITE_MANIFEST.decor;\n`
    + `export const CHARACTER_IDS = Object.keys(SPRITE_MANIFEST.characters) as CharacterId[];\n`;
  writeOrCheck(MANIFEST_TS, Buffer.from(ts), check);
  console.log(`${check ? "checked" : "wrote"} ${path.relative(ROOT, MANIFEST_TS)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
