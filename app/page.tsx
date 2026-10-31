import type { Metadata } from "next";
import DaiLoAmTu from "@/components/dai-lo-am-tu/DaiLoAmTu";

export const metadata: Metadata = {
  title: "Đại Lôi Âm Tự · HIU TMC",
  description:
    "Không gian thiền 3D tự dựng bằng Three.js: Đại Hùng Bảo Điện, Sân Ánh Trăng Bồ Đề, Cầu Lăng Vân và tràng hạt 108 hạt. Không có người chơi giả lập.",
};

export default function DaiLoAmTuPage() {
  return <DaiLoAmTu />;
}
