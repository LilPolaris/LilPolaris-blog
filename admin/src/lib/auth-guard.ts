import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getEnvironment } from "@/lib/config";
import { AppError } from "@/lib/errors";

function isAllowed(login?: string | null) {
  return (
    Boolean(login) &&
    login!.toLowerCase() === getEnvironment().ADMIN_GITHUB_LOGIN.toLowerCase()
  );
}

export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user || !isAllowed(session.user.login)) redirect("/");
  return session;
}

export async function requireAdminApi() {
  const session = await auth();
  if (!session?.user) {
    throw new AppError("AUTH_REQUIRED", "请先登录。", 401);
  }
  if (!isAllowed(session.user.login)) {
    throw new AppError("FORBIDDEN", "当前 GitHub 用户无权访问此后台。", 403);
  }
  return session;
}
