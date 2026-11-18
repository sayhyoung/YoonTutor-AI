import type {
  CallHistoryEntry,
  CallReport,
  DiaryEntry,
  DiaryMood,
  FreeTalkPlan,
  LearningHistoryItem,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import { buildCallPlanFromLearningItems } from "@yoon-call/shared";

import type { DiarySuggestion } from "./callReviewApi";

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
    sourceType: "sentence",
    sourceLabel: "문장 복습",
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
    "오늘은 과거형 문장을 차분하게 완성했어. 다음 전화에서는 Let me로 시작하는 문장을 한 번 더 써보자.",
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
    report: {
      endedAt: "2026-09-18T19:10:00+09:00",
      finishReason: "completed",
      reviewedCount: 3,
      targets: [
        { id: "h1-1", sourceLabel: "단어 복습", promptKo: "끝냈다", answerEn: "finished", outcome: "correct" },
        { id: "h1-2", sourceLabel: "단어 복습", promptKo: "숙제", answerEn: "homework", outcome: "retry", learnerAnswer: "home work" },
        { id: "h1-3", sourceLabel: "문장 복습", promptKo: "확인해 볼게요.", answerEn: "Let me check.", outcome: "correct" },
      ],
      conversation: [
        { questionEn: "Did you finish your homework today?", answer: "I finished my homework." },
        { questionEn: "What did you do after school?", answer: "I played soccer." },
      ],
    },
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

// 프리뷰 일기장: 어제 쓴 일기 하나(선생님 댓글이 달려 있음).
function previewDay(daysAgo: number) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const previewDiary: DiaryEntry[] = [
  {
    id: previewDay(1),
    date: previewDay(1),
    source: "text",
    noteKo: "학교 끝나고 친구랑 떡볶이 먹었는데 너무 매웠어",
    mood: "yummy",
    sentenceEn: "After school, I ate tteokbokki with my friend.",
    meaningKo: "학교 끝나고 친구랑 떡볶이를 먹었다.",
    level: "standard",
    usedWord: "school",
    practice: { attempts: 2, passed: true },
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    teacherComment: {
      body: "떡볶이 정말 맛있었겠다! After school을 잘 썼어요.",
      teacherName: "김윤",
      at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  },
];

// 프리뷰 문장 추천(서버 AI 대신). 기분·사진 여부로 고른다.
export function previewDiarySuggestions(mood: DiaryMood | null, photo: boolean): DiarySuggestion[] {
  if (photo) {
    return [
      { level: "easy", sentenceEn: "I ate a big cake.", meaningKo: "큰 케이크를 먹었다.", usedWord: null },
      { level: "standard", sentenceEn: "I ate a birthday cake with my family.", meaningKo: "가족과 생일 케이크를 먹었다.", usedWord: null },
      {
        level: "challenge",
        sentenceEn: "My family had a birthday party, and the cake was so sweet.",
        meaningKo: "가족과 생일 파티를 했는데 케이크가 정말 달았다.",
        usedWord: null,
      },
    ];
  }
  if (mood === "tired" || mood === "sad") {
    return [
      { level: "easy", sentenceEn: "I was tired today.", meaningKo: "오늘은 피곤했다.", usedWord: null },
      { level: "standard", sentenceEn: "I had a long day at school.", meaningKo: "학교에서 긴 하루를 보냈다.", usedWord: null },
      {
        level: "challenge",
        sentenceEn: "I was tired after school, so I went to bed early.",
        meaningKo: "학교가 끝나고 피곤해서 일찍 잤다.",
        usedWord: null,
      },
    ];
  }
  return [
    { level: "easy", sentenceEn: "I played soccer today.", meaningKo: "오늘 축구를 했다.", usedWord: null },
    { level: "standard", sentenceEn: "I played soccer with my friends after school.", meaningKo: "학교가 끝나고 친구들과 축구를 했다.", usedWord: null },
    {
      level: "challenge",
      sentenceEn: "We played soccer after school, and I scored a goal!",
      meaningKo: "학교가 끝나고 축구를 했는데 내가 골을 넣었다!",
      usedWord: null,
    },
  ];
}
