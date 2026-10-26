// 선생님 메시지: 교사가 리포트에서 학생에게 보낸 글과 학생의 읽음·반응.
// 학생은 글로 답하지 않고 정해진 반응 아이콘 하나만 고른다(나중에 바꿀 수 있음).

export const MESSAGE_REACTIONS = ["thanks", "check", "love", "cheer"] as const;
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

export type StoredTeacherMessage = {
  schemaVersion: 1;
  id: string;
  customerNo: string;
  teacherNo: string;
  teacherName: string | null;
  body: string;
  sentAt: string;
  readAt?: string;
  reaction?: MessageReaction;
  reactedAt?: string;
};

// 학생 앱·교사 화면에 내려 주는 값(회원번호·교사 번호 제외).
export type TeacherMessageView = Pick<StoredTeacherMessage, "id" | "teacherName" | "body" | "sentAt" | "readAt" | "reaction" | "reactedAt">;

export function isMessageReaction(value: unknown): value is MessageReaction {
  return typeof value === "string" && (MESSAGE_REACTIONS as readonly string[]).includes(value);
}

export function toMessageView(message: StoredTeacherMessage): TeacherMessageView {
  return {
    id: message.id,
    teacherName: message.teacherName,
    body: message.body,
    sentAt: message.sentAt,
    ...(message.readAt ? { readAt: message.readAt } : {}),
    ...(message.reaction ? { reaction: message.reaction } : {}),
    ...(message.reactedAt ? { reactedAt: message.reactedAt } : {}),
  };
}

export type MessageUpdate = { action: "read" } | { action: "react"; reaction: MessageReaction };

export function parseMessageUpdate(value: unknown): MessageUpdate | null {
  const body = (value ?? {}) as Record<string, unknown>;
  if (body.action === "read") return { action: "read" };
  if (body.action === "react" && isMessageReaction(body.reaction)) return { action: "react", reaction: body.reaction };
  return null;
}

// 읽음은 처음 한 번만 남기고, 반응을 고르면 읽은 것으로도 본다.
export function applyMessageUpdate(message: StoredTeacherMessage, update: MessageUpdate, now: Date): StoredTeacherMessage {
  const at = now.toISOString();
  const read = { ...message, readAt: message.readAt ?? at };
  return update.action === "read" ? read : { ...read, reaction: update.reaction, reactedAt: at };
}
