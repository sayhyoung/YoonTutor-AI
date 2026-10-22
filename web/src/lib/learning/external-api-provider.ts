import type { LearningItem } from "../types";
import type { LearningProvider } from "./types";

// 실제 회원 학습데이터(study-api)를 BFF 라우트를 통해 가져온다.
// studentId 는 회원번호(customerNo)로 사용된다.
export const externalLearningApiProvider: LearningProvider = {
  async getWrongAnswerItems(studentId: string): Promise<LearningItem[]> {
    const res = await fetch(
      `/api/study/wrong-answers?customerNo=${encodeURIComponent(studentId)}`,
      { credentials: "include" },
    );
    if (!res.ok) {
      throw new Error(`학습 데이터 조회 실패: ${res.status}`);
    }
    const data = (await res.json()) as { items?: LearningItem[] };
    return data.items ?? [];
  },
};


// 교사 "회원 오답 현황": 학생이 전화관리 앱에서 실제로 푼 표현과 결과(저장된 통화 기록 기준).
export type CallReviewPractice = {
  configured: boolean;
  calls?: number;
  practiced?: number;
  wrong?: number;
  skipped?: number;
  words?: number;
  sentences?: number;
  items?: {
    answerEn: string;
    promptKo: string;
    sourceType: "word" | "sentence";
    outcome: "correct" | "retry" | "skipped";
    learnerAnswer?: string;
    lastPracticedAt: string;
    times: number;
  }[];
};

export async function getCallReviewPractice(customerNo: string): Promise<CallReviewPractice> {
  const res = await fetch(`/api/study/call-review-practice?customerNo=${encodeURIComponent(customerNo)}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`통화 학습 기록 조회 실패: ${res.status}`);
  }
  return (await res.json()) as CallReviewPractice;
}
