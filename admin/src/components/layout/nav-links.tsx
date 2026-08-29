"use client";

import {
  FileClock,
  FileText,
  Gauge,
  ImageIcon,
  Rocket,
  Settings,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "概览", icon: Gauge },
  { href: "/posts", label: "文章", icon: FileText },
  { href: "/drafts", label: "草稿", icon: FileClock },
  { href: "/media", label: "媒体库", icon: ImageIcon },
  { href: "/taxonomy", label: "分类与标签", icon: Tags },
  { href: "/deployments", label: "部署记录", icon: Rocket },
  { href: "/settings", label: "设置", icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="主导航">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            className={`nav-link${active ? " active" : ""}`}
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
