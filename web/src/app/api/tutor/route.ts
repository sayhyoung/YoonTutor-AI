import { NextResponse } from "next/server";

import { decideAttempt, type AttemptDecision } from "@/lib/quiz-engine";
import { callOpenAiMessages, isOpenAiEnabled, type OpenAiInputMessage } from "@/lib/openai";
import type { LearningItem } from "@/lib/types";

export const runtime = "nodejs";

// AI는 피드백과 다음 문제의 표현만 담당한다. 정답 여부, 시도 횟수,
// 다음 문항 인덱스와 세션 종료 여부는 decideAttempt()가 확정한다.

type TutorMessage = { role: "user" | "assistant"; content: string };
type TutorRequest = {
  studentName: string;
  items: LearningItem[];
  messages: TutorMessage[];
  currentItemIndex?: number;
  previousAttemptCount?: number;
  answer?: string;
};

function buildWrongSummary(items: LearningItem[]): string {
  return items
    .map((item, index) => {
      const number = index + 1;
      const meaning = item.meaningKo || item.promptKo;
      return `[${number}.${item.sourceLabel}] 정답: ${item.answerEn} | 우리말: ${meaning}`;
    })
    .join("\n");
}

function buildSystemPrompt(studentName: string, items: LearningItem[]): string {
  return `너는 '윤선생 영어교실'의 친근한 AI 코치 코코야. 학생(${studentName})에게 짧고 쉬운 반말로 말해.

[복습할 데이터]
${buildWrongSummary(items)}

[절대 원칙]
1. 정답 여부, 시도 횟수, 다음 문항과 종료 여부는 서버가 제공하는 '이번 턴 확정 지시'를 그대로 따라.
2. 학생 답을 네가 다시 채점하거나 확정 지시를 변경하지 마.
3. 문제를 낼 때 영어 정답을 먼저 보여주지 마.
4. 힌트나 재시도 상황에서는 영어 정답 전체를 말하지 마.
5. 정답 공개 상황에서만 서버가 지정한 정답을 알려줘.
6. 마크다운 문법과 [PERFECT], [GOOD], [FAILED], [DONE] 같은 내부 태그를 쓰지 마.
7. 한 응답은 2~4문장으로 짧게 작성해.
8. "틀림", "실패" 대신 "다시 해보자", "조금만 더"처럼 응원하는 표현을 사용해.`;
}

function formatQuestion(item: LearningItem, index: number, total: number): string {
  const prompt = item.meaningKo
    ? `"${item.meaningKo}"에 맞는 영어를 써봐.`
    : item.promptKo;
  return `${index + 1}/${total} ${item.sourceLabel} 문제: ${prompt}`;
}

function buildKickoffInstruction(
  studentName: string,
  items: LearningItem[],
): string {
  const first = items[0];
  return [
    `${studentName}에게 오늘 복습할 문항이 ${items.length}개라고 짧게 인사해.`,
    `곧바로 다음 문제를 내: ${formatQuestion(first, 0, items.length)}`,
    `영어 정답 "${first.answerEn}"은 절대 먼저 보여주지 마.`,
  ].join("\n");
}

function buildTurnInstruction({
  decision,
  currentItem,
  currentIndex,
  nextItem,
  nextIndex,
  total,
}: {
  decision: AttemptDecision;
  currentItem: LearningItem;
  currentIndex: number;
  nextItem?: LearningItem;
  nextIndex: number;
  total: number;
}): string {
  const lines = [
    `[이번 턴 확정 지시]`,
    `현재 문항: ${currentIndex + 1}/${total}`,
    `현재 문항 정답: ${currentItem.answerEn}`,
    `판정 상황: ${decision.situation}`,
    `시도 횟수 반영: ${decision.countsAsAttempt ? "예" : "아니오"}`,
  ];

  if (decision.situation === "help") {
    lines.push(
      `학생은 힌트나 설명을 요청했어. 오답으로 취급하지 마.`,
      `정답 전체를 노출하지 않는 힌트를 주고 같은 문제를 다시 풀게 해.`,
    );
  } else if (decision.situation === "retry") {
    lines.push(
      `학생 답은 아직 정답이 아니야. 정답 전체를 말하지 마.`,
      `학생 답과 정답의 차이를 짧게 짚고 같은 문제를 다시 풀게 해.`,
    );
  } else if (decision.situation === "reveal") {
    lines.push(
      `이번 문항은 다시 복습할 문항으로 확정됐어.`,
      `정답 "${currentItem.answerEn}"을 알려주고 따뜻하게 응원해.`,
    );
  } else {
    lines.push(
      `이번 문항은 ${decision.status === "Perfect" ? "한 번에 정확히 해결" : "다시 풀어 해결"}했어.`,
      `짧게 칭찬해.`,
    );
  }

  if (decision.status && nextItem) {
    lines.push(
      `칭찬이나 정답 안내 뒤 곧바로 다음 문제를 내.`,
      `다음 문제: ${formatQuestion(nextItem, nextIndex, total)}`,
      `다음 문제의 영어 정답 "${nextItem.answerEn}"은 절대 먼저 보여주지 마.`,
    );
  } else if (decision.status) {
    lines.push(`마지막 문항이므로 오늘 복습을 마쳤다고 따뜻하게 마무리해.`);
  }

  return lines.join("\n");
}

function fallbackTurnReply(
  decision: AttemptDecision,
  nextItem: LearningItem | undefined,
  nextIndex: number,
  total: number,
): string {
  if (!decision.status) return decision.reply;
  if (!nextItem) return `${decision.reply} 오늘 복습도 끝까지 잘 해냈어!`;
  return `${decision.reply} 다음 문제야. ${formatQuestion(nextItem, nextIndex, total)}`;
}

export async function POST(request: Request) {
  let body: TutorRequest;
  try {
    body = (await request.json()) as TutorRequest;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const studentName = body.studentName?.trim() || "친구";

  if (items.length === 0) {
    return NextResponse.json({
      reply: "오늘 복습할 오답 문항이 없어.",
      raw: "오늘 복습할 오답 문항이 없어.",
      countsAsAttempt: false,
      currentItemIndex: 0,
      nextItemIndex: 0,
      done: true,
      mode: "empty",
    });
  }

  // answer가 없으면 세션 시작 턴이다. 첫 문항 인덱스는 항상 0으로 고정한다.
  if (typeof body.answer !== "string") {
    const fallback = `안녕 ${studentName}! 오늘 복습할 문항은 ${items.length}개야. ${formatQuestion(
      items[0],
      0,
      items.length,
    )}`;

    if (!isOpenAiEnabled()) {
      return NextResponse.json({
        reply: fallback,
        raw: fallback,
        countsAsAttempt: false,
        currentItemIndex: 0,
        nextItemIndex: 0,
        done: false,
        mode: "mock",
      });
    }

    try {
      const input: OpenAiInputMessage[] = [
        { role: "developer", content: buildSystemPrompt(studentName, items) },
        { role: "developer", content: buildKickoffInstruction(studentName, items) },
        { role: "user", content: "오늘 복습을 시작할게." },
      ];
      const reply = await callOpenAiMessages(input, 500);
      return NextResponse.json({
        reply,
        raw: reply,
        countsAsAttempt: false,
        currentItemIndex: 0,
        nextItemIndex: 0,
        done: false,
        mode: "openai",
      });
    } catch (error) {
      console.error("[tutor] OpenAI 시작 응답 실패 — 결정론적 문장으로 대체:", error);
      return NextResponse.json({
        reply: fallback,
        raw: fallback,
        countsAsAttempt: false,
        currentItemIndex: 0,
        nextItemIndex: 0,
        done: false,
        mode: "fallback",
      });
    }
  }

  const currentIndex = Number.isInteger(body.currentItemIndex)
    ? Math.min(Math.max(body.currentItemIndex ?? 0, 0), items.length - 1)
    : 0;
  const previousAttemptCount = Number.isInteger(body.previousAttemptCount)
    ? Math.max(body.previousAttemptCount ?? 0, 0)
    : 0;
  const currentItem = items[currentIndex];
  const decision = decideAttempt(currentItem, body.answer, previousAttemptCount);
  const nextIndex = decision.status ? currentIndex + 1 : currentIndex;
  const nextItem = nextIndex < items.length ? items[nextIndex] : undefined;
  const done = Boolean(decision.status && !nextItem);
  const fallback = fallbackTurnReply(
    decision,
    nextItem,
    nextIndex,
    items.length,
  );

  const responseBase = {
    status: decision.status,
    countsAsAttempt: decision.countsAsAttempt,
    attemptNumber: decision.attemptNumber,
    nextAttemptCount: decision.nextAttemptCount,
    currentItemIndex: currentIndex,
    nextItemIndex: nextIndex,
    done,
  };

  if (!isOpenAiEnabled()) {
    return NextResponse.json({
      ...responseBase,
      reply: fallback,
      raw: fallback,
      mode: "mock",
    });
  }

  try {
    const input: OpenAiInputMessage[] = [
      { role: "developer", content: buildSystemPrompt(studentName, items) },
      ...(body.messages ?? []).map(
        (message) =>
          ({ role: message.role, content: message.content }) as OpenAiInputMessage,
      ),
      {
        role: "developer",
        content: buildTurnInstruction({
          decision,
          currentItem,
          currentIndex,
          nextItem,
          nextIndex,
          total: items.length,
        }),
      },
    ];
    const reply = await callOpenAiMessages(input, 700);
    return NextResponse.json({
      ...responseBase,
      reply,
      raw: reply,
      mode: "openai",
    });
  } catch (error) {
    console.error("[tutor] OpenAI 턴 응답 실패 — 결정론적 문장으로 대체:", error);
    return NextResponse.json({
      ...responseBase,
      reply: fallback,
      raw: fallback,
      mode: "fallback",
    });
  }
}
