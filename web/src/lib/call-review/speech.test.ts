import { afterEach, describe, expect, it, vi } from "vitest";

import {
  audioFileName,
  azureSsml,
  cleanSpeechHints,
  isTtsConfigured,
  pcmToWav,
  toWav,
  transcribeWithAzure,
  ttsVoiceKey,
} from "./speech";

describe("Beppli voice (TTS)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("escapes SSML special characters in the sentence", () => {
    const ssml = azureSsml(`Tom & Jerry's "<cat>"`, "en-US-AnaNeural", "-5%", "-5%");
    expect(ssml).toContain("Tom &amp; Jerry&apos;s &quot;&lt;cat&gt;&quot;");
    expect(ssml).toContain('<voice name="en-US-AnaNeural"><prosody pitch="-5%" rate="-5%">');
  });

  it("reads English with the Azure child voice when Azure is configured", () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "test-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "koreacentral");
    vi.stubEnv("CALL_REVIEW_TTS", "");
    vi.stubEnv("AZURE_TTS_VOICE", "");
    vi.stubEnv("AZURE_TTS_PITCH", "");
    vi.stubEnv("AZURE_TTS_RATE", "");
    vi.stubEnv("GEMINI_TTS_VOICE", "");
    expect(isTtsConfigured()).toBe(true);
    expect(ttsVoiceKey("en")).toBe("azure:en-US-AnaNeural:-5%:-5%");
    expect(ttsVoiceKey("ko")).toBe("gemini:Kore");
  });

  it("falls back to the Gemini voice when switched off or Azure is missing", () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "test-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "koreacentral");
    vi.stubEnv("CALL_REVIEW_TTS", "gemini");
    vi.stubEnv("GEMINI_TTS_VOICE", "");
    expect(ttsVoiceKey("en")).toBe("gemini:Kore");
    vi.stubEnv("CALL_REVIEW_TTS", "");
    vi.stubEnv("AZURE_SPEECH_REGION", "");
    expect(ttsVoiceKey("en")).toBe("gemini:Kore");
  });
});

describe("speech helpers", () => {
  it("wraps 16-bit PCM in a valid WAV header", () => {
    const pcm = Buffer.alloc(48000); // 1초, 24kHz mono 16-bit
    const wav = pcmToWav(pcm, 24000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt32LE(40)).toBe(48000);
    expect(wav.length).toBe(44 + 48000);
  });

  it("passes finished WAV through untouched and wraps raw PCM", () => {
    // 3.8 모델처럼 data 뒤에 다른 청크가 붙은 WAV
    const wav = Buffer.concat([pcmToWav(Buffer.alloc(4800), 24000), Buffer.from("C2PA"), Buffer.alloc(12)]);
    expect(toWav(wav, "audio/wav")).toBe(wav);
    const wrapped = toWav(Buffer.alloc(3200), "audio/L16;codec=pcm;rate=16000");
    expect(wrapped.readUInt32LE(24)).toBe(16000);
    expect(wrapped.length).toBe(44 + 3200);
  });

  it("names uploads by recorded type", () => {
    expect(audioFileName("audio/aac")).toBe("answer.aac");
    expect(audioFileName("audio/wav")).toBe("answer.wav");
    expect(audioFileName("audio/webm;codecs=opus")).toBe("answer.webm");
    expect(audioFileName("audio/mp4")).toBe("answer.m4a");
  });
});

describe("speech hints (STT)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps short English hints only, without duplicates", () => {
    expect(cleanSpeechHints(["insect", " insect ", "사과", "", 3, "I'm  good at\ndrawing.", "x".repeat(200)])).toEqual([
      "insect",
      "I'm good at drawing.",
    ]);
    expect(cleanSpeechHints(Array.from({ length: 20 }, (_, index) => `word${index}`))).toHaveLength(10);
  });

  function stubAzure(responses: Response[]) {
    vi.stubEnv("AZURE_SPEECH_KEY", "test-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "koreacentral");
    vi.stubEnv("AZURE_SPEECH_ENDPOINT", "");
    const definitions: Record<string, unknown>[] = [];
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        urls.push(url);
        definitions.push(JSON.parse(String((init.body as FormData).get("definition"))));
        return responses.shift()!;
      }),
    );
    return { definitions, urls };
  }

  const ok = (text: string) => new Response(JSON.stringify({ combinedPhrases: [{ text }] }), { status: 200 });

  it("sends the expected answers as a phrase list on the 2025-10-15 API", async () => {
    const { definitions, urls } = stubAzure([ok("I'm good at drawing.")]);
    const text = await transcribeWithAzure(new Blob(["a"]), "answer.aac", "en", ["I'm good at drawing.", "drawing"]);
    expect(text).toBe("I'm good at drawing.");
    expect(urls[0]).toContain("api-version=2025-10-15");
    expect(definitions[0]).toMatchObject({ locales: ["en-US"], phraseList: { phrases: ["I'm good at drawing.", "drawing"] } });
  });

  it("leaves the phrase list out without hints and retries without it when Azure rejects it", async () => {
    const plain = stubAzure([ok("Hello.")]);
    await transcribeWithAzure(new Blob(["a"]), "answer.aac", "en");
    expect(plain.definitions[0]).not.toHaveProperty("phraseList");

    const rejected = stubAzure([new Response("{}", { status: 400 }), ok("Hello.")]);
    expect(await transcribeWithAzure(new Blob(["a"]), "answer.aac", "en", ["Hello."])).toBe("Hello.");
    expect(rejected.definitions).toHaveLength(2);
    expect(rejected.definitions[1]).not.toHaveProperty("phraseList");
  });
});
