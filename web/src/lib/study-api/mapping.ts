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

// 평가 정답이 보기번호("3")·기호("X")처럼 substance만으로 문제를 복원할 수 없는 형태인지.
// 이런 항목은 출제가 불가능하므로 skip한다. (문장/단어형 정답은 출제 가능)
function isBareChoiceAnswer(answer: string): boolean {
  const a = answer.trim();
  return /^[0-9]+$/.test(a) || a.length <= 1;
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

function hasHangul(text?: string): boolean {
  return HANGUL.test(text ?? "");
}

// 단어 시험 방향은 교재마다 다르다. 영→한 시험은 question=영어·meaning=한국어("America"/"미국")이고,
// 한→영 시험은 question=한국어·meaning=영어("곤충"/"insect")로 온다. 한글이 든 쪽을 뜻으로 본다.
// 둘 다 한글이면 영어 정답이 없으므로 출제하지 않는다(english가 빈 값).
export function wordEnglishAndMeaning(question?: string, meaning?: string): { english: string; meaning?: string } {
  const q = question?.trim() ?? "";
  const m = meaning?.trim() || undefined;
  if (hasHangul(q)) {
    return m && !hasHangul(m) ? { english: m, meaning: q } : { english: "", meaning: q };
  }
  return { english: q, meaning: m };
}

// dedup용 정규화 키.
function normKey(sourceType: string, answer: string): string {
  return `${sourceType}::${answer.toLowerCase().replace(/[.?!,]/g, "").replace(/\s+/g, " ").trim()}`;
}

export function mapStudyResultsToLearningItems(
  data: StudyQueryData,
  customerNoArg?: string,
  // 같은 차시 코드가 다른 학습 API에서 와도 id가 겹치지 않게 출처를 붙인다.
  idPrefix = "",
): LearningItem[] {
  const customerNo = String(customerNoArg ?? data.customerNo ?? "");
  const items: LearningItem[] = [];

  for (const entry of data.studyResults ?? []) {
    const unitName = unitLabel(entry);
    const wrongAt = entry.studyDateTime ?? data.studyDate ?? data.studyStartDate ?? "";
    const key = `${idPrefix}${entryKey(customerNo, entry)}`;

    // 단어 (smart-befly wordResults)
    (entry.wordResults ?? []).forEach((w, i) => {
      if (!isWrong(w.isCorrect)) return;
      const { english, meaning } = wordEnglishAndMeaning(w.question, w.meaning);
      items.push({
        id: `word-${key}-${w.order ?? i}`,
        studentId: customerNo,
        sourceType: "word",
        sourceLabel: "단어",
        unitName,
        promptKo: meaning ? `"${meaning}"을(를) 영어로 써봐.` : "이 단어를 영어로 써봐.",
        answerEn: english,
        meaningKo: meaning,
        wrongAt,
      });
    });

    // 문장 (smart-befly sentenceResults)
    (entry.sentenceResults ?? []).forEach((s, i) => {
      if (!isWrong(s.isCorrect)) return;
      // 정답이 한국어인 문장(해석 쓰기 등)은 영어로 다시 말하는 복습을 낼 수 없다.
      if (hasHangul(s.correctAnswer)) return;
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
        // substance만으로 문제 복원이 안 되는 보기번호형 정답은 skip.
        if (isBareChoiceAnswer(a.correctAnswer ?? "")) return;
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

  // 정답 텍스트가 비어있는 항목 제외 + 같은 오답(영역+정답) 중복 제거.
  // 여러 차시에서 틀렸다면 가장 최근에 학습한 차시를 남긴다(전화관리 출제가 최근 학습 시각을 본다).
  const byKey = new Map<string, number>();
  const deduped: LearningItem[] = [];
  for (const item of items) {
    if (item.answerEn.trim().length === 0) continue;
    const k = normKey(item.sourceType, item.answerEn);
    const index = byKey.get(k);
    if (index === undefined) {
      byKey.set(k, deduped.length);
      deduped.push(item);
    } else if (item.wrongAt > deduped[index]!.wrongAt) {
      deduped[index] = item;
    }
  }
  return deduped;
}
