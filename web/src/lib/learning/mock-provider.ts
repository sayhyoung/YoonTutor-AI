import type { LearningItem } from "../types";
import type { LearningProvider } from "./types";
import { demoStudent } from "../mock-data";

const demoLearningItems: LearningItem[] = [
  {
    id: "word-001",
    studentId: demoStudent.id,
    sourceType: "word",
    sourceLabel: "단어",
    unitName: "Unit 4 Daily Routines",
    promptKo: "규칙적으로 하는 일을 말할 때 쓰는 '습관'이라는 뜻의 단어를 영어로 써봐.",
    meaningKo: "습관",
    answerEn: "habit",
    wrongAt: "2026-06-17T10:20:00+09:00",
  },
  {
    id: "sentence-002",
    studentId: demoStudent.id,
    sourceType: "sentence",
    sourceLabel: "문장",
    unitName: "Unit 4 Daily Routines",
    promptKo: "'나는 보통 7시에 일어나.'를 영어 문장으로 써봐.",
    meaningKo: "나는 보통 7시에 일어나.",
    answerEn: "I usually get up at seven.",
    wrongAt: "2026-06-17T10:24:00+09:00",
  },
  {
    id: "assessment-003",
    studentId: demoStudent.id,
    sourceType: "assessment",
    sourceLabel: "평가",
    unitName: "Achievement Check",
    promptKo: "빈도부사 usually를 넣어 '그는 보통 아침을 먹어.'라는 문장을 만들어봐.",
    meaningKo: "그는 보통 아침을 먹어.",
    answerEn: "He usually eats breakfast.",
    originalQuestion: "usually를 알맞은 위치에 넣어 문장을 완성하기",
    wrongAt: "2026-06-17T10:32:00+09:00",
  },
  {
    id: "word-004",
    studentId: demoStudent.id,
    sourceType: "word",
    sourceLabel: "단어",
    unitName: "Unit 5 At Home",
    promptKo: "'서랍'이라는 뜻의 단어를 영어로 써봐.",
    meaningKo: "서랍",
    answerEn: "drawer",
    wrongAt: "2026-06-17T11:05:00+09:00",
  },
];

export const mockLearningProvider: LearningProvider = {
  async getWrongAnswerItems(studentId: string): Promise<LearningItem[]> {
    return demoLearningItems.filter((item) => item.studentId === studentId);
  },
};
