import { describe, expect, it } from "vitest";

import { normalizeTeacherCustomers } from "./teacher-service";

const memberships = [
  { agencyNo: "1910", agencyName: "숲센터", bmName: "FOREST" },
  { agencyNo: "1999", agencyName: "교실센터", bmName: "HOME" },
];

describe("normalizeTeacherCustomers", () => {
  it("merges a student listed under several centers and attaches BMs", () => {
    const students = normalizeTeacherCustomers(
      [
        { teacherNo: 1, agencyNo: 1910, customerNo: 30001, customerName: "나학생", schoolYear: 3, usingPerfectCare: false },
        { teacherNo: 1, agencyNo: 1999, customerNo: 30001, customerName: "나학생", schoolYear: 3, usingPerfectCare: true },
        { teacherNo: 1, agencyNo: 1999, customerNo: "30002", customerName: "가학생" },
      ],
      memberships,
    );

    expect(students.map((student) => student.customerName)).toEqual(["가학생", "나학생"]);
    expect(students[1]).toMatchObject({
      customerNo: "30001",
      agencyNos: ["1910", "1999"],
      bmNames: ["FOREST", "HOME"],
      usingPerfectCare: true,
    });
  });

  it("skips rows without a member number and tolerates non-array responses", () => {
    expect(normalizeTeacherCustomers([{ customerName: "번호없음" }], memberships)).toEqual([]);
    expect(normalizeTeacherCustomers(null, memberships)).toEqual([]);
    expect(normalizeTeacherCustomers({ customers: [{ customerNo: 5 }] }, memberships)).toHaveLength(1);
  });

  it("prefers the BM sent on each customer row", () => {
    const [student] = normalizeTeacherCustomers([{ agencyNo: 1999, customerNo: 1, bmName: "IGSE" }], memberships);

    expect(student.bmNames).toEqual(["IGSE"]);
  });

  it("leaves BM empty when the center is not in the teacher's memberships", () => {
    const [student] = normalizeTeacherCustomers([{ agencyNo: 7777, customerNo: 1 }], memberships);

    expect(student.bmNames).toEqual([]);
  });
});
