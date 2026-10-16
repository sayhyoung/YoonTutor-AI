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
  it("loads only word and sentence results for call review", async () => {
    const result = await loadWrongAnswerItems({
      customerNo: "<CUSTOMER_NO>",
      sources: "word-sentence",
    });

    expect(fetchStudy).toHaveBeenCalledTimes(1);
    expect(fetchStudy.mock.calls[0][0]).toContain("/smart-befly/range?");
    expect(result.items.map((item) => item.sourceType)).toEqual(["word", "sentence"]);
  });

  it("keeps both study sources for the existing web flow", async () => {
    await loadWrongAnswerItems({ customerNo: "<CUSTOMER_NO>" });

    expect(fetchStudy).toHaveBeenCalledTimes(2);
    expect(fetchStudy.mock.calls[1][0]).toContain("/4skill-befly/range?");
  });
});
