import { useCallback, useEffect, useRef, useState } from "react";

import type { MessageReaction, MessageUpdate, TeacherMessage } from "./callReviewApi";

type MessageService = {
  loadMessages?: () => Promise<TeacherMessage[]>;
  updateMessage?: (id: string, update: MessageUpdate) => Promise<TeacherMessage>;
};

// 선생님 메시지 목록과 읽음·반응. 실패해도 홈·통화는 그대로 쓸 수 있게 조용히 넘어간다.
export function useTeacherMessages({ loadMessages, updateMessage }: MessageService) {
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const reading = useRef(new Set<string>());

  const reload = useCallback(async () => {
    if (!loadMessages) return;
    try {
      setMessages(await loadMessages());
    } catch {
      // 다음에 앱을 열거나 알림을 받으면 다시 불러온다.
    }
  }, [loadMessages]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const apply = useCallback(
    async (id: string, update: MessageUpdate) => {
      if (!updateMessage) return;
      const now = new Date().toISOString();
      // 바로 화면에 반영하고, 서버 결과로 맞춘다.
      setMessages((current) =>
        current.map((message) =>
          message.id !== id
            ? message
            : { ...message, readAt: message.readAt ?? now, ...(update.action === "react" ? { reaction: update.reaction, reactedAt: now } : {}) },
        ),
      );
      try {
        const saved = await updateMessage(id, update);
        setMessages((current) => current.map((message) => (message.id === id ? saved : message)));
      } catch {
        void reload();
      }
    },
    [reload, updateMessage],
  );

  const markRead = useCallback(
    (id: string) => {
      if (reading.current.has(id)) return;
      reading.current.add(id);
      void apply(id, { action: "read" });
    },
    [apply],
  );

  const react = useCallback((id: string, reaction: MessageReaction) => void apply(id, { action: "react", reaction }), [apply]);

  return { messages, reload, markRead, react, enabled: Boolean(loadMessages) };
}
