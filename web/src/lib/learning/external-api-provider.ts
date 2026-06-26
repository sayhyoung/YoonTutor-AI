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
