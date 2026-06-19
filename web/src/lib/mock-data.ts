import type { QuizSession, StudentProfile } from "./types";

export const demoStudent: StudentProfile = {
  id: "student-1111",
  name: "민준",
  memberId: "1111",
  level: "Smart E2",
  campus: "분당센터",
};

export const demoSessions: QuizSession[] = [
  {
    id: "session-20260616-1111",
    studentId: demoStudent.id,
    studentName: demoStudent.name,
    totalItems: 5,
    completedItems: 5,
    score: 86,
    createdAt: "2026-06-16T16:15:00+09:00",
    completedAt: "2026-06-16T16:24:00+09:00",
    results: [
      {
        itemId: "past-word-1",
        sourceType: "word",
        sourceLabel: "단어",
        question: "arrive",
        answer: "arrive",
        status: "Perfect",
        attempts: 1,
      },
      {
        itemId: "past-sentence-1",
        sourceType: "sentence",
        sourceLabel: "문장",
        question: "I went to school by bus.",
        answer: "I went to school by bus.",
        status: "Good",
        attempts: 2,
      },
    ],
  },
  {
    id: "session-20260615-1111",
    studentId: demoStudent.id,
    studentName: demoStudent.name,
    totalItems: 4,
    completedItems: 4,
    score: 75,
    createdAt: "2026-06-15T15:40:00+09:00",
    completedAt: "2026-06-15T15:48:00+09:00",
    results: [
      {
        itemId: "past-word-2",
        sourceType: "word",
        sourceLabel: "단어",
        question: "market",
        answer: "market",
        status: "Good",
        attempts: 2,
      },
      {
        itemId: "past-assessment-1",
        sourceType: "assessment",
        sourceLabel: "평가",
        question: "Does she like music?",
        answer: "Does she like music?",
        status: "Not mastered",
        attempts: 3,
      },
    ],
  },
];
