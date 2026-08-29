import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NavLinks } from "@/components/layout/nav-links";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { requireAdminPage } from "@/lib/auth-guard";
import { getEffectiveRepositoryConfig } from "@/lib/settings";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, config] = await Promise.all([
    requireAdminPage(),
    getEffectiveRepositoryConfig(),
  ]);
  const user = session.user;
  const initial = (user.name || user.login || "L").slice(0, 1).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">LP</span>
          <span>Blog Admin</span>
        </Link>
        <NavLinks />
        <div className="sidebar-footer">
          <div className="repo-line" title={`${config.owner}/${config.repo}`}>
            <span className="status-dot" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {config.owner}/{config.repo}
            </span>
          </div>
          <div className="user-line">
            <span
              className="avatar"
              style={{
                alignItems: "center",
                background: "var(--surface-muted)",
                display: "inline-flex",
                justifyContent: "center",
              }}
            >
              {initial}
            </span>
            <div className="user-copy">
              <div className="user-name">{user.name || user.login}</div>
              <div className="user-login">@{user.login}</div>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                aria-label="退出登录"
                className="icon-button ghost"
                type="submit"
              >
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-actions">
          <MobileNav />
          <span className="breadcrumb">LilPolaris / 内容管理</span>
        </div>
        <div className="topbar-actions">
          <a
            className="button ghost desktop-only"
            href={config.publicBlogUrl}
            rel="noreferrer"
            target="_blank"
          >
            打开博客
            <ExternalLink aria-hidden="true" size={14} />
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
