# Đại Lôi Âm Tự — Production Asset Pack v3

- `atlas.png`: 1024×640 RGBA atlas, 40 frames at 128×128.
- `atlas.json`: TexturePacker JSON Hash metadata with exact x/y/w/h rectangles.
- `animation.json`: per-character animation/view manifest.
- `sprites/characters/{chu_tieu,phat_tu}/frames/`: standalone transparent PNGs.
- `phaser3_example.js`: Phaser 3 example.
- `validation/validation_report.json`: automated integrity checks.
- `validation/contact_sheet.jpg`: visual QA preview.
- `source/`: original generated overview.

**Limitations:** source art is a generated pose overview. `walk_preview` is a sampled pose sequence, not a verified smooth walk cycle; available views are front/side/rear, not a complete 8-direction set. Validation checks technical integrity, not artistic continuity.
