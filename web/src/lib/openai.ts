// OpenAI Responses API 호출 헬퍼 (서버 전용).
// 두 라우트(/api/quiz, /api/report)가 공유한다.
// 키/모델은 환경변수에서만 읽고, 응답 본문은 로깅하지 않는다.

export function isOpenAiEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.USE_MOCK_AI !== "true";
}

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

// Responses API는 output_text(편의 필드) 또는 output[].content[].text 형태로 응답한다.
// 모델/버전에 따라 둘 중 하나만 채워질 수 있어 모두 처리한다.
function extractOutputText(data: OpenAiResponse): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

// 단일 프롬프트로 텍스트 응답을 받는다. 실패 시 throw → 호출 측에서 결정론적 fallback 사용.
// temperature는 보내지 않는다(gpt-5 계열은 비기본 temperature를 거부할 수 있음).
export async function callOpenAiText(input: string, maxOutputTokens = 240): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.2",
      input,
      max_output_tokens: maxOutputTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as OpenAiResponse;
  const text = extractOutputText(data);
  if (!text) throw new Error("OpenAI 응답에서 텍스트를 찾지 못했습니다.");
  return text;
}
