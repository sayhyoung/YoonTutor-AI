import { NextResponse } from "next/server";

import {
  audioFileName,
  isAzureSttConfigured,
  transcribeWithAzure,
  transcribeWithOpenAi,
} from "@/lib/call-review/speech";
import { isOpenAiEnabled } from "@/lib/openai";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
// 한 번의 답변은 짧다. 1분 남짓 분량을 넘는 업로드는 거절한다.
const MAX_BYTES = 6 * 1024 * 1024;

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 학생 영어 답변 음성 → 텍스트. Azure가 설정돼 있으면 Azure, 아니면 OpenAI.
// 오디오는 변환에만 쓰고 저장하지 않는다.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };
  if (!readMobileToken(request)) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401, headers });
  }
  const useAzure = isAzureSttConfigured();
  if (!useAzure && !isOpenAiEnabled()) {
    return NextResponse.json({ error: "음성 인식을 쓸 수 없어요. 글자로 답해 주세요." }, { status: 503, headers });
  }

  let audio: Blob | null = null;
  try {
    const form = await request.formData();
    const file = form.get("audio");
    if (file instanceof Blob) audio = file;
  } catch {
    return NextResponse.json({ error: "녹음을 읽지 못했어요." }, { status: 400, headers });
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "녹음된 소리가 없어요." }, { status: 400, headers });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "녹음이 너무 길어요. 짧게 말해 주세요." }, { status: 413, headers });
  }

  // 앱이 붙인 파일 이름(answer.aac 등)의 확장자를 우선 쓰고, 없으면 MIME 형식으로 정한다.
  const uploadedExtension = audio instanceof File ? audio.name.match(/\.(aac|wav|m4a|mp4|webm|ogg|mp3)$/i)?.[1] : undefined;
  const fileName = uploadedExtension ? `answer.${uploadedExtension.toLowerCase()}` : audioFileName(audio.type);
  try {
    const text = useAzure ? await transcribeWithAzure(audio, fileName) : await transcribeWithOpenAi(audio, fileName);
    return NextResponse.json({ text, engine: useAzure ? "azure" : "openai" }, { headers });
  } catch (error) {
    console.error("[stt] 음성 인식 실패:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "말한 내용을 알아듣지 못했어요." }, { status: 502, headers });
  }
}
