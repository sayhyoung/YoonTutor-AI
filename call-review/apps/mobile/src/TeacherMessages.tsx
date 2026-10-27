import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MessageReaction, TeacherMessage } from "./callReviewApi";
import { color, radius } from "./theme";

// 학생이 선생님 메시지에 보낼 수 있는 반응(글 답장은 받지 않는다). 교사 화면도 같은 아이콘을 쓴다.
// 홈에는 메시지를 띄우지 않고, 마이페이지 버튼의 숫자로 새 메시지를 알린다.
export const REACTIONS: { key: MessageReaction; emoji: string; label: string }[] = [
  { key: "thanks", emoji: "👍", label: "고마워요" },
  { key: "check", emoji: "✅", label: "확인했어요" },
  { key: "love", emoji: "❤️", label: "좋아요" },
  { key: "cheer", emoji: "💪", label: "힘낼게요" },
];

function sentLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const time = `${date.getHours() < 12 ? "오전" : "오후"} ${date.getHours() % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")}`;
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / (24 * 60 * 60 * 1000));
  if (diff === 0) return `오늘 ${time}`;
  if (diff === 1) return `어제 ${time}`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function teacherTitle(message: TeacherMessage) {
  return message.teacherName ? `${message.teacherName} 선생님` : "선생님";
}

type Palette = { card: string; soft: string; ink: string; muted: string; accent: string; accentSoft: string; line: string };

const LIGHT: Palette = {
  card: color.surface,
  soft: color.surfaceMuted,
  ink: color.ink,
  muted: color.muted,
  accent: color.primaryStrong,
  accentSoft: color.primarySoft,
  line: color.line,
};

const DARK: Palette = {
  card: color.callRaised,
  soft: color.callPulseOuter,
  ink: color.inkInverse,
  muted: color.mutedInverse,
  accent: color.actionInkDark,
  accentSoft: color.actionSoftDark,
  line: color.lineInverse,
};

function ReactionRow({
  message,
  palette,
  onReact,
}: {
  message: TeacherMessage;
  palette: Palette;
  onReact: (reaction: MessageReaction) => void;
}) {
  return (
    <View style={styles.reactionRow} accessibilityRole="radiogroup" accessibilityLabel="선생님께 보낼 반응">
      {REACTIONS.map((reaction) => {
        const on = message.reaction === reaction.key;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={reaction.label}
            key={reaction.key}
            onPress={() => onReact(reaction.key)}
            style={({ pressed }) => [
              styles.reactionButton,
              { backgroundColor: on ? palette.accentSoft : palette.soft, borderColor: on ? palette.accent : "transparent" },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            <Text style={[styles.reactionLabel, { color: on ? palette.accent : palette.muted }]}>{reaction.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 마이페이지: 받은 메시지 모아 보기. 열면 아직 안 읽은 메시지를 읽음으로 남긴다.
export function MessageInbox({
  messages,
  darkMode,
  onRead,
  onReact,
}: {
  messages: TeacherMessage[];
  darkMode: boolean;
  onRead: (id: string) => void;
  onReact: (id: string, reaction: MessageReaction) => void;
}) {
  const palette = darkMode ? DARK : LIGHT;
  useEffect(() => {
    for (const message of messages) if (!message.readAt) onRead(message.id);
  }, [messages, onRead]);

  return (
    <View style={[styles.inbox, { backgroundColor: palette.card }]}>
      <Text style={[styles.inboxTitle, { color: palette.ink }]}>선생님으로부터 받은 메시지</Text>
      {messages.length > 0 ? (
        <Text style={[styles.hint, { color: palette.muted }]}>아이콘을 하나 고르면 선생님께 바로 전달돼요.</Text>
      ) : null}
      {messages.length === 0 ? (
        <Text style={[styles.empty, { color: palette.muted }]}>아직 받은 메시지가 없어요. 선생님이 리포트를 보고 남긴 말이 여기에 모여요.</Text>
      ) : (
        messages.map((message, index) => (
          <View key={message.id} style={[styles.inboxItem, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
            <Text style={[styles.meta, { color: palette.muted }]}>
              {teacherTitle(message)} · {sentLabel(message.sentAt)}
            </Text>
            <Text style={[styles.inboxBody, { color: palette.ink }]}>{message.body}</Text>
            <ReactionRow message={message} palette={palette} onReact={(reaction) => onReact(message.id, reaction)} />
            {message.reaction ? (
              <Text style={[styles.sentNote, { color: palette.accent }]}>
                {REACTIONS.find((reaction) => reaction.key === message.reaction)?.label} · 선생님께 보냈어요
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 13 },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reactionButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 6 },
  reactionEmoji: { fontSize: 18 },
  reactionLabel: { fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  inbox: { borderRadius: 24, padding: 22, gap: 4 },
  inboxTitle: { fontSize: 17, fontWeight: "700" },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  sentNote: { fontSize: 13, fontWeight: "700" },
  inboxItem: { paddingVertical: 14, gap: 8 },
  inboxBody: { fontSize: 16, lineHeight: 24 },
  empty: { fontSize: 14, lineHeight: 21 },
});
