import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

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
  return request("/api/call-review/reports?limit=10", { token });
}
