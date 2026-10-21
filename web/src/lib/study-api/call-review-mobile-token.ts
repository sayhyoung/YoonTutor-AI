// 모바일 전화관리 앱용 Bearer 토큰.
// 앱은 쿠키 대신 이 토큰을 기기 보안 저장소에 보관한다. 토큰 안에 학생 식별정보와
// study-api 토큰 쌍을 AES-256-GCM으로 봉인해, 기기에서는 내용을 읽거나 바꿀 수 없다.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { studyRefresh } from "./auth";
import { StudyApiError, studyFetch } from "./client";
import { type StudyProfile, type StudyTokenPair, bmsOf } from "./types";

const TOKEN_PREFIX = "crm1";
const TOKEN_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_SECRET_LENGTH = 32;

export type MobileTokenPayload = {
  version: typeof TOKEN_VERSION;
  role: "student";
  subjectId: string;
  displayName?: string;
  // 학습 API 선택용 BM(숲·IGSE면 학원 API). 이전 토큰에는 없을 수 있다.
  bms?: string[];
  expiresAt: number;
  studyAccessToken: string;
  studyRefreshToken: string;
};

function configuredSecret(): string | null {
  const secret = process.env.CALL_REVIEW_SESSION_SECRET?.trim();
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

// 쿠키 서명과 같은 비밀값을 쓰되, 용도별로 분리된 키를 파생한다.
function encryptionKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", "call-review-mobile-token:v1", 32));
}

function isPayload(value: unknown): value is MobileTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<MobileTokenPayload>;
  return (
    payload.version === TOKEN_VERSION &&
    payload.role === "student" &&
    typeof payload.subjectId === "string" &&
    payload.subjectId.length > 0 &&
    (payload.displayName === undefined || typeof payload.displayName === "string") &&
    (payload.bms === undefined ||
      (Array.isArray(payload.bms) && payload.bms.every((bm) => typeof bm === "string"))) &&
    typeof payload.expiresAt === "number" &&
    typeof payload.studyAccessToken === "string" &&
    typeof payload.studyRefreshToken === "string"
  );
}

export function sealMobileToken(payload: MobileTokenPayload, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const sealed = Buffer.concat([iv, body, cipher.getAuthTag()]);
  return `${TOKEN_PREFIX}.${sealed.toString("base64url")}`;
}

export function openMobileToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): MobileTokenPayload | null {
  const [prefix, encoded, ...rest] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !encoded || rest.length > 0) return null;

  try {
    const sealed = Buffer.from(encoded, "base64url");
    if (sealed.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = sealed.subarray(0, IV_BYTES);
    const tag = sealed.subarray(sealed.length - TAG_BYTES);
    const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!isPayload(parsed) || parsed.expiresAt <= nowSeconds) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isMobileTokenConfigured(): boolean {
  return configuredSecret() !== null;
}

function withTokens(
  base: Omit<MobileTokenPayload, "studyAccessToken" | "studyRefreshToken" | "expiresAt">,
  tokens: StudyTokenPair,
): MobileTokenPayload {
  return {
    ...base,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.refreshTokenExpiresIn,
    studyAccessToken: tokens.accessToken,
    studyRefreshToken: tokens.refreshToken,
  };
}

// 학생 로그인 결과로 모바일 토큰을 만든다. 학생 번호가 없으면 null.
export function issueMobileToken(
  profile: StudyProfile,
  tokens: StudyTokenPair,
): { token: string; payload: MobileTokenPayload } | null {
  const secret = configuredSecret();
  if (!secret || !profile.customerNo) return null;
  const payload = withTokens(
    {
      version: TOKEN_VERSION,
      role: "student",
      subjectId: profile.customerNo,
      displayName: profile.customerName,
      bms: bmsOf(profile.memberships),
    },
    tokens,
  );
  return { token: sealMobileToken(payload, secret), payload };
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export function readMobileToken(request: Request): MobileTokenPayload | null {
  const secret = configuredSecret();
  const token = bearerToken(request);
  return secret && token ? openMobileToken(token, secret) : null;
}

// 토큰 안의 study-api 토큰으로 호출하고, 만료(401)면 refresh 후 1회 재시도한다.
// refresh로 토큰이 바뀌면 renewedToken()이 새 모바일 토큰을 돌려준다.
export function createMobileStudyFetcher(payload: MobileTokenPayload) {
  let current = payload;
  let renewed: string | null = null;

  async function fetchWithRefresh<T>(path: string): Promise<T> {
    try {
      return await studyFetch<T>(path, { accessToken: current.studyAccessToken });
    } catch (error) {
      if (!(error instanceof StudyApiError) || error.status !== 401) throw error;
      const tokens = await studyRefresh(current.studyRefreshToken);
      current = withTokens(current, tokens);
      const secret = configuredSecret();
      if (secret) renewed = sealMobileToken(current, secret);
      return await studyFetch<T>(path, { accessToken: current.studyAccessToken });
    }
  }

  return {
    fetch: fetchWithRefresh,
    renewedToken: () => renewed,
  };
}
