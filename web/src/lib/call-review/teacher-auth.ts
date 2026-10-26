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

const MAX_BATCH = 100;

// 여러 학생에게 한 번에 적용하는 요청(공통 일정·메시지)의 학생 목록. 중복은 하나로 합친다.
export function parseCustomerNos(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH) return null;
  if (!value.every((item) => typeof item === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item))) return null;
  return [...new Set(value as string[])];
}

// 요청한 학생이 모두 지금 이 교사의 담당인지 확인한다. 하나라도 아니면 null(존재 여부는 알리지 않는다).
export async function ownStudentsAmong(customerNos: string[]): Promise<TeacherStudent[] | null> {
  const students = await loadOwnStudents();
  const byNo = new Map(students.map((student) => [student.customerNo, student]));
  const picked = customerNos.map((customerNo) => byNo.get(customerNo));
  return picked.every(Boolean) ? (picked as TeacherStudent[]) : null;
}
