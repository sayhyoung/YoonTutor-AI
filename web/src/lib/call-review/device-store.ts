// 학생 기기 푸시 토큰(Firestore `callDevices/{회원번호}`)과 발송 기록(`callDispatches`).
// 일정 저장소와 마찬가지로 서버(BFF)만 읽고 쓴다.

import { firestore } from "./admin-db";
import type { DispatchKind } from "./push";
import type { StoredCallSchedule } from "./schedule";

const DEVICES = "callDevices";
const DISPATCHES = "callDispatches";
const SCHEDULES = "callSchedules";
const MAX_DEVICES = 5;

type DeviceEntry = { token: string; platform: string; updatedAt: string };
type DeviceDoc = { customerNo: string; devices: DeviceEntry[] };

export async function registerDevice(customerNo: string, token: string, platform: string, now = new Date()) {
  const store = await firestore();
  const ref = store.collection(DEVICES).doc(customerNo);
  await store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? ((snapshot.data() as DeviceDoc).devices ?? []) : [];
    const devices = [
      { token, platform, updatedAt: now.toISOString() },
      ...current.filter((device) => device.token !== token),
    ].slice(0, MAX_DEVICES);
    transaction.set(ref, { customerNo, devices });
  });
}

export async function unregisterDevice(customerNo: string, token: string) {
  const store = await firestore();
  const ref = store.collection(DEVICES).doc(customerNo);
  await store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const devices = ((snapshot.data() as DeviceDoc).devices ?? []).filter((device) => device.token !== token);
    transaction.set(ref, { customerNo, devices });
  });
}

export async function removeTokens(tokens: string[]) {
  if (tokens.length === 0) return;
  const store = await firestore();
  const snapshot = await store.collection(DEVICES).get();
  const invalid = new Set(tokens);
  await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data() as DeviceDoc;
      const kept = (data.devices ?? []).filter((device) => !invalid.has(device.token));
      if (kept.length !== (data.devices ?? []).length) await doc.ref.set({ ...data, devices: kept });
    }),
  );
}

// 학생별 등록된 기기 토큰(기기가 없으면 빠진다).
export async function tokensFor(customerNos: string[]): Promise<Map<string, string[]>> {
  if (customerNos.length === 0) return new Map();
  const store = await firestore();
  const docs = await store.getAll(...customerNos.map((customerNo) => store.collection(DEVICES).doc(customerNo)));
  return new Map(
    docs
      .filter((doc) => doc.exists)
      .map((doc) => [doc.id, ((doc.data() as DeviceDoc).devices ?? []).map((device) => device.token)] as const)
      .filter(([, tokens]) => tokens.length > 0),
  );
}

export async function devicesWithSchedules(): Promise<{ schedule: StoredCallSchedule; tokens: string[] }[]> {
  const store = await firestore();
  const schedules = await store.collection(SCHEDULES).where("active", "==", true).get();
  if (schedules.empty) return [];
  const refs = schedules.docs.map((doc) => store.collection(DEVICES).doc(doc.id));
  const devices = await store.getAll(...refs);
  const tokensByCustomer = new Map(
    devices.filter((doc) => doc.exists).map((doc) => [doc.id, ((doc.data() as DeviceDoc).devices ?? []).map((d) => d.token)]),
  );
  return schedules.docs
    .map((doc) => ({ schedule: doc.data() as StoredCallSchedule, tokens: tokensByCustomer.get(doc.id) ?? [] }))
    .filter((entry) => entry.tokens.length > 0);
}

// 같은 회차·종류는 한 번만 보낸다. 처음 기록하면 true.
export async function claimDispatch(customerNo: string, kind: DispatchKind, at: Date): Promise<boolean> {
  const store = await firestore();
  const ref = store.collection(DISPATCHES).doc(`${customerNo}_${kind}_${at.toISOString()}`);
  try {
    await ref.create({ customerNo, kind, at: at.toISOString(), createdAt: new Date().toISOString() });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 6) return false; // ALREADY_EXISTS
    throw error;
  }
}
