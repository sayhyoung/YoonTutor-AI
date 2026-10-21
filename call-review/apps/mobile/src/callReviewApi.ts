import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { File } from "expo-file-system";

// 비어 있으면 로그인 없이 샘플 데이터로 동작하는 프리뷰 모드.
export const callReviewApiBaseUrl =
  process.env.EXPO_PUBLIC_CALL_REVIEW_API_BASE_URL?.trim().replace(/\/+$/, "") || null;

const TOKEN_KEY = "call-review-token";

export class UnauthorizedError extends Error {
  constructor(message = "다시 로그인해 주세요.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// 토큰은 기기 보안 저장소에 둔다. 웹 프리뷰에는 보안 저장소가 없어 localStorage를 쓴다.
export const tokenStorage = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === "web") return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    try {
      if (Platform.OS === "web") globalThis.localStorage?.setItem(TOKEN_KEY, token);
      else await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
      // 저장 실패 시 이번 실행 동안만 로그인 상태가 유지된다.
    }
  },
  async clear(): Promise<void> {
    try {
      if (Platform.OS === "web") globalThis.localStorage?.removeItem(TOKEN_KEY);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // 이미 없으면 무시한다.
    }
  },
};

async function request<T>(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<T> {
  if (!callReviewApiBaseUrl) throw new ApiError("서버 주소가 설정되지 않았어요.", 0);

  let response: Response;
  try {
    response = await fetch(`${callReviewApiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("서버에 연결하지 못했어요. 네트워크를 확인해 주세요.", 0);
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401 && init.token) throw new UnauthorizedError();
  if (!response.ok) {
    throw new ApiError(data.error ?? "요청을 처리하지 못했어요.", response.status);
  }
  return data;
}

export type LoginResult = { token: string; expiresAt: number; displayName: string | null };

export function login(userId: string, password: string): Promise<LoginResult> {
  return request<LoginResult>("/api/call-review/mobile/session", {
    method: "POST",
    body: { userId, password },
  });
}

export async function logout(token: string): Promise<void> {
  try {
    await request("/api/call-review/mobile/session", { method: "DELETE", token });
  } catch {
    // 서버 로그아웃이 실패해도 기기 토큰은 지운다.
  }
}

// BFF가 돌려주는 학습 항목(web LearningItem 중 필요한 필드).
export type ApiLearningItem = {
  id: string;
  studentId: string;
  sourceType: "word" | "sentence" | "assessment";
  sourceLabel: string;
  promptKo: string;
  answerEn: string;
  meaningKo?: string;
};

export type LearningItemsResponse = {
  items: ApiLearningItem[];
  studyStartDate: string;
  studyEndDate: string;
  renewedToken?: string;
};

export function fetchLearningItems(token: string): Promise<LearningItemsResponse> {
  return request<LearningItemsResponse>("/api/call-review/learning-items", { token });
}

export type CallReportPayload = {
  reportId: string;
  startedAt: string;
  endedAt: string;
  finishReason: "completed" | "stopped" | "no-response";
  targets: {
    targetId: string;
    sourceLabel: string;
    promptKo: string;
    answerEn: string;
    outcome: "correct" | "retry" | "skipped";
    learnerAnswer?: string;
  }[];
  conversation: { questionEn: string; answer: string }[];
};

export type CallReportSummary = CallReportPayload & {
  reviewedCount: number;
  needsReviewCount: number;
  savedAt: string;
};

export function saveCallReport(token: string, report: CallReportPayload): Promise<{ report: CallReportSummary }> {
  return request("/api/call-review/reports", { method: "POST", token, body: report });
}

export function fetchCallReports(token: string): Promise<{ reports: CallReportSummary[]; configured: boolean }> {
  // 학습현황(정답률 추이·자주 틀린 표현)을 내려고 최근 30건을 받는다. 목록은 화면에서 10건만 보인다.
  return request("/api/call-review/reports?limit=30", { token });
}

export type ApiSchedule = {
  weekdays: string[];
  time: string;
  reminderMinutesBefore: number;
  active: boolean;
  callsPerWeek: number;
  nextCallAt: string | null;
  nextCallLabel: string | null;
};

export function fetchSchedule(token: string): Promise<{ schedule: ApiSchedule | null; configured?: boolean }> {
  return request("/api/call-review/schedule", { token });
}

export type FreeTalkTurnRequest = {
  expressions: { answerEn: string; promptKo: string; sourceType: "word" | "sentence" }[];
  history: { questionEn: string; answer: string }[];
  turnIndex: number;
};

export type GeneratedTurn = {
  questionEn: string;
  questionMeaningKo: string;
  answerHint: string;
  choices: { answerEn: string; meaningKo: string }[];
};

export async function generateFreeTalkTurn(token: string, body: FreeTalkTurnRequest): Promise<GeneratedTurn | null> {
  const response = await request<{ turn: GeneratedTurn | null }>("/api/call-review/free-talk", {
    method: "POST",
    token,
    body,
  });
  return response.turn;
}

// 녹음 파일(uri)을 BFF로 올려 영어 텍스트로 바꾼다. 웹은 blob URL, 네이티브는 파일 uri.
export async function transcribeAnswer(token: string, uri: string): Promise<string> {
  if (!callReviewApiBaseUrl) throw new ApiError("서버 주소가 설정되지 않았어요.", 0);
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(uri).then((response) => response.blob());
    form.append("audio", blob, blob.type.includes("webm") ? "answer.webm" : "answer.m4a");
  } else {
    // Expo의 fetch는 RN식 { uri, name, type } 파트를 받지 않는다("Unsupported FormDataPart").
    // expo-file-system의 File은 Blob을 구현하므로 그대로 붙인다. 형식은 녹음 확장자로 정한다.
    const fileUri = uri.startsWith("/") ? `file://${uri}` : uri;
    const extension = fileUri.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "m4a";
    form.append("audio", new File(fileUri), `answer.${extension}`);
  }
  let response: Response;
  try {
    response = await fetch(`${callReviewApiBaseUrl}/api/call-review/stt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (error) {
    console.warn("[voice] 녹음 업로드 실패", uri.split(":")[0], error instanceof Error ? error.message : error);
    throw new ApiError("서버에 연결하지 못했어요.", 0);
  }
  const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new ApiError(data.error ?? "말한 내용을 알아듣지 못했어요.", response.status);
  return data.text ?? "";
}

export async function registerPushDevice(token: string, pushToken: string): Promise<boolean> {
  const result = await request<{ ok: boolean }>("/api/call-review/devices", {
    method: "POST",
    token,
    body: { token: pushToken, platform: Platform.OS },
  });
  return result.ok;
}

export async function unregisterPushDevice(token: string, pushToken: string): Promise<void> {
  await request("/api/call-review/devices", { method: "DELETE", token, body: { token: pushToken, platform: Platform.OS } }).catch(
    () => undefined,
  );
}

// Gemini 읽어 주기 오디오 주소(재생기가 Authorization 헤더를 붙여 직접 받는다).
export function ttsSource(token: string, text: string, language: "en" | "ko") {
  if (!callReviewApiBaseUrl) return null;
  const query = `text=${encodeURIComponent(text)}&lang=${language}`;
  return { uri: `${callReviewApiBaseUrl}/api/call-review/tts?${query}`, headers: { Authorization: `Bearer ${token}` } };
}
