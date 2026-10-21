// 교사 전용 라우트 공통: 서명 세션이 교사인지 확인하고, 담당 학생 목록을 불러온다.

import { getCallReviewSession, type CallReviewSession } from "../study-api/call-review-session";
import { authedStudyFetch } from "../study-api/server-fetch";
import { loadTeacherStudents, type TeacherStudent } from "../study-api/teacher-service";

export type TeacherGate =
  | { ok: true; session: CallReviewSession }
  | { ok: false; status: 401 | 403; error: string };

export async function requireTeacher(): Promise<TeacherGate> {
  const session = await getCallReviewSession();
  if (!session) return { ok: false, status: 401, error: "로그인이 필요해요." };
  if (session.role !== "teacher") return { ok: false, status: 403, error: "교사 계정으로 로그인해 주세요." };
  return { ok: true, session };
}

// 담당 여부는 매번 study-api에서 확인한다(학생 이동·담당 변경 즉시 반영).
export function loadOwnStudents(): Promise<TeacherStudent[]> {
  return loadTeacherStudents(authedStudyFetch, []);
}
