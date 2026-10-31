# Đại Lôi Âm Tự

Không gian thiền 3D (Three.js) tách từ hiutmc-ecosystem.

- `npm install`, `npm run build` (static export vào `out/`), `npm run typecheck`.
- Tiến trình lưu trong trình duyệt (localStorage). Không có máy chủ, không có người chơi giả lập.
- Đã duyệt (2026-10-31): 12 dòng quẻ, 9 ngưỡng cảnh giới, điểm công đức (lạy 3, hạt 1, mõ 1, hương 1, tĩnh tọa 2/phút).
- Chưa có: quyên góp, kênh tụng kinh, bộ 30 quẻ.

## Hình nhân vật và trang trí

Ảnh gốc nằm trong `asset-sources/`. Đó là các bảng concept: nhân vật và vật thể
không xếp theo lưới, nhưng đã có sẵn kênh alpha. `scripts/build-sprites.mjs` dò
từng hình bằng connected component trên alpha, cắt riêng từng hình, chuẩn hóa
chiều cao theo tư thế rồi xuất ra `public/sprites/` và `public/decor/`.

```bash
npm run build:sprites   # dựng lại sprite
npm run check:sprites   # kiểm tra sprite còn khớp ảnh gốc
```

Hai tư thế quỳ và lạy của Phật tử không có trong bộ ảnh ở độ phân giải dùng được
(chỉ cao 26–41px sau khi tách), nên nhân vật này tạm dùng tư thế chắp tay khi lạy.
