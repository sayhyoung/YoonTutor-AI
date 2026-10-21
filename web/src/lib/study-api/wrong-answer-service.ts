import { callOpenAiText, isOpenAiEnabled } from "../openai";
import type { LearningItem } from "../types";
import { mapStudyResultsToLearningItems } from "./mapping";
import { authedStudyFetch } from "./server-fetch";
import { type StudyQueryData, learningSourcesForBms } from "./types";

const MAX_RANGE_DAYS = 365;

export type WrongAnswerQuery = {
  customerNo: string;
  from?: string | null;
  to?: string | null;
  sources?: "all" | "word-sentence";
  // 회원의 BM 목록. 학원(숲·IGSE)이면 학원 학습 API를 조회한다. 모르면 둘 다 조회.
  bms?: (string | null | undefined)[];
  // 기본은 쿠키 토큰 호출. 모바일 Bearer 토큰 요청은 자체 fetcher를 넘긴다.
  fetcher?: <T>(path: string) => Promise<T>;
};

export type WrongAnswerResult = {
  items: LearningItem[];
  studyStartDate: string;
  studyEndDate: string;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value) => value != null && value.trim() !== "")?.trim();
}

async function fillKoreanMeanings(items: LearningItem[]): Promise<void> {
  if (!isOpenAiEnabled()) return;
  const needsMeaning = items.filter(
    (item) => !item.meaningKo && item.answerEn.trim().length > 0,
  );
  if (needsMeaning.length === 0) return;

  try {
    const prompt = [
      "다음 영어 단어/문장 각각을 자연스러운 한국어로 번역해줘.",
      "설명 없이, 입력 순서 그대로 한국어 번역만 JSON 문자열 배열로 답해.",
      JSON.stringify(needsMeaning.map((item) => item.answerEn)),
    ].join("\n");
    const raw = await callOpenAiText(prompt, 700);
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) return;

    const translations = JSON.parse(raw.slice(start, end + 1)) as string[];
    needsMeaning.forEach((item, index) => {
      if (translations[index]) item.meaningKo = String(translations[index]).trim();
    });
  } catch {
    // 번역 실패는 학습 데이터 조회 자체를 막지 않는다.
  }
}

function resolveDateRange(from?: string | null, to?: string | null) {
  const lookbackDays = Number(process.env.STUDY_API_LOOKBACK_DAYS ?? "90") || 90;
  const today = toIsoDate(new Date());
  let studyEndDate =
    firstNonEmpty(
      to,
      process.env.STUDY_API_DEMO_END,
      process.env.STUDY_API_DEMO_DATE,
    ) ?? today;
  let studyStartDate =
    firstNonEmpty(
      from,
      process.env.STUDY_API_DEMO_START,
      process.env.STUDY_API_DEMO_DATE,
    ) ?? shiftDays(studyEndDate, -lookbackDays);

  if (studyStartDate > studyEndDate) {
    [studyStartDate, studyEndDate] = [studyEndDate, studyStartDate];
  }
  if (shiftDays(studyStartDate, MAX_RANGE_DAYS) < studyEndDate) {
    studyStartDate = shiftDays(studyEndDate, -MAX_RANGE_DAYS);
  }

  return { studyStartDate, studyEndDate };
}

export async function loadWrongAnswerItems({
  customerNo,
  from,
  to,
  sources = "all",
  bms,
  fetcher = authedStudyFetch,
}: WrongAnswerQuery): Promise<WrongAnswerResult> {
  const { studyStartDate, studyEndDate } = resolveDateRange(from, to);
  const query = `studyStartDate=${encodeURIComponent(
    studyStartDate,
  )}&studyEndDate=${encodeURIComponent(studyEndDate)}&customerNo=${encodeURIComponent(
    customerNo,
  )}`;
  const learning = learningSourcesForBms(bms);
  const endpoints: { path: string; idPrefix: string }[] = [];
  if (learning.smartBefly) {
    endpoints.push({ path: `/api/study/results/smart-befly/range?${query}`, idPrefix: "" });
  }
  if (learning.academy) {
    endpoints.push({ path: `/api/study/results/academy/range?${query}`, idPrefix: "academy-" });
  }
  // 4skill은 BM과 관계없이 전 BM 공통 API다(평가 포함 웹 POC 전용).
  if (sources === "all") {
    endpoints.push({ path: `/api/study/results/4skill-befly/range?${query}`, idPrefix: "" });
  }

  const items: LearningItem[] = [];
  let lastError: unknown = null;

  // refresh token rotation 경합을 피하기 위해 두 조회는 순차 실행한다.
  for (const { path, idPrefix } of endpoints) {
    try {
      const data = await fetcher<StudyQueryData>(path);
      if (data) {
        const mapped = mapStudyResultsToLearningItems(data, customerNo, idPrefix);
        items.push(
          ...mapped.filter(
            (item) => sources === "all" || item.sourceType !== "assessment",
          ),
        );
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (items.length === 0 && lastError) throw lastError;

  // 여러 학습 API에서 같은 오답(영역+정답)이 오면 처음 것만 남긴다.
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${item.sourceType}::${item.answerEn.toLowerCase().replace(/[.?!,]/g, "").replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await fillKoreanMeanings(unique);
  const order: Record<string, number> = { word: 0, sentence: 1, assessment: 2 };
  unique.sort((a, b) => (order[a.sourceType] ?? 9) - (order[b.sourceType] ?? 9));

  return { items: unique, studyStartDate, studyEndDate };
}
