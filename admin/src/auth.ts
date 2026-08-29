import { Octokit } from "@octokit/rest";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { getEnvironment } from "@/lib/config";

const env = getEnvironment();
const oauthConfigured = Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET);
const localConfigured = Boolean(
  env.AUTH_MODE === "local-cli" && env.GITHUB_TOKEN,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers:
    env.AUTH_MODE === "local-cli" && localConfigured
      ? [
          Credentials({
            id: "local-cli",
            name: "本机 GitHub 身份",
            credentials: {},
            async authorize(_credentials, request) {
              const hostname = request.headers
                .get("host")
                ?.split(":")[0]
                ?.replace(/^\[|\]$/g, "");
              if (!hostname || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
                return null;
              }
              const response = await new Octokit({
                auth: env.GITHUB_TOKEN,
                userAgent: "lilpolaris-blog-admin/local-auth",
              }).rest.users.getAuthenticated();
              if (
                response.data.login.toLowerCase() !==
                env.ADMIN_GITHUB_LOGIN.toLowerCase()
              ) {
                return null;
              }
              return {
                id: String(response.data.id),
                name: response.data.name || response.data.login,
                email: response.data.email,
                image: response.data.avatar_url,
                login: response.data.login,
              };
            },
          }),
        ]
      : oauthConfigured
        ? [
        GitHub({
          clientId: env.AUTH_GITHUB_ID!,
          clientSecret: env.AUTH_GITHUB_SECRET!,
        }),
      ]
        : [],
  pages: {
    signIn: "/",
    error: "/?authError=1",
  },
  callbacks: {
    async signIn({ profile, user }) {
      const login =
        profile && "login" in profile && typeof profile.login === "string"
          ? profile.login
          : user.login || "";
      return login.toLowerCase() === env.ADMIN_GITHUB_LOGIN.toLowerCase();
    },
    async jwt({ token, profile, user }) {
      if (
        profile &&
        "login" in profile &&
        typeof profile.login === "string"
      ) {
        token.login = profile.login;
      }
      if (user?.login) token.login = user.login;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.login = String(token.login || "");
      return session;
    },
  },
});
