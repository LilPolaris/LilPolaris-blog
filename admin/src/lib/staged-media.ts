import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getEnvironment } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { STAGED_IMAGE_MAX_BYTES } from "@/lib/image-upload";
import {
  assertPreparedMediaName,
  supportedImageContentType,
} from "@/lib/media-name";
import type { StagedPostMedia } from "@/lib/types";

export const STAGED_MEDIA_RECEIPT_TTL_MS = 60 * 60 * 1_000;
export const STAGED_MEDIA_TOTAL_MAX_BYTES = 32 * 1024 * 1024;

export interface StagedMediaRepositoryScope {
  owner: string;
  repo: string;
  branch: string;
}

const receiptPayloadSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  referenceName: z.string().min(1).max(200),
  preparedName: z.string().min(1).max(140),
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
  ]),
  size: z.number().int().positive().max(STAGED_IMAGE_MAX_BYTES),
  blobSha: z.string().regex(/^[0-9a-f]{40}$/),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

type ReceiptPayload = z.infer<typeof receiptPayloadSchema>;

function invalidReceipt(message = "图片暂存凭证无效，请重新选择图片。") {
  return new AppError("VALIDATION", message, 400);
}

function requireSecret(secret: string) {
  if (!secret) {
    throw new AppError(
      "CONFIG_MISSING",
      "尚未配置 AUTH_SECRET，无法签发图片暂存凭证。",
      503,
      { missing: ["AUTH_SECRET"] },
    );
  }
  return secret;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", requireSecret(secret))
    .update(payload)
    .digest("base64url");
}

function validateStagedMedia(media: StagedPostMedia) {
  assertPreparedMediaName(media.preparedName);
  if (!supportedImageContentType(media.contentType)) throw invalidReceipt();
  return media;
}

export function stagedMediaSigningSecret() {
  return requireSecret(getEnvironment().AUTH_SECRET || "");
}

export function createStagedMediaReceipt(
  media: StagedPostMedia,
  scope: StagedMediaRepositoryScope,
  secret: string,
  now = Date.now(),
) {
  validateStagedMedia(media);
  const parsed = receiptPayloadSchema.parse({
    version: 1,
    ...media,
    ...scope,
    issuedAt: now,
    expiresAt: now + STAGED_MEDIA_RECEIPT_TTL_MS,
  });
  const payload = Buffer.from(JSON.stringify(parsed), "utf8").toString(
    "base64url",
  );
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyStagedMediaReceipt(
  receipt: string,
  scope: StagedMediaRepositoryScope,
  secret: string,
  now = Date.now(),
): StagedPostMedia {
  const parts = receipt.split(".");
  if (parts.length !== 2) throw invalidReceipt();
  const [payload, receivedSignature] = parts;
  if (!payload || !/^[A-Za-z0-9_-]{43}$/.test(receivedSignature)) {
    throw invalidReceipt();
  }
  const expectedSignature = signature(payload, secret);
  const received = Buffer.from(receivedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw invalidReceipt();
  }

  let parsed: ReceiptPayload;
  try {
    parsed = receiptPayloadSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    assertPreparedMediaName(parsed.preparedName);
  } catch {
    throw invalidReceipt();
  }
  if (
    parsed.owner !== scope.owner ||
    parsed.repo !== scope.repo ||
    parsed.branch !== scope.branch
  ) {
    throw invalidReceipt("图片暂存凭证不属于当前仓库或分支。");
  }
  if (parsed.expiresAt <= now) {
    throw invalidReceipt("图片暂存凭证已过期，请重新上传图片。");
  }
  if (
    parsed.expiresAt - parsed.issuedAt !== STAGED_MEDIA_RECEIPT_TTL_MS ||
    parsed.issuedAt > now
  ) {
    throw invalidReceipt();
  }
  return validateStagedMedia({
    id: parsed.id,
    referenceName: parsed.referenceName,
    preparedName: parsed.preparedName,
    contentType: parsed.contentType,
    size: parsed.size,
    blobSha: parsed.blobSha,
  });
}

export function verifyStagedMediaReceipts(
  receipts: string[],
  scope: StagedMediaRepositoryScope,
  secret: string,
  now = Date.now(),
) {
  const media = receipts.map((receipt) =>
    verifyStagedMediaReceipt(receipt, scope, secret, now),
  );
  const ids = new Set<string>();
  let totalBytes = 0;
  for (const item of media) {
    if (ids.has(item.id)) {
      throw new AppError("VALIDATION", "图片暂存凭证包含重复项目。", 400);
    }
    ids.add(item.id);
    totalBytes += item.size;
  }
  if (totalBytes > STAGED_MEDIA_TOTAL_MAX_BYTES) {
    throw new AppError(
      "UPLOAD_INVALID",
      "一篇文章的暂存图片总量不能超过 32 MiB。",
      413,
    );
  }
  return media;
}
