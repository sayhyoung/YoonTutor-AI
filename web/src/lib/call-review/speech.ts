// 전화관리 음성 처리(서버 전용).
// - 음성 인식(STT): Azure Speech Fast Transcription. 설정이 없으면 OpenAI 음성 인식으로 대신한다.
// - 읽어 주기(TTS): Gemini TTS. 설정이 없거나 실패하면 앱이 기기 음성으로 읽는다.
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
  return `${base}/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
}

type AzureFastTranscription = { combinedPhrases?: { text?: string }[] };

export async function transcribeWithAzure(audio: Blob, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, fileName);
  form.append("definition", JSON.stringify({ locales: ["en-US"], profanityFilterMode: "Masked" }));
  const response = await fetch(azureTranscribeUrl(), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": process.env.AZURE_SPEECH_KEY ?? "" },
    body: form,
  });
  if (!response.ok) throw new Error(`Azure STT ${response.status}`);
  const data = (await response.json()) as AzureFastTranscription;
  return (data.combinedPhrases ?? []).map((phrase) => phrase.text ?? "").join(" ").trim();
}

export async function transcribeWithOpenAi(audio: Blob, fileName: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, fileName);
  form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
  form.append("language", "en");
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

export function isGeminiTtsConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
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
