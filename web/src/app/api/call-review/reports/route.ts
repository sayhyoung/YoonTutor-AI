import { NextResponse } from "next/server";

import {
  type CallReportTurn,
  parseCallReportInput,
  toStoredCallReport,
  toSummary,
} from "@/lib/call-review/report-schema";
import { buildTalkFeedbackInput, buildTalkFeedbackInstructions, parseTalkFeedback } from "@/lib/call-review/talk-feedback";
import { callOpenAiMessages, isOpenAiEnabled } from "@/lib/openai";
import {
  isReportStoreConfigured,
  listCallReports,
  saveCallReport,
} from "@/lib/call-review/report-store";
import { corsHeaders, preflight } from "@/lib/study-api/call-review-cors";
import { readMobileToken } from "@/lib/study-api/call-review-mobile-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = "GET, POST, OPTIONS";

function json(request: Request, body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...corsHeaders(request, METHODS) },
  });
}

export function OPTIONS(request: Request) {
  return preflight(request, METHODS);
}

// 짧은 대화 피드백. 저장을 오래 막지 않도록 시간 제한을 두고, 실패하면 피드백 없이 저장한다.
const FEEDBACK_TIMEOUT_MS = 8000;

async function makeTalkFeedback(conversation: CallReportTurn[]): Promise<string | null> {
  if (conversation.length === 0 || !isOpenAiEnabled()) return null;
  try {
    const raw = await Promise.race([
      callOpenAiMessages(
        [
          { role: "developer", content: buildTalkFeedbackInstructions() },
          { role: "user", content: buildTalkFeedbackInput(conversation) },
        ],
        600,
        process.env.CALL_REVIEW_FREE_TALK_MODEL || undefined,
      ),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), FEEDBACK_TIMEOUT_MS)),
    ]);
    return parseTalkFeedback(raw);
  } catch {
    return null;
  }
}

// 학생 앱이 통화를 마치면 결과를 저장한다. 학생 번호는 Bearer 토큰에서만 읽는다.
export async function POST(request: Request) {
  if (!isReportStoreConfigured()) {
    return json(request, { error: "통화 결과 저장이 설정되지 않았어요." }, 503);
  }
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "잘못된 요청이에요." }, 400);
  }
  const parsed = parseCallReportInput(body);
  if (!parsed.ok) return json(request, { error: parsed.error }, 400);

  const report = toStoredCallReport(parsed.input, {
    studentId: student.subjectId,
    studentName: student.displayName,
  });
  const talkFeedback = await makeTalkFeedback(report.conversation);
  if (talkFeedback) report.talkFeedback = talkFeedback;
  try {
    const { created } = await saveCallReport(report);
    return json(request, { report: toSummary(report), created }, created ? 201 : 200);
  } catch {
    return json(request, { error: "통화 결과를 저장하지 못했어요." }, 502);
  }
}

// 학생 본인의 지난 통화 기록(마이페이지).
export async function GET(request: Request) {
  if (!isReportStoreConfigured()) {
    return json(request, { reports: [], configured: false });
  }
  const student = readMobileToken(request);
  if (!student) return json(request, { error: "로그인이 필요해요." }, 401);

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "10") || 10;
  try {
    const reports = await listCallReports(student.subjectId, limit);
    return json(request, { reports: reports.map(toSummary), configured: true });
  } catch {
    return json(request, { error: "지난 통화 기록을 불러오지 못했어요." }, 502);
  }
}
