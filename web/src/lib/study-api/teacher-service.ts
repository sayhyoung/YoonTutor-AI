// 교사 담당 회원 목록 조회. 교사(TEACHER) 토큰으로 GET /api/teacher/customers를 부른다.
// 같은 회원이 여러 센터로 중복돼 와도 회원번호 기준 1건으로 합치고,
// 학습 API(Smart Befly/학원)를 고를 수 있게 회원별 bmName을 붙인다(응답에 없으면 센터 BM).

import type { StudyMembership, TeacherCustomer } from "./types";

export type TeacherStudent = {
  customerNo: string;
  customerName: string;
  schoolYear?: number;
  agencyNos: string[];
  bmNames: string[];
  usingPerfectCare?: boolean;
};

const str = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "" ? undefined : String(value).trim();

export function normalizeTeacherCustomers(
  raw: unknown,
  memberships: StudyMembership[],
): TeacherStudent[] {
  const list: TeacherCustomer[] = Array.isArray(raw)
    ? (raw as TeacherCustomer[])
    : Array.isArray((raw as { customers?: unknown })?.customers)
      ? ((raw as { customers: TeacherCustomer[] }).customers)
      : [];
  const bmByAgency = new Map(
    memberships
      .filter((m) => m.agencyNo && m.bmName)
      .map((m) => [m.agencyNo as string, m.bmName as string]),
  );

  const byCustomer = new Map<string, TeacherStudent>();
  for (const item of list) {
    const customerNo = str(item?.customerNo);
    if (!customerNo) continue;
    const agencyNo = str(item.agencyNo);
    const bmName = str(item.bmName) ?? (agencyNo ? bmByAgency.get(agencyNo) : undefined);
    const existing = byCustomer.get(customerNo);
    if (existing) {
      if (agencyNo && !existing.agencyNos.includes(agencyNo)) existing.agencyNos.push(agencyNo);
      if (bmName && !existing.bmNames.includes(bmName)) existing.bmNames.push(bmName);
      existing.usingPerfectCare ||= item.usingPerfectCare === true;
      continue;
    }
    byCustomer.set(customerNo, {
      customerNo,
      customerName: str(item.customerName) ?? "이름 없음",
      ...(typeof item.schoolYear === "number" ? { schoolYear: item.schoolYear } : {}),
      agencyNos: agencyNo ? [agencyNo] : [],
      bmNames: bmName ? [bmName] : [],
      ...(typeof item.usingPerfectCare === "boolean" ? { usingPerfectCare: item.usingPerfectCare } : {}),
    });
  }

  return [...byCustomer.values()].sort((a, b) => a.customerName.localeCompare(b.customerName, "ko"));
}

export async function loadTeacherStudents(
  fetcher: <T>(path: string) => Promise<T>,
  memberships: StudyMembership[],
): Promise<TeacherStudent[]> {
  const raw = await fetcher<unknown>("/api/teacher/customers");
  return normalizeTeacherCustomers(raw, memberships);
}
