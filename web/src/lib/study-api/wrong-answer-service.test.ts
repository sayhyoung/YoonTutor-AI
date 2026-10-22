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
