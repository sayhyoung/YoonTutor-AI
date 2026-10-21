// 전화관리 일정 저장소. 지금은 Firestore `callSchedules/{회원번호}`에 두고,
// 나중에 LMS 일정관리로 옮길 때는 이 모듈만 바꾸면 되도록 읽기·쓰기를 모아 둔다.

import { firestore } from "./admin-db";
import type { CallScheduleInput, StoredCallSchedule } from "./schedule";

const COLLECTION = "callSchedules";

export async function getSchedule(customerNo: string): Promise<StoredCallSchedule | null> {
  const store = await firestore();
  const doc = await store.collection(COLLECTION).doc(customerNo).get();
  return doc.exists ? (doc.data() as StoredCallSchedule) : null;
}

export async function getSchedules(customerNos: string[]): Promise<Map<string, StoredCallSchedule>> {
  const result = new Map<string, StoredCallSchedule>();
  const unique = [...new Set(customerNos)];
  if (unique.length === 0) return result;
  const store = await firestore();
  const docs = await store.getAll(...unique.map((no) => store.collection(COLLECTION).doc(no)));
  for (const doc of docs) {
    if (doc.exists) result.set(doc.id, doc.data() as StoredCallSchedule);
  }
  return result;
}

export async function saveSchedule(
  customerNo: string,
  input: CallScheduleInput,
  teacher: { teacherNo: string; teacherName: string | null },
  now = new Date(),
): Promise<StoredCallSchedule> {
  const stored: StoredCallSchedule = {
    ...input,
    schemaVersion: 1,
    customerNo,
    teacherNo: teacher.teacherNo,
    updatedAt: now.toISOString(),
    updatedByName: teacher.teacherName,
  };
  const store = await firestore();
  await store.collection(COLLECTION).doc(customerNo).set(stored);
  return stored;
}
