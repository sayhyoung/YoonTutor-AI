import { describe, expect, it } from "vitest";

import {
  buildDiaryInput,
  kstDate,
  MAX_PHOTO_BASE64,
  parseDiaryComment,
  parseDiarySave,
  parseDiarySuggestions,
  parseDiarySuggestRequest,
  type StoredDiaryEntry,
  toDiaryView,
} from "./diary";

const request = { noteKo: "가족이랑 생일 케이크 먹었어", mood: "yummy" as const, photo: null, learnedWords: ["delicious", "family"] };

describe("parseDiarySuggestRequest", () => {
  it("needs a note or a photo", () => {
    expect(parseDiarySuggestRequest({ noteKo: "  " })).toEqual({ ok: false, error: "오늘 있었던 일을 쓰거나 사진을 올려 주세요." });
    expect(parseDiarySuggestRequest({ noteKo: "학교에서 축구했어" }).ok).toBe(true);
  });

  it("strips a data URL prefix and limits photo size", () => {
    const ok = parseDiarySuggestRequest({ photo: { mimeType: "image/jpeg", data: "data:image/jpeg;base64,QUJD" } });
    expect(ok.ok && ok.request.photo).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
    const big = parseDiarySuggestRequest({ photo: { mimeType: "image/jpeg", data: "A".repeat(MAX_PHOTO_BASE64 + 4) } });
    expect(big.ok).toBe(false);
    expect(parseDiarySuggestRequest({ photo: { mimeType: "image/gif", data: "QUJD" } }).ok).toBe(false);
  });

  it("keeps only plain English learned words and ignores unknown moods", () => {
    const parsed = parseDiarySuggestRequest({ noteKo: "비 왔어", mood: "angry", learnedWords: ["rain", "학교", "ice cream", 3] });
    expect(parsed.ok && parsed.request).toMatchObject({ mood: null, learnedWords: ["rain", "ice cream"] });
  });

  it("rejects notes over the limit", () => {
    expect(parseDiarySuggestRequest({ noteKo: "가".repeat(101) }).ok).toBe(false);
  });
});

describe("buildDiaryInput", () => {
  it("sends the photo as a low-detail image part", () => {
    const parts = buildDiaryInput({ ...request, photo: { data: "QUJD", mimeType: "image/png" } });
    expect(parts[0]).toMatchObject({ type: "input_text" });
    expect(parts[1]).toEqual({ type: "input_image", image_url: "data:image/png;base64,QUJD", detail: "low" });
    expect(buildDiaryInput(request)).toHaveLength(1);
  });
});

describe("parseDiarySuggestions", () => {
  it("keeps valid sentences in level order and checks the learned word", () => {
    const raw = JSON.stringify({
      suggestions: [
        { level: "challenge", sentenceEn: "I ate a delicious birthday cake with my family tonight.", meaningKo: "오늘 밤 가족과 맛있는 생일 케이크를 먹었다.", usedWord: "delicious" },
        { level: "easy", sentenceEn: "I ate cake today.", meaningKo: "오늘 케이크를 먹었다.", usedWord: "family" },
        { level: "standard", sentenceEn: "My family ate a birthday cake.", meaningKo: "우리 가족은 생일 케이크를 먹었다.", usedWord: null },
      ],
    });
    const parsed = parseDiarySuggestions(`\`\`\`json\n${raw}\n\`\`\``, request);
    expect(parsed?.map((item) => item.level)).toEqual(["easy", "standard", "challenge"]);
    // easy 문장에는 family가 없으므로 배운 단어 표시를 지운다.
    expect(parsed?.[0]?.usedWord).toBeNull();
    expect(parsed?.[2]?.usedWord).toBe("delicious");
  });

  it("returns [] when the model declines and null when the reply is broken", () => {
    expect(parseDiarySuggestions('{"suggestions": []}', request)).toEqual([]);
    expect(parseDiarySuggestions("not json", request)).toBeNull();
    const korean = JSON.stringify({
      suggestions: [
        { level: "easy", sentenceEn: "나는 케이크를 먹었다.", meaningKo: "x" },
        { level: "standard", sentenceEn: "I ate cake.", meaningKo: "케이크를 먹었다." },
      ],
    });
    expect(parseDiarySuggestions(korean, request)).toBeNull();
  });

  it("drops duplicate sentences", () => {
    const raw = JSON.stringify({
      suggestions: [
        { level: "easy", sentenceEn: "I ate cake.", meaningKo: "케이크를 먹었다." },
        { level: "standard", sentenceEn: "I ate cake!", meaningKo: "케이크를 먹었다!" },
        { level: "challenge", sentenceEn: "I ate a big cake with my mom.", meaningKo: "엄마와 큰 케이크를 먹었다." },
      ],
    });
    expect(parseDiarySuggestions(raw, request)?.map((item) => item.sentenceEn)).toEqual(["I ate cake.", "I ate a big cake with my mom."]);
  });
});

describe("parseDiarySave", () => {
  const base = { source: "text", noteKo: "축구했어", sentenceEn: "I played soccer at school.", meaningKo: "학교에서 축구를 했다.", level: "easy" };

  it("accepts a chosen sentence with practice results", () => {
    const parsed = parseDiarySave({ ...base, practice: { attempts: 2, passed: true, heard: "I played soccer at school" }, usedWord: "school" });
    expect(parsed.ok && parsed.entry).toMatchObject({ usedWord: "school", practice: { attempts: 2, passed: true } });
  });

  it("allows a photo diary without a note but not a text diary", () => {
    expect(parseDiarySave({ ...base, source: "photo", noteKo: "" }).ok).toBe(true);
    expect(parseDiarySave({ ...base, noteKo: "" }).ok).toBe(false);
    expect(parseDiarySave({ ...base, level: "hard" }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("uses the Korean date", () => {
    expect(kstDate(new Date("2026-11-18T14:59:00Z"))).toBe("2026-11-18");
    expect(kstDate(new Date("2026-11-18T15:00:00Z"))).toBe("2026-11-19");
  });

  it("hides student and teacher numbers from the view", () => {
    const entry: StoredDiaryEntry = {
      schemaVersion: 1,
      id: "2026-11-18",
      customerNo: "<CUSTOMER_NO>",
      date: "2026-11-18",
      source: "text",
      noteKo: "축구했어",
      mood: null,
      sentenceEn: "I played soccer.",
      meaningKo: "축구를 했다.",
      level: "easy",
      usedWord: null,
      practice: { attempts: 1, passed: true },
      createdAt: "2026-11-18T10:00:00.000Z",
      updatedAt: "2026-11-18T10:00:00.000Z",
      teacherComment: { body: "멋져요!", teacherName: "김윤", teacherNo: "T1", at: "2026-11-18T11:00:00.000Z" },
    };
    const view = toDiaryView(entry);
    expect(view).not.toHaveProperty("customerNo");
    expect(view.teacherComment).toEqual({ body: "멋져요!", teacherName: "김윤", at: "2026-11-18T11:00:00.000Z" });
  });

  it("limits comment length", () => {
    expect(parseDiaryComment({ comment: "  멋진 문장이에요!  " })).toBe("멋진 문장이에요!");
    expect(parseDiaryComment({ comment: "가".repeat(121) })).toBeNull();
  });
});
