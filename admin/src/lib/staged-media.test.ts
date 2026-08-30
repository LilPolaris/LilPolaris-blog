import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createStagedMediaReceipt,
  STAGED_MEDIA_RECEIPT_TTL_MS,
  verifyStagedMediaReceipt,
  verifyStagedMediaReceipts,
} from "@/lib/staged-media";
import type { StagedPostMedia } from "@/lib/types";

const secret = "test-secret";
const now = Date.parse("2026-08-30T02:00:00.000Z");
const scope = { owner: "owner", repo: "blog", branch: "main" };
const media: StagedPostMedia = {
  id: "pending-1",
  referenceName: "before.png",
  preparedName: "20260830-before-abcdef.png",
  contentType: "image/png",
  size: 1024,
  blobSha: "a".repeat(40),
};

function resign(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signed = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signed}`;
}

describe("staged media receipts", () => {
  it("round-trips a receipt bound to repository and branch", () => {
    const receipt = createStagedMediaReceipt(media, scope, secret, now);
    expect(verifyStagedMediaReceipt(receipt, scope, secret, now)).toEqual(media);
  });

  it("rejects tampering, another repository, and another branch", () => {
    const receipt = createStagedMediaReceipt(media, scope, secret, now);
    const [payload, signature] = receipt.split(".");
    expect(() =>
      verifyStagedMediaReceipt(`${payload}x.${signature}`, scope, secret, now),
    ).toThrow(/无效/);
    expect(() =>
      verifyStagedMediaReceipt(
        receipt,
        { ...scope, repo: "another-blog" },
        secret,
        now,
      ),
    ).toThrow(/仓库或分支/);
    expect(() =>
      verifyStagedMediaReceipt(
        receipt,
        { ...scope, branch: "preview" },
        secret,
        now,
      ),
    ).toThrow(/仓库或分支/);
  });

  it("expires after exactly one hour", () => {
    const receipt = createStagedMediaReceipt(media, scope, secret, now);
    expect(() =>
      verifyStagedMediaReceipt(
        receipt,
        scope,
        secret,
        now + STAGED_MEDIA_RECEIPT_TTL_MS,
      ),
    ).toThrow(/过期/);
  });

  it("rejects a signed payload containing a forged blob SHA", () => {
    const receipt = createStagedMediaReceipt(media, scope, secret, now);
    const [encoded] = receipt.split(".");
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    expect(() =>
      verifyStagedMediaReceipt(
        resign({ ...payload, blobSha: "not-a-git-sha" }),
        scope,
        secret,
        now,
      ),
    ).toThrow(/无效/);
  });

  it("rejects duplicate pending IDs before finalization", () => {
    const first = createStagedMediaReceipt(media, scope, secret, now);
    const second = createStagedMediaReceipt(
      { ...media, blobSha: "b".repeat(40) },
      scope,
      secret,
      now,
    );
    expect(() =>
      verifyStagedMediaReceipts([first, second], scope, secret, now),
    ).toThrow(/重复/);
  });
});
