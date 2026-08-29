import { AlertTriangle, GitBranch, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { configurationStatus, getEnvironment } from "@/lib/config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ authError?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const status = configurationStatus();
  const env = getEnvironment();
  const params = await searchParams;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-logo">LP</div>
        <h1 className="page-title" id="login-title">
          LilPolaris Blog Admin
        </h1>
        <p className="page-description">
          管理文章、图片和部署流程。后台仅向指定的 GitHub 账户开放。
        </p>

        {params.authError ? (
          <div className="alert danger" style={{ marginTop: 18 }}>
            <AlertTriangle aria-hidden="true" size={18} />
            <div>
              登录未完成。请确认当前 GitHub 用户是{" "}
              <strong>{env.ADMIN_GITHUB_LOGIN}</strong>。
            </div>
          </div>
        ) : null}

        {!status.configured ? (
          <>
            <div className="alert" style={{ marginTop: 18 }}>
              <AlertTriangle aria-hidden="true" size={18} />
              <div>
                <strong>需要完成服务端配置</strong>
                <div style={{ marginTop: 3 }}>
                  将 admin/.env.example 复制为 .env.local 并填写以下变量。
                </div>
              </div>
            </div>
            <ul className="config-list" aria-label="缺失的环境变量">
              {status.missing.map((name) => (
                <li key={name}>{name}=</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="alert" style={{ marginTop: 18 }}>
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              将以 <strong>{env.ADMIN_GITHUB_LOGIN}</strong> 身份校验访问权限。
            </div>
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn(
              env.AUTH_MODE === "local-cli" ? "local-cli" : "github",
              { redirectTo: "/dashboard" },
            );
          }}
          style={{ marginTop: 20 }}
        >
          <button
            className="button primary"
            disabled={!status.authConfigured}
            style={{ width: "100%" }}
            type="submit"
          >
            <GitBranch aria-hidden="true" size={17} />
            {env.AUTH_MODE === "local-cli"
              ? "使用本机 GitHub 身份进入"
              : "使用 GitHub 登录"}
          </button>
        </form>
        <p className="field-help" style={{ marginTop: 14, textAlign: "center" }}>
          Token 仅由服务端读取，不会发送到浏览器。
        </p>
      </section>
    </main>
  );
}
