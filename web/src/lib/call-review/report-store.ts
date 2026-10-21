// 통화 결과 저장소(서버 전용, firebase-admin).
// 로컬은 Firestore 에뮬레이터(FIRESTORE_EMULATOR_HOST)에만 쓰고, 실제 Firestore는
// CALL_REVIEW_FIRESTORE=enabled일 때만 쓴다. 테스트 통화가 운영 DB에 섞이지 않게 한다.
// 초기화는 첫 호출 때만 해서 빌드 시점에 자격증명을 요구하지 않는다.

import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";

import type { StoredCallReport } from "./report-schema";

const COLLECTION = "callReports";
const APP_NAME = "call-review";

let db: Firestore | null = null;

export function isReportStoreConfigured(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST) || process.env.CALL_REVIEW_FIRESTORE === "enabled";
}

async function firestore(): Promise<Firestore> {
  if (db) return db;
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const projectId =
    process.env.CALL_REVIEW_FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  // App Hosting/로컬 모두 Application Default Credentials를 쓴다.
  const app: App =
    getApps().find((candidate) => candidate.name === APP_NAME) ??
    initializeApp(projectId ? { projectId } : {}, APP_NAME);
  db = getFirestore(app);
  return db;
}

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
