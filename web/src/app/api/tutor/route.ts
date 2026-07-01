import { NextResponse } from "next/server";

import { callOpenAiMessages, isOpenAiEnabled, type OpenAiInputMessage } from "@/lib/openai";
import type { LearningItem, MasteryStatus } from "@/lib/types";

export const runtime = "nodejs";

// POC(modules/ai_tutor.py)의 소크라테스식 AI 튜터를 그대로 이관.
// AI가 인사+문항 출제+힌트+채점+진행을 대화로 직접 수행하고,
// 결과는 [PERFECT]/[GOOD]/[FAILED]/[DONE] 태그로 표시한다.

type TutorMessage = { role: "user" | "assistant"; content: string };
type TutorRequest = {
  studentName: string;
  items: LearningItem[];
  messages: TutorMessage[];
};

const KICKOFF = "안녕! 이제 시작하자. 첫 인사와 함께 1번 문제부터 내줘.";

function buildWrongSummary(items: LearningItem[]): string {
  return items
    .map((it, i) => {
      const n = i + 1;
      if (it.sourceType === "word") {
        const meaning = it.meaningKo || "(네가 문맥에 맞게 생성해서 질문해)";
        return `[${n}.단어] 정답(Target): ${it.answerEn} | 한국어 뜻: ${meaning}`;
      }
      if (it.sourceType === "sentence") {
        const meaning = it.meaningKo
          ? it.meaningKo
          : "(영어 정답만 있으니, 네가 자연스러운 한국어 해석을 만들어서 그 뜻으로 질문해)";
        return `[${n}.문장] 정답(Target): ${it.answerEn} | 한국어 뜻: ${meaning}`;
      }
      const core = it.originalQuestion || it.promptKo;
      return `[${n}.문법] 핵심내용: ${core} | (이 내용을 바탕으로 영어 문장을 만들거나 답하게 해)`;
    })
    .join("\n");
}

// ai_tutor.py의 system_prompt를 그대로 이식.
function buildSystemPrompt(studentName: string, items: LearningItem[]): string {
  return `너는 '윤선생 영어교실'의 유능하고 센스 있는 AI 튜터야. 학생(${studentName})에게 반말(친구 모드)을 사용해.

[복습할 데이터]
${buildWrongSummary(items)}

[🚨 절대 원칙 (어길 시 오류)]
1. 정답 선제시 금지: 문제를 낼 때 영어 정답을 절대 먼저 보여주지 마.
   - (X) "[문장] I don't like milk. (뭐하라고?)"
   - (O) "[문장] '나는 우유를 싫어해.'를 영어로 하면?" (한국어 뜻을 먼저 제시!)
2. 스포일러 금지: 힌트를 줄 때 정답 단어를 입 밖으로 내지 마.
   - (X) "walk는 w__k 형태로 써봐."
   - (O) "정답 단어는 w__k 형태로 생겼어."
3. 질문 대응: 학생이 "뭐 하라고?", "어떻게 해?"라고 물으면 문제를 다시 설명해줘.

[진행 시나리오]
Step 1. 문제 출제
- 단어/문장: 반드시 "한국어 뜻"을 먼저 보여주고 그에 맞는 영어를 입력하게 유도해. (문장은 한국어 뜻이 없으면 네가 자연스럽게 만들어서 제시 — 학생이 무슨 문장을 쓰는지 알 수 있도록 반드시 한국어 뜻을 함께 제시!)
- 문법/평가: 핵심내용을 바탕으로 상황을 주고 영어로 답하게 해.

Step 2. 오답/힌트 요청 처리
- "힌트 줘", "모르겠어", "뭐야?" 같은 질문은 오답 시도로 카운트하지 않아. 힌트만 줘.
- 학생이 영어로 답을 제출했는데 틀렸으면 그게 오답 시도야.
  - 1차 오답: 오답 이유 설명 + 1차 힌트 (의미/초성, 정답 단어 절대 언급 X)
  - 2차 오답: 2차 힌트 (마스킹 형태, 예: w__k)
  - 3차 오답: 즉시 정답을 공개하고 [FAILED] 태그를 붙여 다음 문제로.

Step 3. 정답/태그 처리 (매우 중요)
- 정확히 맞으면 1번 만에는 [PERFECT], 2~3번 만에는 [GOOD] 태그를 응답에 포함해.
- 3회 오답 시 반드시 [FAILED] 태그를 포함하고 즉시 다음 문제로.
- 결과 태그([PERFECT]/[GOOD]/[FAILED])는 한 문제가 끝났을 때만 포함하고, 곧바로 다음 문제를 출제해.
- 모든 문제가 끝나면 따뜻한 마무리 인사와 함께 [DONE] 태그를 포함해.

지금 첫 응답: "안녕 ${studentName}! 오늘 복습할 문항은 ${items.length}개야. 나와 천천히 하나씩 복습해보자." 로 인사한 뒤, 곧바로 1번 문제를 한국어 뜻과 함께 제시해.`;
}

const TAG_RE = /\[(PERFECT|GOOD|FAILED|DONE)\]/g;
function parseTags(raw: string): { status?: MasteryStatus; done: boolean; reply: string } {
  const done = /\[DONE\]/.test(raw);
  let status: MasteryStatus | undefined;
  if (/\[PERFECT\]/.test(raw)) status = "Perfect";
  else if (/\[GOOD\]/.test(raw)) status = "Good";
  else if (/\[FAILED\]/.test(raw)) status = "Not mastered";
  const reply = raw.replace(TAG_RE, "").replace(/[ \t]{2,}/g, " ").trim();
  return { status, done, reply };
}

export async function POST(request: Request) {
  let body: TutorRequest;
  try {
    body = (await request.json()) as TutorRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const items = body.items ?? [];

  if (!isOpenAiEnabled()) {
    const first = items[0];
    const reply = first
      ? `(데모) 안녕 ${body.studentName || "친구"}! 오늘 복습할 문항은 ${items.length}개야. 1번: "${first.meaningKo ?? first.promptKo}"에 맞는 영어를 써봐.`
      : "오늘 복습할 오답 문항이 없어.";
    return NextResponse.json({ reply, raw: reply, done: false, mode: "mock" });
  }

  try {
    const input: OpenAiInputMessage[] = [
      { role: "developer", content: buildSystemPrompt(body.studentName || "친구", items) },
      ...(body.messages?.length
        ? body.messages.map((m) => ({ role: m.role, content: m.content }) as OpenAiInputMessage)
        : [{ role: "user" as const, content: KICKOFF }]),
    ];
    const raw = await callOpenAiMessages(input, 800);
    return NextResponse.json({ ...parseTags(raw), raw, mode: "openai" });
  } catch (error) {
    console.error("[tutor] OpenAI 호출 실패:", error);
    return NextResponse.json(
      { reply: "지금 코칭이 잠깐 안 돼. 잠시 후 다시 시도해줘.", raw: "", done: false, mode: "error" },
      { status: 200 },
    );
  }
}
