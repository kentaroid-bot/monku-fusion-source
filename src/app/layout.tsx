import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Monku Fusion | 対話と創発の種火",
  description: "文句や摩擦から、建設的な返信と新しいアイデアをつくる。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
