import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadWrongAnswerItems } from "./wrong-answer-service";
import { authedStudyFetch } from "./server-fetch";

vi.mock("./server-fetch", () => ({ authedStudyFetch: vi.fn() }));
vi.mock("../openai", () => ({
  callOpenAiText: vi.fn(),
  isOpenAiEnabled: () => false,
}));

const fetchStudy = vi.mocked(authedStudyFetch);

beforeEach(() => {
  fetchStudy.mockReset();
  fetchStudy.mockResolvedValue({
    customerNo: "<CUSTOMER_NO>",
    studyResults: [
      {
        wordResults: [{ isCorrect: false, question: "habit", meaning: "습관" }],
        sentenceResults: [
          { isCorrect: false, correctAnswer: "I finished my homework." },
        ],
        listeningReadingResults: [
          { isCorrect: false, substance: "평가 문제", correctAnswer: "Choice" },
        ],
      },
    ],
  });
});

describe("loadWrongAnswerItems", () => {
  const paths = () => fetchStudy.mock.calls.map((call) => String(call[0]));

  it("keeps English as the answer whichever way the book's word test runs", async () => {
    fetchStudy.mockResolvedValue({
      customerNo: "<CUSTOMER_NO>",
      studyResults: [
        {
          wordResults: [
            { isCorrect: false, question: "habit", meaning: "습관" }, // 영→한 시험
            { isCorrect: false, question: "곤충", meaning: "insect" }, // 한→영 시험
            { isCorrect: false, question: "사과", meaning: "사과" }, // 영어 정답이 없으면 내지 않는다
          ],
          sentenceResults: [
            { isCorrect: false, correctAnswer: "나는 숙제를 끝냈다." }, // 한국어 정답 문장은 내지 않는다
          ],
        },
      ],
    });
    const result = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence", bms: ["HOME"] });

    expect(result.items.map((item) => [item.answerEn, item.meaningKo])).toEqual([
      ["habit", "습관"],
      ["insect", "곤충"],
    ]);
    expect(result.items[1]!.promptKo).toBe('"곤충"을(를) 영어로 써봐.');
  });

  it("uses correctAnswer (the book's spoken answer sentence) as the sentence to say", async () => {
    fetchStudy.mockResolvedValue({
      customerNo: "<CUSTOMER_NO>",
      studyResults: [
        {
          wordResults: [{ isCorrect: false, question: "구불구불하다", meaning: "wind (v)" }],
          sentenceResults: [
            // 화면에 빈칸·한국어 해석을 보여 주는 교재도 correctAnswer는 영어 정답 문장이다.
            { isCorrect: false, correctAnswer: " I walk the dog after school. " },
            { isCorrect: false, correctAnswer: "It`s time to go to school." },
            { isCorrect: false, correctAnswer: "I ______ the _____ after school." }, // 빈칸이 섞여 오면 내지 않는다
            { isCorrect: false, correctAnswer: "나는 하루 종일 실내에서 머물렀어요." }, // 한국어가 오면 내지 않는다
          ],
        },
      ],
    });
    const result = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence", bms: ["HOME"] });

    expect(result.items.map((item) => [item.sourceType, item.answerEn])).toEqual([
      ["word", "wind"],
      ["sentence", "I walk the dog after school."],
      ["sentence", "It`s time to go to school."],
    ]);
  });

  it("leaves out items with numbers speech recognition writes as digits from phone reviews", async () => {
    const sentences = [
      "I have two cats.", // 0~20은 앱 채점이 맞춘다
      "First, sweep the floor.", // 순서를 말하는 First,
      "More than sixty percent of teens have smartphones.",
      "It`s eight forty.",
      "The bookstore is on the second floor.",
      "My birthday is March sixteenth.",
      "It was popular in the nineteen fifties.",
      "They`re 45 dollars.",
      "Call me at five five five - six nine eight four.",
    ];
    fetchStudy.mockResolvedValue({
      customerNo: "<CUSTOMER_NO>",
      studyResults: [
        {
          wordResults: [
            { isCorrect: false, question: "habit", meaning: "습관" },
            { isCorrect: false, question: "forty", meaning: "40" },
          ],
          sentenceResults: sentences.map((correctAnswer) => ({ isCorrect: false, correctAnswer })),
        },
      ],
    });

    const phone = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence", bms: ["HOME"] });
    expect(phone.items.map((item) => item.answerEn)).toEqual(["habit", "I have two cats.", "First, sweep the floor."]);

    const web = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "all", bms: ["HOME"] });
    expect(web.items.filter((item) => item.sourceType !== "assessment")).toHaveLength(2 + sentences.length);
  });

  it("loads only word and sentence results from Smart Befly for WYC members", async () => {
    const result = await loadWrongAnswerItems({
      customerNo: "<CUSTOMER_NO>",
      sources: "word-sentence",
      bms: ["HOME"],
    });

    expect(paths()).toHaveLength(1);
    expect(paths()[0]).toContain("/smart-befly/range?");
    expect(result.items.map((item) => item.sourceType)).toEqual(["word", "sentence"]);
  });

  it("uses the academy API for FOREST and IGSE members", async () => {
    const result = await loadWrongAnswerItems({
      customerNo: "<CUSTOMER_NO>",
      sources: "word-sentence",
      bms: ["FOREST"],
    });

    expect(paths()).toHaveLength(1);
    expect(paths()[0]).toContain("/academy/range?");
    expect(result.items.every((item) => item.id.includes("academy-"))).toBe(true);
  });

  it("queries both learning APIs for members in both BM types", async () => {
    await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence", bms: ["HOME", "IGSE"] });

    expect(paths().some((path) => path.includes("/smart-befly/"))).toBe(true);
    expect(paths().some((path) => path.includes("/academy/"))).toBe(true);
  });

  it("queries both learning APIs when the BM is unknown", async () => {
    const result = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence" });

    expect(paths()).toHaveLength(2);
    // 같은 오답이 두 API에서 와도 한 번만 남는다.
    expect(result.items.map((item) => item.sourceType)).toEqual(["word", "sentence"]);
  });

  it("keeps the 4skill source for the existing web flow", async () => {
    await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", bms: ["HOME"] });

    expect(paths()).toHaveLength(2);
    expect(paths()[1]).toContain("/4skill-befly/range?");
  });

  it("still returns items when one learning API fails", async () => {
    fetchStudy.mockRejectedValueOnce(new Error("academy down"));
    const result = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence" });

    expect(result.items.length).toBeGreaterThan(0);
  });

  it("keeps the most recent lesson when the same expression was wrong in several lessons", async () => {
    fetchStudy.mockReset();
    fetchStudy.mockResolvedValue({
      customerNo: "<CUSTOMER_NO>",
      studyResults: [
        { studyDateTime: "2026-06-29T13:18:00", lessonName: "01A", sentenceResults: [{ isCorrect: false, correctAnswer: "He is from China." }] },
        { studyDateTime: "2026-07-02T09:00:00", lessonName: "02A", sentenceResults: [{ isCorrect: false, correctAnswer: "He is from China" }] },
      ],
    });
    const result = await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>", sources: "word-sentence", bms: ["HOME"] });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.wrongAt).toBe("2026-07-02T09:00:00");
  });
});
