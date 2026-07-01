export type SourceType = "word" | "sentence" | "assessment";

export type MasteryStatus = "Perfect" | "Good" | "Not mastered";

export type UserRole = "student" | "teacher";

export type AppUser = {
  uid: string;
  role: UserRole;
  studentId?: string;
  memberId?: string;
  displayName: string;
};

export type StudentProfile = {
  id: string;
  uid?: string;
  name: string;
  memberId: string;
  level: string;
  campus: string;
};

export type LearningItem = {
  id: string;
  studentId: string;
  sourceType: SourceType;
  sourceLabel: string;
  unitName: string;
  promptKo: string;
  answerEn: string;
  meaningKo?: string;
  originalQuestion?: string;
  wrongAt: string;
};

export type ChatMessage = {
  id: string;
  role: "assistant" | "student";
  content: string;
  createdAt: string;
  status?: MasteryStatus;
};

export type Attempt = {
  id: string;
  uid?: string;
  sessionId?: string;
  itemId: string;
  answer: string;
  feedback: string;
  status?: MasteryStatus;
  attemptNumber: number;
  createdAt: string;
};

export type LearningSource = "mock" | "external-api";

export type QuizSession = {
  id: string;
  uid?: string;
  studentId: string;
  memberId?: string;
  studentName: string;
  source?: LearningSource;
  totalItems: number;
  completedItems: number;
  score: number;
  results: SessionResult[];
  coachComment?: string; // 세션 종료 시 AI 코치가 생성한 총평(3~4문장).
  createdAt: string;
  completedAt?: string;
};

export type SessionResult = {
  itemId: string;
  sourceType: SourceType;
  sourceLabel: string;
  question: string;
  answer: string;
  status: MasteryStatus;
  attempts: number;
};

export type TutorResponse = {
  reply: string;
  status?: MasteryStatus;
  countsAsAttempt: boolean;
};
