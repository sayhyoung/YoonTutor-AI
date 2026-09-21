import { describe, expect, it } from "vitest";

import {
  decodeCallReviewSession,
  encodeCallReviewSession,
  type CallReviewSession,
} from "./call-review-session";

const secret = "test-only-session-secret-with-at-least-32-characters";

function session(overrides: Partial<CallReviewSession> = {}): CallReviewSession {
  return {
    version: 1,
    role: "student",
    subjectId: "<CUSTOMER_NO>",
    displayName: "테스트 학생",
    expiresAt: 2_000,
    ...overrides,
  };
}

describe("call review session codec", () => {
  it("round-trips a valid signed session", () => {
    const input = session();
    const encoded = encodeCallReviewSession(input, secret);

    expect(decodeCallReviewSession(encoded, secret, 1_000)).toEqual(input);
  });

  it("rejects a tampered payload", () => {
    const encoded = encodeCallReviewSession(session(), secret);
    const [payload, signature] = encoded.split(".");
    const tampered = `${payload.slice(0, -1)}A.${signature}`;

    expect(decodeCallReviewSession(tampered, secret, 1_000)).toBeNull();
  });

  it("rejects an expired session", () => {
    const encoded = encodeCallReviewSession(session({ expiresAt: 999 }), secret);

    expect(decodeCallReviewSession(encoded, secret, 1_000)).toBeNull();
  });

  it("rejects a session signed by another server", () => {
    const encoded = encodeCallReviewSession(session(), secret);

    expect(
      decodeCallReviewSession(
        encoded,
        "different-test-secret-with-at-least-32-characters",
        1_000,
      ),
    ).toBeNull();
  });
});
