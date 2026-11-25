// 전화관리 음성 처리(서버 전용).
// - 음성 인식(STT): Azure Speech Fast Transcription. 설정이 없으면 OpenAI 음성 인식으로 대신한다.
// - 읽어 주기(TTS): 영어는 Azure 어린이 목소리(베플리), 그 밖에는 Gemini TTS.
//   설정이 없거나 실패하면 앱이 기기 음성으로 읽는다.
// 키는 환경변수에서만 읽고, 오디오·텍스트는 로깅하지 않는다.

export type SpeechLanguage = "en" | "ko";

// ---- STT ----

export function isAzureSttConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY && (process.env.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_ENDPOINT));
}

function azureTranscribeUrl(): string {
  const base =
    process.env.AZURE_SPEECH_ENDPOINT?.replace(/\/+$/, "") ??
    `https://${process.env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com`;
  // 2025-10-15부터 구문 목록(phraseList)을 받는다. 2024-11-15에 보내면 400(Invalid JSON format)이다.
  return `${base}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;
}

type AzureFastTranscription = { combinedPhrases?: { text?: string }[] };

// 앱이 보낸 정답 힌트(기대하는 답)를 정리한다. 영어 글자가 있는 짧은 구만, 개수·길이를 제한한다.
// 구문 목록은 추가 요금이 없다(Azure 요금표의 부가 기능에 없음).
const MAX_HINTS = 10;
const MAX_HINT_LENGTH = 160;
const MAX_HINT_TOTAL = 800;

export function cleanSpeechHints(values: unknown[]): string[] {
  const hints: string[] = [];
  let total = 0;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const hint = value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    if (!hint || hint.length > MAX_HINT_LENGTH || !/[A-Za-z]/.test(hint) || /[가-힣]/.test(hint)) continue;
    if (hints.includes(hint) || total + hint.length > MAX_HINT_TOTAL) continue;
    hints.push(hint);
    total += hint.length;
    if (hints.length >= MAX_HINTS) break;
  }
  return hints;
}

async function requestAzureTranscription(audio: Blob, fileName: string, definition: Record<string, unknown>): Promise<Response> {
  const form = new FormData();
  form.append("audio", audio, fileName);
  form.append("definition", JSON.stringify(definition));
  return fetch(azureTranscribeUrl(), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "" },
    body: form,
  });
}

// language: 학생 영어 답변은 en, 영어 일기의 "오늘 있었던 일" 말하기는 ko.
// hints: 학생이 말할 것으로 기대하는 답(복습 정답, 대화 답 예시). 아이 발음도 정답 쪽으로 알아듣게 한다.
export async function transcribeWithAzure(
  audio: Blob,
  fileName: string,
  language: SpeechLanguage = "en",
  hints: string[] = [],
): Promise<string> {
  const definition: Record<string, unknown> = { locales: [language === "ko" ? "ko-KR" : "en-US"], profanityFilterMode: "Masked" };
  let response = await requestAzureTranscription(
    audio,
    fileName,
    hints.length > 0 ? { ...definition, phraseList: { phrases: hints } } : definition,
  );
  // 힌트 때문에 거절되면(형식 변경 등) 힌트 없이 한 번 더 알아듣는다. 학생 답을 놓치지 않는 게 먼저다.
  if (response.status === 400 && hints.length > 0) {
    console.warn("[stt] 정답 힌트를 Azure가 거절해 힌트 없이 다시 보냄");
    response = await requestAzureTranscription(audio, fileName, definition);
  }
  if (!response.ok) throw new Error(`Azure STT ${response.status}`);
  const data = (await response.json()) as AzureFastTranscription;
  return (data.combinedPhrases ?? []).map((phrase) => phrase.text ?? "").join(" ").trim();
}

export async function transcribeWithOpenAi(
  audio: Blob,
  fileName: string,
  language: SpeechLanguage = "en",
  hints: string[] = [],
): Promise<string> {
  const form = new FormData();
  form.append("file", audio, fileName);
  form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  form.append("language", language);
  // OpenAI는 구문 목록 대신 prompt에 기대하는 말을 적어 철자·단어를 그쪽으로 맞춘다.
  if (hints.length > 0) form.append("prompt", hints.join(" / "));
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!response.ok) throw new Error(`OpenAI STT ${response.status}`);
  const data = (await response.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export function audioFileName(type: string): string {
  if (type.includes("webm")) return "answer.webm";
  if (type.includes("wav")) return "answer.wav";
  if (type.includes("aac")) return "answer.aac";
  if (type.includes("ogg") || type.includes("opus")) return "answer.ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "answer.mp3";
  return "answer.m4a";
}

// ---- TTS ----

// 베플리는 아이 캐릭터라 Azure 어린이 목소리(en-US-AnaNeural)를 음만 조금 낮춰 소년처럼 쓴다.
// 음을 -8%까지 낮추니 발음이 조금 뭉개진다는 의견이 있어(2026-11-25) 음을 덜 낮추고(-5%) 조금 천천히(-5%) 읽는다.
// 목소리·높이·빠르기는 AZURE_TTS_VOICE·AZURE_TTS_PITCH·AZURE_TTS_RATE로 바꾸고, CALL_REVIEW_TTS=gemini면 예전 목소리(Gemini)로 돌아간다.
export const AZURE_TTS_VOICE_DEFAULT = "en-US-AnaNeural";
export const AZURE_TTS_PITCH_DEFAULT = "-5%";
export const AZURE_TTS_RATE_DEFAULT = "-5%";

export function isAzureTtsConfigured(): boolean {
  return process.env.CALL_REVIEW_TTS !== "gemini" && Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

export function isGeminiTtsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function isTtsConfigured(): boolean {
  return isAzureTtsConfigured() || isGeminiTtsConfigured();
}

// 영어만 Azure로 읽는다(영어 목소리라 한국어는 어색하다). 한국어는 Gemini가 문장에서 언어를 알아낸다.
function usesAzure(language: SpeechLanguage): boolean {
  return language === "en" && isAzureTtsConfigured();
}

function azureVoice() {
  return {
    voice: process.env.AZURE_TTS_VOICE || AZURE_TTS_VOICE_DEFAULT,
    pitch: process.env.AZURE_TTS_PITCH || AZURE_TTS_PITCH_DEFAULT,
    rate: process.env.AZURE_TTS_RATE || AZURE_TTS_RATE_DEFAULT,
  };
}

// 서버 캐시 키에 넣어, 목소리를 바꾸면 예전 목소리로 만든 오디오를 다시 쓰지 않게 한다.
export function ttsVoiceKey(language: SpeechLanguage): string {
  if (usesAzure(language)) {
    const { voice, pitch, rate } = azureVoice();
    return `azure:${voice}:${pitch}:${rate}`;
  }
  return `gemini:${process.env.GEMINI_TTS_VOICE || "Kore"}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 문장은 AI가 만든 질문일 수 있으니 SSML 특수문자를 반드시 이스케이프한다.
export function azureSsml(text: string, voice: string, pitch: string, rate = "0%"): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${escapeXml(voice)}"><prosody pitch="${escapeXml(pitch)}" rate="${escapeXml(rate)}">${escapeXml(text)}</prosody></voice></speak>`
  );
}

// Azure 읽어 주기 → 24kHz 16비트 mono WAV(앱이 RIFF 헤더를 확인하고 캐시한다).
export async function synthesizeWithAzure(text: string): Promise<Buffer> {
  const { voice, pitch, rate } = azureVoice();
  const response = await fetch(`https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "",
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
      "User-Agent": "yoon-call-review",
    },
    body: azureSsml(text, voice, pitch, rate),
  });
  if (!response.ok) throw new Error(`Azure TTS ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Azure가 실패해도 Gemini(어른 목소리)로 바꾸지 않는다. 앱이 그 파일을 기기에 오래 저장해 목소리가 섞이기 때문이다.
// 실패하면 앱이 그 문장만 기기 음성으로 읽고, 다음에 다시 받는다.
export async function synthesizeSpeech(text: string, language: SpeechLanguage): Promise<Buffer> {
  return usesAzure(language) ? synthesizeWithAzure(text) : synthesizeWithGemini(text);
}

export const GEMINI_TTS_MODEL_DEFAULT = "gemini-3.8-flash-tts";

type GeminiAudioResponse = {
  candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
};

// 16비트 PCM(L16)에 WAV 헤더를 붙여 앱에서 바로 재생하게 한다.
export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// 2.5 미리보기 모델은 헤더 없는 L16 PCM을, 3.8 모델은 완성된 WAV(뒤에 C2PA 출처 정보 청크 포함)를 준다.
// WAV에 헤더를 한 번 더 씌우면 뒤쪽 청크가 소리로 재생돼 끝에 잡음이 난다. 이미 WAV면 그대로 쓴다.
export function toWav(audio: Buffer, mimeType = ""): Buffer {
  const isWav = audio.subarray(0, 4).toString("latin1") === "RIFF" && audio.subarray(8, 12).toString("latin1") === "WAVE";
  if (isWav) return audio;
  return pcmToWav(audio, Number(mimeType.match(/rate=(\d+)/)?.[1] ?? 24000));
}

// gemini-3.8-flash-tts는 systemInstruction을 받지 않고, 문장 앞에 붙인 말투 지시도 그대로 읽어 버린다.
// 그래서 읽을 문장만 보내고 말투는 목소리(GEMINI_TTS_VOICE)로 정한다. 언어는 모델이 문장에서 알아낸다.
export async function synthesizeWithGemini(text: string): Promise<Buffer> {
  const model = process.env.GEMINI_TTS_MODEL || GEMINI_TTS_MODEL_DEFAULT;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_TTS_VOICE || "Kore" } },
          },
        },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini TTS ${response.status}`);
  const data = (await response.json()) as GeminiAudioResponse;
  const inline = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Gemini TTS: no audio");
  return toWav(Buffer.from(inline.data, "base64"), inline.mimeType);
}
