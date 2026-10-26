import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MessageReaction, TeacherMessage } from "./callReviewApi";
import { color, radius } from "./theme";

// 학생이 선생님 메시지에 보낼 수 있는 반응(글 답장은 받지 않는다). 교사 화면도 같은 아이콘을 쓴다.
export const REACTIONS: { key: MessageReaction; emoji: string; label: string }[] = [
  { key: "thanks", emoji: "👍", label: "고마워요" },
  { key: "check", emoji: "✅", label: "확인했어요" },
  { key: "love", emoji: "❤️", label: "좋아요" },
  { key: "cheer", emoji: "💪", label: "힘낼게요" },
];

// 홈 카드에 보여 줄 기간. 이보다 오래된 메시지는 마이페이지 메시지함에서만 본다.
const HOME_DAYS = 7;

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

// 홈에 띄울 메시지: 최근 7일 안에 받은 가장 새 메시지.
export function homeMessage(messages: TeacherMessage[], now = new Date()): TeacherMessage | null {
  const latest = messages[0];
  if (!latest) return null;
  return now.getTime() - new Date(latest.sentAt).getTime() <= HOME_DAYS * 24 * 60 * 60 * 1000 ? latest : null;
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
  compact,
  onReact,
}: {
  message: TeacherMessage;
  palette: Palette;
  compact?: boolean;
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
              compact && styles.reactionButtonCompact,
              { backgroundColor: on ? palette.accentSoft : palette.soft, borderColor: on ? palette.accent : "transparent" },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
            {compact ? null : <Text style={[styles.reactionLabel, { color: on ? palette.accent : palette.muted }]}>{reaction.label}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

// 홈: 다음 관리 전화 카드 아래의 최신 메시지. 보이면 읽음으로 남기고, 반응을 고르면 작게 접힌다.
export function HomeMessageCard({
  message,
  darkMode,
  onRead,
  onReact,
}: {
  message: TeacherMessage;
  darkMode: boolean;
  onRead: (id: string) => void;
  onReact: (id: string, reaction: MessageReaction) => void;
}) {
  const palette = darkMode ? DARK : LIGHT;
  useEffect(() => {
    if (!message.readAt) onRead(message.id);
  }, [message.id, message.readAt, onRead]);

  const chosen = REACTIONS.find((reaction) => reaction.key === message.reaction);
  if (chosen) {
    return (
      <View style={[styles.card, styles.cardCompact, { backgroundColor: palette.card }]} accessibilityLabel={`${teacherTitle(message)} 메시지에 ${chosen.label} 반응을 보냈어요`}>
        <Text style={styles.compactEmoji}>{chosen.emoji}</Text>
        <View style={styles.compactCopy}>
          <Text style={[styles.compactTitle, { color: palette.ink }]} numberOfLines={1}>{teacherTitle(message)}께 &lsquo;{chosen.label}&rsquo;를 보냈어요</Text>
          <Text style={[styles.compactBody, { color: palette.muted }]} numberOfLines={1}>{message.body}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: palette.card }]} accessibilityLabel="선생님 메시지">
      <View style={styles.cardHead}>
        <View style={[styles.teacherMark, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.teacherMarkText, { color: palette.accent }]}>{(message.teacherName ?? "선").slice(0, 1)}</Text>
        </View>
        <View style={styles.headCopy}>
          <Text style={[styles.title, { color: palette.ink }]}>{teacherTitle(message)}의 메시지</Text>
          <Text style={[styles.meta, { color: palette.muted }]}>{sentLabel(message.sentAt)}</Text>
        </View>
      </View>
      <Text style={[styles.body, { color: palette.ink }]}>{message.body}</Text>
      <Text style={[styles.prompt, { color: palette.muted }]}>선생님께 반응을 보내 볼까요?</Text>
      <ReactionRow message={message} palette={palette} onReact={(reaction) => onReact(message.id, reaction)} />
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
      <Text style={[styles.inboxTitle, { color: palette.ink }]}>선생님 메시지</Text>
      {messages.length === 0 ? (
        <Text style={[styles.empty, { color: palette.muted }]}>아직 받은 메시지가 없어요. 선생님이 리포트를 보고 남긴 말이 여기에 모여요.</Text>
      ) : (
        messages.map((message, index) => (
          <View key={message.id} style={[styles.inboxItem, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }]}>
            <Text style={[styles.meta, { color: palette.muted }]}>
              {teacherTitle(message)} · {sentLabel(message.sentAt)}
            </Text>
            <Text style={[styles.inboxBody, { color: palette.ink }]}>{message.body}</Text>
            <ReactionRow compact message={message} palette={palette} onReact={(reaction) => onReact(message.id, reaction)} />
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 20, gap: 12 },
  cardCompact: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  teacherMark: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  teacherMarkText: { fontSize: 17, fontWeight: "800" },
  headCopy: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: "700" },
  meta: { fontSize: 13 },
  body: { fontSize: 17, lineHeight: 26 },
  prompt: { fontSize: 13 },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reactionButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 6 },
  reactionButtonCompact: { minWidth: 44, paddingHorizontal: 10, justifyContent: "center" },
  reactionEmoji: { fontSize: 18 },
  reactionLabel: { fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  compactEmoji: { fontSize: 24 },
  compactCopy: { flex: 1, gap: 2 },
  compactTitle: { fontSize: 15, fontWeight: "700" },
  compactBody: { fontSize: 13 },
  inbox: { borderRadius: 24, padding: 22, gap: 4 },
  inboxTitle: { fontSize: 17, fontWeight: "700", marginBottom: 8 },
  inboxItem: { paddingVertical: 14, gap: 8 },
  inboxBody: { fontSize: 16, lineHeight: 24 },
  empty: { fontSize: 14, lineHeight: 21 },
});
