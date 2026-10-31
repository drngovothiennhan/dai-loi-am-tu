import type { ReactNode } from "react";

export const metadata = {
  title: "Đại Lôi Âm Tự",
  description: "Không gian thiền 3D tự dựng bằng Three.js.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, background: "#161936" }}>{children}</body>
    </html>
  );
}
