// 전화관리 서버 저장소 연결(firebase-admin, 서버 전용).
// 로컬은 Firestore 에뮬레이터(FIRESTORE_EMULATOR_HOST)에만 쓰고, 실제 Firestore는
// CALL_REVIEW_FIRESTORE=enabled일 때만 쓴다. 테스트 데이터가 운영 DB에 섞이지 않게 한다.
// 초기화는 첫 호출 때만 해서 빌드 시점에 자격증명을 요구하지 않는다.

import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";

const APP_NAME = "call-review";

let db: Firestore | null = null;

export function isServerStoreConfigured(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST) || process.env.CALL_REVIEW_FIRESTORE === "enabled";
}

export async function firestore(): Promise<Firestore> {
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
