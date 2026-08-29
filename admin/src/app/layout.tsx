import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: {
    default: "LilPolaris Blog Admin",
    template: "%s · LilPolaris Blog Admin",
  },
  description: "安全、克制的 Hexo 博客内容管理后台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
