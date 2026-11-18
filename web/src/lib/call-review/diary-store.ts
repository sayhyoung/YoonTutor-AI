// 영어 한 줄 일기 저장소(Firestore `callDiaries/{회원번호}/entries/{날짜}`). 서버(BFF)만 읽고 쓴다.
// 학생별 하위 컬렉션이고 날짜 하나로 정렬하므로 따로 색인이 필요 없다.

import { firestore } from "./admin-db";
import { type DiarySaveInput, type DiaryTeacherComment, kstDate, type StoredDiaryEntry } from "./diary";

const COLLECTION = "callDiaries";
const ENTRIES = "entries";

async function entries(customerNo: string) {
  const store = await firestore();
  return store.collection(COLLECTION).doc(customerNo).collection(ENTRIES);
}

export type SaveDiaryResult = { ok: true; entry: StoredDiaryEntry } | { ok: false; reason: "commented" };

// 오늘 일기를 저장한다. 다시 쓰면 바꾸지만, 선생님이 이미 댓글을 단 일기는 바꾸지 않는다.
export async function saveTodayDiary(customerNo: string, input: DiarySaveInput, now = new Date()): Promise<SaveDiaryResult> {
  const store = await firestore();
  const date = kstDate(now);
  const ref = (await entries(customerNo)).doc(date);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? (snapshot.data() as StoredDiaryEntry) : null;
    if (previous?.teacherComment) return { ok: false, reason: "commented" } as const;
    const at = now.toISOString();
    const entry: StoredDiaryEntry = {
      schemaVersion: 1,
      id: date,
      customerNo,
      date,
      ...input,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
    };
    transaction.set(ref, entry);
    return { ok: true, entry } as const;
  });
}

export async function listDiaryEntries(customerNo: string, limit = 30): Promise<StoredDiaryEntry[]> {
  const snapshot = await (await entries(customerNo)).orderBy("date", "desc").limit(Math.min(Math.max(limit, 1), 60)).get();
  return snapshot.docs.map((doc) => doc.data() as StoredDiaryEntry);
}

// 교사 댓글. 다시 쓰면 바꾸고, 학생이 새 댓글을 다시 읽도록 읽음 표시를 지운다. 일기가 없으면 null.
export async function setDiaryComment(
  customerNo: string,
  id: string,
  comment: Omit<DiaryTeacherComment, "at">,
  now = new Date(),
): Promise<StoredDiaryEntry | null> {
  const store = await firestore();
  const ref = (await entries(customerNo)).doc(id);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const { commentReadAt: _read, ...entry } = snapshot.data() as StoredDiaryEntry;
    void _read;
    const next: StoredDiaryEntry = { ...entry, teacherComment: { ...comment, at: now.toISOString() } };
    transaction.set(ref, next);
    return next;
  });
}

// 학생이 댓글을 읽음. 학생 본인 일기만 찾는다(경로가 학생 번호로 정해짐). 없으면 null.
export async function markDiaryCommentRead(customerNo: string, id: string, now = new Date()): Promise<StoredDiaryEntry | null> {
  const store = await firestore();
  const ref = (await entries(customerNo)).doc(id);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const entry = snapshot.data() as StoredDiaryEntry;
    if (!entry.teacherComment || entry.commentReadAt) return entry;
    const next = { ...entry, commentReadAt: now.toISOString() };
    transaction.set(ref, next);
    return next;
  });
}
