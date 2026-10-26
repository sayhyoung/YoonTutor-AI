// 선생님 메시지 저장소(Firestore `callMessages/{회원번호}/items/{메시지}`). 서버(BFF)만 읽고 쓴다.
// 학생별 하위 컬렉션이라 최근순 조회에 따로 색인이 필요 없다.

import { firestore } from "./admin-db";
import { applyMessageUpdate, type MessageUpdate, type StoredTeacherMessage } from "./messages";

const COLLECTION = "callMessages";
const ITEMS = "items";

async function items(customerNo: string) {
  const store = await firestore();
  return store.collection(COLLECTION).doc(customerNo).collection(ITEMS);
}

// 같은 글을 여러 학생에게 저장한다. 학생별 메시지 id를 돌려준다.
export async function createMessages(
  customerNos: string[],
  body: string,
  teacher: { teacherNo: string; teacherName: string | null },
  now = new Date(),
): Promise<Map<string, StoredTeacherMessage>> {
  const store = await firestore();
  const batch = store.batch();
  const created = new Map<string, StoredTeacherMessage>();
  for (const customerNo of customerNos) {
    const ref = store.collection(COLLECTION).doc(customerNo).collection(ITEMS).doc();
    const message: StoredTeacherMessage = {
      schemaVersion: 1,
      id: ref.id,
      customerNo,
      teacherNo: teacher.teacherNo,
      teacherName: teacher.teacherName,
      body,
      sentAt: now.toISOString(),
    };
    batch.set(ref, message);
    created.set(customerNo, message);
  }
  await batch.commit();
  return created;
}

export async function listMessages(customerNo: string, limit = 20): Promise<StoredTeacherMessage[]> {
  const snapshot = await (await items(customerNo)).orderBy("sentAt", "desc").limit(Math.min(Math.max(limit, 1), 50)).get();
  return snapshot.docs.map((doc) => doc.data() as StoredTeacherMessage);
}

// 학생 본인 메시지만 바꾼다(경로가 학생 번호로 정해져 있어 다른 학생 메시지는 찾지 못함). 없으면 null.
export async function updateMessage(customerNo: string, id: string, update: MessageUpdate, now = new Date()) {
  const store = await firestore();
  const ref = (await items(customerNo)).doc(id);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const next = applyMessageUpdate(snapshot.data() as StoredTeacherMessage, update, now);
    transaction.set(ref, next);
    return next;
  });
}
