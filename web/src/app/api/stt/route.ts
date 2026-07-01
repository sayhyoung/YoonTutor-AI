import { NextResponse } from "next/server";

import { isOpenAiEnabled } from "@/lib/openai";

export const runtime = "nodejs";

// 음성 입력(STT): 브라우저가 녹음한 오디오를 받아 OpenAI Whisper로 영어 텍스트로 변환.
// POC(modules/voice_utils.py stt_recorder_widget)와 동일하게 whisper-1 / language=en.
export async function POST(request: Request) {
  if (!isOpenAiEnabled()) {
    return NextResponse.json({ error: "음성 인식이 비활성 상태야." }, { status: 503 });
  }

  let audio: Blob | null = null;
  try {
    const form = await request.formData();
    const f = form.get("audio");
    if (f instanceof Blob) audio = f;
  } catch {
    return NextResponse.json({ error: "오디오를 읽지 못했어." }, { status: 400 });
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "녹음된 오디오가 없어." }, { status: 400 });
  }

  try {
    const oaForm = new FormData();
    oaForm.append("file", audio, "recording.webm");
    oaForm.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
    oaForm.append("language", "en"); // 학생 답은 영어
    // Content-Type(multipart 경계)은 fetch가 자동 설정하므로 지정하지 않는다.
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: oaForm,
    });
    if (!res.ok) {
      return NextResponse.json({ error: "음성 인식에 실패했어." }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: (data.text ?? "").trim() });
  } catch {
    return NextResponse.json({ error: "음성 인식 중 오류가 났어." }, { status: 500 });
  }
}
