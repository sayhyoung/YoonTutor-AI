import { afterEach, describe, expect, it, vi } from "vitest";

import { audioFileName, azureSsml, isTtsConfigured, pcmToWav, toWav, ttsVoiceKey } from "./speech";

describe("Beppli voice (TTS)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("escapes SSML special characters in the sentence", () => {
    const ssml = azureSsml(`Tom & Jerry's "<cat>"`, "en-US-AnaNeural", "-8%");
    expect(ssml).toContain("Tom &amp; Jerry&apos;s &quot;&lt;cat&gt;&quot;");
    expect(ssml).toContain('<voice name="en-US-AnaNeural"><prosody pitch="-8%">');
  });

  it("reads English with the Azure child voice when Azure is configured", () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "test-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "koreacentral");
    vi.stubEnv("CALL_REVIEW_TTS", "");
    vi.stubEnv("AZURE_TTS_VOICE", "");
    vi.stubEnv("AZURE_TTS_PITCH", "");
    vi.stubEnv("GEMINI_TTS_VOICE", "");
    expect(isTtsConfigured()).toBe(true);
    expect(ttsVoiceKey("en")).toBe("azure:en-US-AnaNeural:-8%");
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
