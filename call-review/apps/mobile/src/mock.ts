import type {
  CallHistoryEntry,
  CallReport,
  FreeTalkPlan,
  LearningHistoryItem,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import { buildCallPlanFromLearningItems } from "@yoon-call/shared";

const previewLearningItems: LearningHistoryItem[] = [
  {
    id: "target-1",
    studentId: "preview-student",
    sourceType: "word",
    sourceLabel: "단어 복습",
    promptKo: "습관",
    answerEn: "habit",
    hint: "첫소리는 h야. 매일 반복하는 행동을 떠올려봐.",
  },
  {
    id: "target-2",
    studentId: "preview-student",
    sourceType: "sentence",
    sourceLabel: "문장 복습",
    promptKo: "나는 숙제를 끝냈어.",
    answerEn: "I finished my homework.",
    hint: "finish를 과거형으로 바꿔서 말해봐.",
  },
  {
    id: "target-3",
    studentId: "preview-student",
    sourceType: "assessment",
    sourceLabel: "표현 복습",
    promptKo: "한번 확인해 볼게.",
    answerEn: "Let me check.",
    hint: "Let me로 시작하는 짧은 표현이야.",
  },
];

const previewFreeTalk: FreeTalkPlan = {
    maxTurns: 3,
    idleStopSeconds: 20,
    turns: [
      {
        id: "talk-1",
        relatedExpression: "homework",
        questionEn: "Do you have homework from school today?",
        questionMeaningKo: "오늘 학교에서 내준 숙제가 있니?",
        answerHint: "Yes, I do. 또는 No, I don’t.로 시작해도 좋아.",
        previewVoiceAnswer: "Yes, I have math homework today.",
        choices: [
          { id: "talk-1-a", answerEn: "Yes, I do.", meaningKo: "응, 있어." },
          { id: "talk-1-b", answerEn: "No, I don’t.", meaningKo: "아니, 없어." },
          { id: "talk-1-c", answerEn: "I have math homework.", meaningKo: "수학 숙제가 있어." },
        ],
      },
      {
        id: "talk-2",
        relatedExpression: "finished my homework",
        questionEn: "Which homework will you finish first?",
        questionMeaningKo: "어떤 숙제를 먼저 끝낼 거야?",
        answerHint: "I’ll finish… first.로 답해봐.",
        previewVoiceAnswer: "I’ll finish my math homework first.",
        choices: [
          { id: "talk-2-a", answerEn: "I’ll finish math first.", meaningKo: "수학을 먼저 끝낼 거야." },
          { id: "talk-2-b", answerEn: "I’ll finish English first.", meaningKo: "영어를 먼저 끝낼 거야." },
          { id: "talk-2-c", answerEn: "I already finished it.", meaningKo: "이미 끝냈어." },
        ],
      },
      {
        id: "talk-3",
        relatedExpression: "habit",
        questionEn: "Is doing homework after dinner your habit?",
        questionMeaningKo: "저녁을 먹고 숙제하는 게 네 습관이니?",
        answerHint: "It’s my habit. 또는 I usually…로 말해봐.",
        previewVoiceAnswer: "Yes, it’s my habit.",
        choices: [
          { id: "talk-3-a", answerEn: "Yes, it’s my habit.", meaningKo: "응, 내 습관이야." },
          { id: "talk-3-b", answerEn: "No, I do it before dinner.", meaningKo: "아니, 저녁 전에 해." },
          { id: "talk-3-c", answerEn: "I usually do it at night.", meaningKo: "보통 밤에 해." },
        ],
      },
    ],
};

export const previewPlan = buildCallPlanFromLearningItems({
  id: "preview-call",
  studentId: "preview-student",
  scheduledAtLabel: "오늘 오후 7:30",
  items: previewLearningItems,
  freeTalk: previewFreeTalk,
});

export const previewReport: CallReport = {
  callId: "preview-call",
  studentId: "preview-student",
  completedAtLabel: "오늘",
  reviewedCount: 3,
  needsReviewCount: 1,
  expressions: ["habit", "I finished my homework.", "Let me check."],
  coachComment:
    "오늘은 과거형 문장을 차분하게 완성했어. 다음 전화에서는 Let me로 시작하는 표현을 한 번 더 써보자.",
};

export const previewSchedule: TeacherScheduleSettings = {
  studentLabel: "학생 A",
  weekdays: ["화", "목"],
  time: "19:30",
  callsPerWeek: 2,
  reminderMinutesBefore: 10,
  managedBy: "teacher",
};

export const previewHistory: CallHistoryEntry[] = [
  {
    id: "history-1",
    completedAtLabel: "9월 18일",
    focusLabel: "과거형 문장",
    resultLabel: "표현 3개 복습",
    expressions: ["finished", "homework", "Let me check."],
  },
  {
    id: "history-2",
    completedAtLabel: "9월 16일",
    focusLabel: "학교생활 어휘",
    resultLabel: "표현 2개 복습",
    expressions: ["classmate", "after school"],
  },
  {
    id: "history-3",
    completedAtLabel: "9월 11일",
    focusLabel: "습관 말하기",
    resultLabel: "짧은 대화 완료",
    expressions: ["usually", "every day", "habit"],
  },
];
