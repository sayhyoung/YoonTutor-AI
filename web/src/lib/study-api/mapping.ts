// study-api 학습조회 응답 → 앱 LearningItem[] 매핑.
// 오답(isCorrect === false)만 복습 대상으로 추린다. (구글시트 정답여부=='X' 대응)

import type { LearningItem } from "../types";
import type { ChoiceResult, StudyQueryData, StudyResultEntry } from "./types";

function unitLabel(entry: StudyResultEntry): string {
  const book = entry.bookName ?? entry.productName ?? entry.seriesName ?? "학습";
  const lesson = entry.lessonName ?? entry.studyUnitCode;
  return lesson ? `${book} · ${lesson}` : book;
}

function entryKey(customerNo: string, entry: StudyResultEntry): string {
  return `${customerNo}-${entry.studyUnitCode ?? entry.lessonName ?? entry.studyDateTime ?? "lesson"}`;
}

// isCorrect가 명시적으로 false인 경우만 오답으로 본다.
function isWrong(isCorrect?: boolean): boolean {
  return isCorrect === false;
}

export function mapStudyResultsToLearningItems(
  data: StudyQueryData,
  customerNoArg?: string,
): LearningItem[] {
  const customerNo = String(customerNoArg ?? data.customerNo ?? "");
  const items: LearningItem[] = [];

  for (const entry of data.studyResults ?? []) {
    const unitName = unitLabel(entry);
    const wrongAt = entry.studyDateTime ?? data.studyDate ?? data.studyStartDate ?? "";
    const key = entryKey(customerNo, entry);

    // 단어 (smart-befly wordResults)
    (entry.wordResults ?? []).forEach((w, i) => {
      if (!isWrong(w.isCorrect)) return;
      items.push({
        id: `word-${key}-${w.order ?? i}`,
        studentId: customerNo,
        sourceType: "word",
        sourceLabel: "단어",
        unitName,
        promptKo: w.meaning ? `"${w.meaning}"을(를) 영어로 써봐.` : "이 단어를 영어로 써봐.",
        answerEn: w.question ?? "",
        meaningKo: w.meaning,
        wrongAt,
      });
    });

    // 문장 (smart-befly sentenceResults)
    (entry.sentenceResults ?? []).forEach((s, i) => {
      if (!isWrong(s.isCorrect)) return;
      items.push({
        id: `sentence-${key}-${s.order ?? i}`,
        studentId: customerNo,
        sourceType: "sentence",
        sourceLabel: "문장",
        unitName,
        promptKo: "지난번에 틀린 문장이야. 올바른 영어 문장을 다시 써봐.",
        answerEn: s.correctAnswer ?? "",
        wrongAt,
      });
    });

    // 평가 (4skill: 듣기·읽기 / 권말평가 / 시리즈평가) — 선택형
    const assessmentGroups: Array<[string, ChoiceResult[] | undefined]> = [
      ["lr", entry.listeningReadingResults],
      ["kwon", entry.kwonAssessmentResults],
      ["series", entry.seriesAssessmentResults],
    ];
    for (const [group, arr] of assessmentGroups) {
      (arr ?? []).forEach((a, i) => {
        if (!isWrong(a.isCorrect)) return;
        items.push({
          id: `assessment-${group}-${key}-${a.order ?? i}`,
          studentId: customerNo,
          sourceType: "assessment",
          sourceLabel: "평가",
          unitName,
          promptKo: a.substance ?? "이 평가 문항의 정답을 입력해줘.",
          answerEn: a.correctAnswer ?? "",
          originalQuestion: a.substance,
          wrongAt,
        });
      });
    }

    // speakingResults(정답만 제공), writingResults(isCorrect 없음)는
    // 오답 판정 근거가 없어 현재 매핑에서 제외. 스키마 확정 시 보강.
  }

  // 정답 텍스트가 비어있는 항목은 채점이 불가능하므로 제외.
  return items.filter((item) => item.answerEn.trim().length > 0);
}
