# Kịch bản Đại Lôi Âm Tự (bản tái cấu trúc)

Tài liệu này là kịch bản làm việc. Đề xuất ở đây chưa phải quyết định của chủ dự án
và cần duyệt trước khi thay đổi sản phẩm.

## 1. Bối cảnh trong Tây Du Ký

- Đại Lôi Âm Tự là nơi Như Lai ngự trên Linh Sơn (Thứu Lĩnh). Đây là đích đến cuối cùng của Đường Tăng.
- Theo bản Thế Đức Đường (百回本) hồi 98, sau khi qua nhiều nạn, Ananda và Kasyapa đòi quà trước khi trao kinh.
  Đường Tăng không có quà, nên họ trao cho thầy trò bộ kinh **không chữ** (无字真经, "vô tự chân kinh").
  Thầy trò trình lên Như Lai, và chỉ sau khi dâng bát tử kim (紫金钵盂) mới nhận được kinh có chữ.
  Nguồn: [Thế Đường bản hồi 98, Chen Hong (陈宏), bài trên The Paper](https://m.thepaper.cn/baijiahao_29583000).
- Kinh không chữ là một phần cốt lõi của truyện. Trong game, nó trở thành cuộn kinh đầu tiên người chơi nhận được.
- Cụm "81 kiếp nạn" được nhắc rộng rãi trong truyện. Bản hiện tại đếm 81 nạn theo cách này, nhưng chưa đối chiếu
  từng nạn với nguyên văn.

## 2. Cấu trúc khu vực

| Khu vực | Vai trò trong câu chuyện | Trong game |
|---|---|---|
| Thềm Lăng Vân | Điểm bắt đầu: bước lên cầu/thềm trước khi vào Linh Sơn | Khu vực `bridge`, bấm "Thềm Lăng Vân" |
| Đại Hùng Bảo Điện | Điện chính, Như Lai ngự trên đài sen | Khu vực `hall`, có tượng Phật, rồng, đèn lồng, lư hương |
| Sân Ánh Trăng Bồ Đề | Sân sau điện: cây Bồ Đề, hồ sen | Khu vực `courtyard`, tu tập bằng múa thiền (phím 1) |
| Tàng Kinh Các | Nơi cất kinh: nhận kinh không chữ, sau đó kinh có chữ | Phòng 3D phía đông sân (kệ sách, bàn đọc, cuộn kinh). Bảng "Tàng kinh" (phím 5) vẫn mở từ mọi khu vực |

## 3. Hành trình 81 nạn

- Hành trình gồm **81 nạn**, chia thành **9 chương**, mỗi chương 9 nạn.
- Tên chương dùng 9 cảnh giới đã được duyệt: Sơ Tâm Hành Giả, Qua Cầu Lăng Vân, Định Tâm Hàng Ma, Tĩnh Tâm Liên Hoa,
  Tỉnh Giác Vô Tự, Khai Ngộ Chân Kinh, An Trú Lôi Âm, Thiền Duyệt Bồ Đề, Đại Giác Ngộ.
- Ngưỡng điểm không đổi. Nạn trong chương tính theo tỷ lệ điểm đã có trong chương đó.
  Hàm `journeyPosition` trong `lib/progress.ts` làm việc này.
- Trạng thái kinh: chưa có nạn nào thì tàng kinh còn trắng. Mỗi mốc 108 hạt, 108 nhịp mõ hoặc 3 phút tĩnh tọa mở một
  lời nhắc. Khi vượt đủ 81 nạn, kinh có chữ là đích cuối cùng (chưa làm).

## 4. Nhân vật

- **Chú tiểu** và **Phật tử** lấy từ atlas v3 (`asset-sources/v3/atlas.png`, 40 frame 128×128).
- Pose đang dùng, map trong `scripts/build-assets.mjs`:
  - đứng: frame 0; đi: frame 1 và 3; ngồi: frame 7; quỳ: frame 11; lạy: frame 15.
  - Chưa có pose chắp tay và múa, nên các trạng thái này rơi về đứng.
- Lỗi đã phát hiện trong atlas v3:
  - `chu_tieu_16` không phải chú tiểu (hình tóc đen). Loại khỏi mọi tư thế.
  - `phat_tu_00`, `phat_tu_02`, `phat_tu_08` có vệt sáng vàng ở chân. Chưa dùng các frame này cho pose chính.
  - `walk_preview` không phải chu kỳ đi đã kiểm chứng. Hai khung đi là lựa chọn tạm.

## 5. Tài sản và nơi dùng

| Nguồn | Nội dung | Trạng thái |
|---|---|---|
| `asset-sources/v3/atlas.png` | 40 frame nhân vật, trong suốt | Dùng cho chú tiểu và phật tử |
| `asset-sources/v3/source/generated_v3_overview.png` | Ảnh tổng quan: chú tiểu, phật tử, tượng Phật và Bồ Tát, hộ pháp, rồng, thú linh, cổng, sen, cây, mây, hiệu ứng, đèn | Nền đục gradient. Chỉ dùng làm tài liệu tham chiếu. Chưa tách được vật thể sạch |
| `asset-sources/v3/validation/contact_sheet.jpg` | Bảng kiểm tra 40 frame | Tài liệu, không dùng trong game |
| `asset-sources/decor.png` (bộ trước) | Tượng Phật, rồng, đèn đứng, lư hương, sen, cây, đèn đá | Dùng cho cảnh; tách bằng `scripts/build-assets.mjs` |
| `asset-sources/overview-cut/` | 58 vật thể cắt từ ảnh tổng quan bằng GrabCut (`scripts/cut_overview.py`) | 53 vật thể dùng trong cảnh (xem bên dưới) |

Đang đặt trong cảnh (từ tổng quan): Quan Âm đứng hai bên Phật, Bồ Tát đỏ-vàng và xanh nơi hộ pháp,
hộ pháp xanh hai bên cửa điện, kỳ lân trước điện, rồng đỏ trên cột phải, hươu, voi, rùa ở sân, cổng đá và chùa chính
ở thềm, tháp, thiên nữ trên mây, mây vàng, sen trắng và sen xanh, trống, cờ phướn, cuộn kinh, chuông và đèn.

Đã cắt được nhưng chưa đặt vào cảnh: Phật A Di Đà, Phật Địa Tạng, Di Lặc, rồng xanh, rồng trắng, rồng ngọc, phượng, cổng nhỏ, bộ hộ pháp còn lại.
Chúng nằm sẵn trong `asset-sources/overview-cut/` và chỉ cần thêm một dòng `addBillboard`.

Chưa dùng: cây hồng và cây xanh, mây xanh, phướn vàng, đèn đứng nhỏ, bộ đèn treo. Cắt chưa sạch
(khung sai, hoặc lẫn nền), nên bỏ qua thay vì đưa vào cảnh khi còn lỗi.

## 6. Quyết định cần chủ dự án duyệt

1. Dùng cụm "81 nạn" và đặt 9 cảnh giới thành 9 chương (đề xuất ở mục 3).
2. Thêm "Tàng Kinh Các" thành phòng 3D thay vì bảng (đề xuất, chưa làm).
3. Tách nền ảnh tổng quan để đưa các Bồ Tát, hộ pháp, rồng và cổng vào cảnh (đề xuất, chưa làm).
4. Phật tử chưa có frame chắp tay, múa, quỳ và lạy riêng. Cần ảnh mới có nền trong suốt, cỡ 256px.
   Ảnh tổng quan có các tư thế này nhưng quá nhỏ (cao khoảng 70px) và nằm trên nền đục, nên chưa dùng được.
5. Bộ lời nhắc 12 dòng vẫn chờ bộ 30 quẻ chính thức.
