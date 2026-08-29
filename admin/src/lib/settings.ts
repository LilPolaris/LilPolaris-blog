import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getBaseRepositoryConfig, getEnvironment } from "@/lib/config";
import { AppError } from "@/lib/errors";
import {
  settingsOverridesSchema,
  type SettingsOverrides,
} from "@/lib/settings-validation";
import type { RepositoryConfig } from "@/lib/types";

const COOKIE_NAME = "lilpolaris-admin-settings";
export const SETTINGS_COOKIE_MAX_BYTES = 3600;

export interface SettingsStorageStatus {
  backend: "signed-cookie";
  bytes: number;
  maxBytes: number;
  scope: "current-browser";
}

function signingSecret() {
  return getEnvironment().AUTH_SECRET || "unconfigured-development-secret";
}

function sign(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function encode(overrides: SettingsOverrides) {
  const payload = Buffer.from(JSON.stringify(overrides), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

function decode(value?: string): SettingsOverrides {
  if (!value) return {};
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return {};
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return {};
  try {
    return settingsOverridesSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    return {};
  }
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const REPOSITORY_SCOPE_KEYS = [
  "owner",
  "repo",
  "branch",
  "postsPath",
  "draftsPath",
  "imagesPath",
] as const;

function repositoryScopedOverrides(overrides: SettingsOverrides) {
  const base = getBaseRepositoryConfig();
  if (base.adapter === "mock") return overrides;
  return Object.fromEntries(
    Object.entries(overrides).filter(
      ([key]) =>
        !REPOSITORY_SCOPE_KEYS.includes(
          key as (typeof REPOSITORY_SCOPE_KEYS)[number],
        ),
    ),
  ) as SettingsOverrides;
}

function assertRepositoryScope(overrides: SettingsOverrides) {
  const base = getBaseRepositoryConfig();
  if (base.adapter === "mock") return;
  const changed = REPOSITORY_SCOPE_KEYS.filter(
    (key) =>
      overrides[key] !== undefined && !sameValue(overrides[key], base[key]),
  );
  if (changed.length) {
    throw new AppError(
      "VALIDATION",
      "GitHub 仓库、分支和内容路径由服务端环境变量锁定，不能通过浏览器设置修改。",
      400,
      { fields: changed },
    );
  }
}

function compactOverrides(overrides: SettingsOverrides): SettingsOverrides {
  const base = getBaseRepositoryConfig();
  return Object.fromEntries(
    Object.entries(overrides).filter(
      ([key, value]) =>
        !sameValue(value, base[key as keyof RepositoryConfig]),
    ),
  ) as SettingsOverrides;
}

function storageStatus(value = ""): SettingsStorageStatus {
  return {
    backend: "signed-cookie",
    bytes: value ? Buffer.byteLength(`${COOKIE_NAME}=${value}`, "utf8") : 0,
    maxBytes: SETTINGS_COOKIE_MAX_BYTES,
    scope: "current-browser",
  };
}

export function parseSettingsOverrides(input: unknown) {
  const overrides = settingsOverridesSchema.parse(input);
  assertRepositoryScope(overrides);
  return overrides;
}

export async function getSettingsStorageStatus() {
  const cookieStore = await cookies();
  return storageStatus(cookieStore.get(COOKIE_NAME)?.value);
}

export async function getEffectiveRepositoryConfig(): Promise<RepositoryConfig> {
  const cookieStore = await cookies();
  const overrides = repositoryScopedOverrides(
    decode(cookieStore.get(COOKIE_NAME)?.value),
  );
  return { ...getBaseRepositoryConfig(), ...overrides };
}

export async function saveSettingsOverrides(input: unknown) {
  const parsed = settingsOverridesSchema.parse(input);
  assertRepositoryScope(parsed);
  const overrides = compactOverrides(repositoryScopedOverrides(parsed));
  const value = encode(overrides);
  const status = storageStatus(value);
  if (status.bytes > SETTINGS_COOKIE_MAX_BYTES) {
    throw new AppError(
      "VALIDATION",
      `设置内容为 ${status.bytes} 字节，超过当前浏览器存储的安全上限 ${SETTINGS_COOKIE_MAX_BYTES} 字节。请减少快捷模板、标签或分类数量。`,
      400,
      { bytes: status.bytes, maxBytes: SETTINGS_COOKIE_MAX_BYTES },
    );
  }

  const cookieStore = await cookies();
  if (!Object.keys(overrides).length) {
    cookieStore.delete(COOKIE_NAME);
    return {
      config: getBaseRepositoryConfig(),
      storage: storageStatus(),
    };
  }
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return {
    config: { ...getBaseRepositoryConfig(), ...overrides },
    storage: status,
  };
}

export async function clearSettingsOverrides() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return {
    config: getBaseRepositoryConfig(),
    storage: storageStatus(),
  };
}
