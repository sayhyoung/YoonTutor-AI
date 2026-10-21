import { NextResponse } from "next/server";

import { isGeminiTtsConfigured, synthesizeWithGemini, type SpeechLanguage } from "@/lib/call-review/speech";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";
const MAX_TEXT = 300;
const CACHE_LIMIT = 200;
// 같은 질문·안내 문장은 통화마다 반복되므로 서버 메모리에 잠깐 둔다.
const cache = new Map<string, Buffer>();

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 베플리 질문 읽어 주기(Gemini TTS) → audio/wav. 설정이 없으면 503이고 앱은 기기 음성으로 읽는다.
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) };
  if (!readMobileToken(request)) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401, headers });
  }
  if (!isGeminiTtsConfigured()) {
    return NextResponse.json({ error: "읽어 주기가 설정되지 않았어요." }, { status: 503, headers });
  }

  const params = new URL(request.url).searchParams;
  const text = (params.get("text") ?? "").replace(/\s+/g, " ").trim();
  const language: SpeechLanguage = params.get("lang") === "ko" ? "ko" : "en";
  if (!text || text.length > MAX_TEXT) {
    return NextResponse.json({ error: "읽을 문장이 올바르지 않아요." }, { status: 400, headers });
  }

  const key = `${language}:${text}`;
  try {
    let audio = cache.get(key);
    if (!audio) {
      audio = await synthesizeWithGemini(text);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(key, audio);
    }
    return new Response(new Uint8Array(audio), {
      headers: { ...headers, "Content-Type": "audio/wav", "Content-Length": String(audio.length) },
    });
  } catch (error) {
    console.error("[tts] 읽어 주기 실패:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "읽어 주기를 만들지 못했어요." }, { status: 502, headers });
  }
}
