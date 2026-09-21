import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { StudyProfile, StudyRole } from "./types";

const SESSION_COOKIE = "call_review_session";
const SESSION_VERSION = 1;
const MIN_SECRET_LENGTH = 32;

export type CallReviewSession = {
  version: typeof SESSION_VERSION;
  role: StudyRole;
  subjectId: string;
  displayName?: string;
  expiresAt: number;
};

function configuredSecret(): string | null {
  const secret = process.env.CALL_REVIEW_SESSION_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function isSession(value: unknown): value is CallReviewSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<CallReviewSession>;
  return (
    session.version === SESSION_VERSION &&
    (session.role === "student" || session.role === "teacher" || session.role === "center") &&
    typeof session.subjectId === "string" &&
    session.subjectId.length > 0 &&
    (session.displayName === undefined || typeof session.displayName === "string") &&
    typeof session.expiresAt === "number"
  );
}

export function encodeCallReviewSession(
  session: CallReviewSession,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function decodeCallReviewSession(
  value: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): CallReviewSession | null {
  const [payload, encodedSignature, ...rest] = value.split(".");
  if (!payload || !encodedSignature || rest.length > 0) return null;

  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!isSession(parsed) || parsed.expiresAt <= nowSeconds) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sessionFromProfile(
  profile: StudyProfile,
  role: StudyRole,
  maxAgeSeconds: number,
): CallReviewSession | null {
  const subjectId = role === "student" ? profile.customerNo : profile.teacherNo;
  if (!subjectId) return null;

  return {
    version: SESSION_VERSION,
    role,
    subjectId,
    displayName: role === "student" ? profile.customerName : profile.teacherName,
    expiresAt: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function isCallReviewSessionConfigured(): boolean {
  return configuredSecret() !== null;
}

export async function setCallReviewSession(
  profile: StudyProfile,
  role: StudyRole,
  maxAgeSeconds: number,
): Promise<boolean> {
  const secret = configuredSecret();
  const session = sessionFromProfile(profile, role, maxAgeSeconds);
  const jar = await cookies();

  if (!secret || !session) {
    jar.delete(SESSION_COOKIE);
    return false;
  }

  jar.set(
    SESSION_COOKIE,
    encodeCallReviewSession(session, secret),
    cookieOptions(maxAgeSeconds),
  );
  return true;
}

export async function getCallReviewSession(): Promise<CallReviewSession | null> {
  const secret = configuredSecret();
  if (!secret) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? decodeCallReviewSession(value, secret) : null;
}

export async function refreshCallReviewSession(maxAgeSeconds: number): Promise<void> {
  const secret = configuredSecret();
  if (!secret) return;

  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  const current = value ? decodeCallReviewSession(value, secret) : null;
  if (!current) {
    jar.delete(SESSION_COOKIE);
    return;
  }

  const refreshed: CallReviewSession = {
    ...current,
    expiresAt: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  jar.set(
    SESSION_COOKIE,
    encodeCallReviewSession(refreshed, secret),
    cookieOptions(maxAgeSeconds),
  );
}

export async function clearCallReviewSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
