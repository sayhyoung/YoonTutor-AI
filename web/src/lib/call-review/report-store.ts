// 통화 결과 저장소(서버 전용, firebase-admin). 연결 설정은 admin-db.ts.

import type { StoredCallReport } from "./report-schema";
import { firestore, isServerStoreConfigured } from "./admin-db";

const COLLECTION = "callReports";

export const isReportStoreConfigured = isServerStoreConfigured;

// 같은 reportId로 다시 보내면 기존 기록을 그대로 둔다(재전송 멱등).
export async function saveCallReport(report: StoredCallReport): Promise<{ created: boolean }> {
  const store = await firestore();
  const ref = store.collection(COLLECTION).doc(`${report.studentId}_${report.reportId}`);
  try {
    await ref.create(report);
    return { created: true };
  } catch (error) {
    if ((error as { code?: number }).code === 6) return { created: false }; // ALREADY_EXISTS
    throw error;
  }
}

export async function listCallReports(studentId: string, limit = 10): Promise<StoredCallReport[]> {
  const store = await firestore();
  const snapshot = await store
    .collection(COLLECTION)
    .where("studentId", "==", studentId)
    .orderBy("endedAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 50))
    .get();
  return snapshot.docs.map((doc) => doc.data() as StoredCallReport);
}

// 교사 대시보드용: 여러 학생의 최근 통화 결과. Firestore `in`은 30개까지라 나눠 조회한다.
const IN_QUERY_LIMIT = 30;

export async function listRecentReportsForStudents(
  studentIds: string[],
  perChunkLimit = 300,
): Promise<StoredCallReport[]> {
  const store = await firestore();
  const unique = [...new Set(studentIds)];
  const reports: StoredCallReport[] = [];
  for (let index = 0; index < unique.length; index += IN_QUERY_LIMIT) {
    const chunk = unique.slice(index, index + IN_QUERY_LIMIT);
    const snapshot = await store
      .collection(COLLECTION)
      .where("studentId", "in", chunk)
      .orderBy("endedAt", "desc")
      .limit(perChunkLimit)
      .get();
    reports.push(...snapshot.docs.map((doc) => doc.data() as StoredCallReport));
  }
  return reports;
}
