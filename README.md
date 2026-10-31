# Đại Lôi Âm Tự

Không gian thiền 3D (Three.js) tách từ hiutmc-ecosystem.

- `npm install`, `npm run build` (static export vào `out/`), `npm run typecheck`.
- Tiến trình lưu trong trình duyệt (localStorage). Không có máy chủ, không có người chơi giả lập.
- Đã duyệt (2026-10-31): 12 dòng quẻ, 9 ngưỡng cảnh giới, điểm công đức (lạy 3, hạt 1, mõ 1, hương 1, tĩnh tọa 2/phút).
- Chưa có: quyên góp, kênh tụng kinh, bộ 30 quẻ.

## Kịch bản

Kịch bản tái cấu trúc (81 nạn, 4 khu vực, tàng kinh): [docs/KICH_BAN.md](docs/KICH_BAN.md).

## Hình nhân vật và trang trí

Nguồn nằm trong `asset-sources/`: `v3/` là bộ production (atlas nhân vật, frame, tổng quan),
`decor.png` là bảng trang trí. `scripts/build-assets.mjs` lấy frame nhân vật từ atlas v3,
tách vật trang trí khỏi bảng, rồi xuất `public/characters/`, `public/decor/` và `lib/sprite-manifest.ts`.

```bash
npm run build:sprites   # dựng lại atlas nhân vật, trang trí và manifest
npm run check:sprites   # kiểm tra đầu ra còn khớp nguồn
```

Các lỗi đã biết của atlas v3 và tư thế chưa có được liệt kê trong `docs/KICH_BAN.md`.
