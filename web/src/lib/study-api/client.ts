// study-api 호출용 서버 사이드 fetch 래퍼.
// 서버(BFF 라우트)에서만 사용한다. base URL은 LEARNING_API_BASE_URL 환경변수.

import type { StudyEnvelope, StudyProblem } from "./types";

export class StudyApiError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly detail?: string;

  constructor(status: number, message: string, errorCode?: string, detail?: string) {
    super(message);
    this.name = "StudyApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.detail = detail;
  }
}

function baseUrl(): string {
  const raw = process.env.LEARNING_API_BASE_URL;
  if (!raw || raw.trim().length === 0) {
    throw new StudyApiError(500, "LEARNING_API_BASE_URL이 설정되지 않았습니다.");
  }
  return raw.trim().replace(/\/$/, "");
}

export function isStudyApiConfigured(): boolean {
  const raw = process.env.LEARNING_API_BASE_URL;
  return Boolean(raw && raw.trim().length > 0);
}

type StudyFetchInit = {
  method?: string;
  body?: unknown;
  accessToken?: string;
};

// study-api를 호출하고 성공 시 envelope.data를 반환한다.
// 실패(비 2xx)면 problem+json을 파싱해 StudyApiError를 던진다.
export async function studyFetch<T>(path: string, init: StudyFetchInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.accessToken) {
    headers.Authorization = `Bearer ${init.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (cause) {
    throw new StudyApiError(503, "study-api 연결에 실패했습니다.", undefined, String(cause));
  }

  const text = await res.text();
  const json = text ? safeJson(text) : null;

  if (!res.ok) {
    const problem = (json ?? {}) as Partial<StudyProblem>;
    throw new StudyApiError(
      problem.status ?? res.status,
      problem.title ?? res.statusText ?? "study-api 오류",
      problem.errorCode,
      problem.detail,
    );
  }

  // 성공 응답은 { code, message, data } wrapper. data만 반환.
  const envelope = (json ?? {}) as Partial<StudyEnvelope<T>>;
  return envelope.data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
