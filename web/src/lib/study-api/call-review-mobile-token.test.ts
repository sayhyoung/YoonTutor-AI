import { describe, expect, it } from "vitest";

import {
  openMobileToken,
  sealMobileToken,
  type MobileTokenPayload,
} from "./call-review-mobile-token";

const secret = "test-only-session-secret-with-at-least-32-characters";

function payload(overrides: Partial<MobileTokenPayload> = {}): MobileTokenPayload {
  return {
    version: 1,
    role: "student",
    subjectId: "<CUSTOMER_NO>",
    displayName: "테스트 학생",
    expiresAt: 2_000,
    studyAccessToken: "<ACCESS_TOKEN>",
    studyRefreshToken: "<REFRESH_TOKEN>",
    ...overrides,
  };
}

describe("call review mobile token", () => {
  it("round-trips a sealed payload", () => {
    const token = sealMobileToken(payload(), secret);

    expect(openMobileToken(token, secret, 1_000)).toEqual(payload());
  });

  it("does not expose the study-api tokens or subject in the token text", () => {
    const token = sealMobileToken(payload(), secret);
    const decoded = Buffer.from(token.split(".")[1], "base64url").toString("utf8");

    expect(decoded).not.toContain("<ACCESS_TOKEN>");
    expect(decoded).not.toContain("<CUSTOMER_NO>");
  });

  it("rejects a tampered token", () => {
    const token = sealMobileToken(payload(), secret);
    const [prefix, body] = token.split(".");
    const bytes = Buffer.from(body, "base64url");
    bytes[bytes.length - 20] ^= 1;

    expect(openMobileToken(`${prefix}.${bytes.toString("base64url")}`, secret, 1_000)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = sealMobileToken(payload({ expiresAt: 999 }), secret);

    expect(openMobileToken(token, secret, 1_000)).toBeNull();
  });

  it("rejects a token sealed with another secret", () => {
    const token = sealMobileToken(payload(), secret);

    expect(openMobileToken(token, `${secret}-other`, 1_000)).toBeNull();
  });
});
