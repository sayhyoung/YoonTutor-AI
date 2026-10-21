import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { befly } from "./befly";
import { analyzeLearning, beflyComment, type LearningStatus, type Outcome } from "./learningStatus";
import { color, font, radius } from "./theme";
import type { CallHistoryEntry } from "@yoon-call/shared";

// 마이페이지 "나의 학습현황". 예전 AI 튜터 학습 리포트 구성을 따른다:
// 누적 지표 4칸 → 베플리 한마디 → 정답률 변화 → 결과 분포 → 영역별 성취 → 다시 볼 표현.
// Android에서 굵기 지정 글꼴이 시스템 글꼴로 바뀌지 않도록 fontWeight 대신 굵기별 fontFamily만 쓴다.

type Palette = {
  card: string;
  soft: string;
  ink: string;
  muted: string;
  line: string;
  correct: string;
  retry: string;
  skipped: string;
  accent: string;
};

const LIGHT: Palette = {
  card: color.surface,
  soft: color.surfaceMuted,
  ink: color.ink,
  muted: color.muted,
  line: color.line,
  correct: color.success,
  retry: color.befly,
  skipped: "#B9B2A6",
  accent: color.primary,
};

const DARK: Palette = {
  card: color.callRaised,
  soft: color.callPulseOuter,
  ink: color.inkInverse,
  muted: color.mutedInverse,
  line: color.lineInverse,
  correct: color.successDark,
  retry: color.beflyDark,
  skipped: "#5B6070",
  accent: color.actionDark,
};

const OUTCOME_LABEL: Record<Outcome, string> = { correct: "정확해요", retry: "복습 필요", skipped: "못 했어요" };
const OUTCOMES: Outcome[] = ["correct", "retry", "skipped"];

export function LearningStatusSection({ history, darkMode }: { history: CallHistoryEntry[]; darkMode: boolean }) {
  const status = analyzeLearning(history);
  const p = darkMode ? DARK : LIGHT;

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={[styles.sectionTitle, { color: p.ink }]}>나의 학습현황</Text>
        {status.streakDays >= 2 ? (
          <View style={[styles.streakPill, { backgroundColor: darkMode ? color.callPulseMiddle : color.beflySoft }]}>
            <Text style={[styles.streakText, { color: darkMode ? color.beflyDark : color.warningInk }]}>{status.streakDays}일 연속 통화</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metricGrid}>
        <Metric p={p} label="총 통화" value={`${status.calls}`} unit="회" sub={status.calls > 0 ? `끝까지 ${status.completedCalls}회` : undefined} />
        <Metric p={p} label="평균 정답률" value={status.averageAccuracy === null ? "—" : `${status.averageAccuracy}`} unit={status.averageAccuracy === null ? "" : "%"} />
        <Metric p={p} label="최고 정답률" value={status.bestAccuracy === null ? "—" : `${status.bestAccuracy}`} unit={status.bestAccuracy === null ? "" : "%"} />
        <Metric p={p} label="최근 통화" value={status.lastCallLabel ?? "—"} small />
      </View>

      <View style={styles.commentRow}>
        <Image source={befly.result.completed} style={styles.commentAvatar} accessibilityLabel="베플리 선생님" />
        <View style={[styles.commentBubble, { backgroundColor: p.card }]}>
          <Text style={[styles.commentLabel, { color: p.accent }]}>베플리 선생님 한마디</Text>
          <Text style={[styles.commentText, { color: p.ink }]}>{beflyComment(status)}</Text>
        </View>
      </View>

      {status.calls > 0 ? (
        <>
          <Card p={p} title="정답률 변화" note={`최근 ${Math.min(status.trend.length, 10)}번 통화`}>
            <TrendChart trend={status.trend.slice(-10)} p={p} />
          </Card>
          <Card p={p} title="복습 결과" note="지금까지 말해 본 표현">
            <OutcomeDonut totals={status.outcomeTotals} p={p} />
          </Card>
          {status.bySource.length > 0 ? (
            <Card p={p} title="영역별 성취" note="단어와 문장 복습 결과">
              <SourceBars rows={status.bySource} p={p} />
            </Card>
          ) : null}
          <Card p={p} title="다시 볼 표현" note="다음 통화에서 한 번 더 말해 봐요">
            {status.missed.length === 0 ? (
              <Text style={[styles.emptyText, { color: p.muted }]}>다시 볼 표현이 없어요. 모두 정확하게 말했어요!</Text>
            ) : (
              status.missed.slice(0, 5).map((row, index) => (
                <View key={row.answerEn} style={[styles.missedRow, index > 0 && { borderTopWidth: 1, borderTopColor: p.line }]}>
                  <View style={styles.missedCopy}>
                    <Text style={[styles.missedEn, { color: p.ink }]}>{row.answerEn}</Text>
                    <Text style={[styles.missedKo, { color: p.muted }]}>{row.promptKo}</Text>
                    {row.lastAnswer ? <Text style={[styles.missedKo, { color: p.muted }]}>내 답: {row.lastAnswer}</Text> : null}
                  </View>
                  <View style={[styles.missCount, { backgroundColor: darkMode ? color.callPulseMiddle : color.beflySoft }]}>
                    <Text style={[styles.missCountText, { color: darkMode ? color.beflyDark : color.warningInk }]}>{row.misses}번</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
          <Card p={p} title="제대로 못한 표현" note="대답하지 못하고 넘어간 표현">
            {status.skipped.length === 0 ? (
              <Text style={[styles.emptyText, { color: p.muted }]}>넘어간 표현이 없어요. 모든 표현에 도전했어요!</Text>
            ) : (
              status.skipped.slice(0, 5).map((row, index) => (
                <View key={row.answerEn} style={[styles.missedRow, index > 0 && { borderTopWidth: 1, borderTopColor: p.line }]}>
                  <View style={styles.missedCopy}>
                    <Text style={[styles.missedEn, { color: p.ink }]}>{row.answerEn}</Text>
                    <Text style={[styles.missedKo, { color: p.muted }]}>{row.promptKo}</Text>
                  </View>
                  <View style={[styles.missCount, { backgroundColor: p.soft }]}>
                    <Text style={[styles.missCountText, { color: p.muted }]}>{row.times}번 넘김</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </View>
  );
}

function Metric({ p, label, value, unit, sub, small }: { p: Palette; label: string; value: string; unit?: string; sub?: string; small?: boolean }) {
  return (
    <View style={[styles.metric, { backgroundColor: p.card }]}>
      <Text style={[styles.metricLabel, { color: p.muted }]}>{label}</Text>
      <Text style={[small ? styles.metricValueSmall : styles.metricValue, { color: p.ink }]}>
        {value}
        {unit ? <Text style={[styles.metricUnit, { color: p.ink }]}>{unit}</Text> : null}
      </Text>
      {sub ? <Text style={[styles.metricSub, { color: p.muted }]}>{sub}</Text> : null}
    </View>
  );
}

function Card({ p, title, note, children }: { p: Palette; title: string; note: string; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: p.card }]}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: p.ink }]}>{title}</Text>
        <Text style={[styles.cardNote, { color: p.muted }]}>{note}</Text>
      </View>
      {children}
    </View>
  );
}

const CHART_HEIGHT = 150;
const CHART_PAD = { top: 16, right: 12, bottom: 24, left: 30 };

function TrendChart({ trend, p }: { trend: LearningStatus["trend"]; p: Palette }) {
  const [width, setWidth] = useState(0);
  const plotW = Math.max(width - CHART_PAD.left - CHART_PAD.right, 1);
  const plotH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const x = (index: number) => CHART_PAD.left + (trend.length === 1 ? plotW / 2 : (plotW * index) / (trend.length - 1));
  const y = (value: number) => CHART_PAD.top + plotH * (1 - value / 100);
  const points = trend.flatMap((point, index) => (point.accuracy === null ? [] : [{ x: x(index), y: y(point.accuracy), value: point.accuracy }]));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const last = points.at(-1);
  const labelEvery = trend.length > 6 ? 2 : 1;

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`정답률 변화. ${trend.map((point) => `${point.label} ${point.accuracy ?? "기록 없음"}${point.accuracy === null ? "" : "%"}`).join(", ")}`}
    >
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          {[0, 50, 100].map((tick) => (
            <Line key={tick} x1={CHART_PAD.left} x2={width - CHART_PAD.right} y1={y(tick)} y2={y(tick)} stroke={p.line} strokeWidth={1} strokeDasharray={tick === 0 ? undefined : "4 4"} />
          ))}
          {[0, 50, 100].map((tick) => (
            <SvgText key={`t${tick}`} x={CHART_PAD.left - 6} y={y(tick) + 4} fontSize={10} fill={p.muted} textAnchor="end">
              {tick}
            </SvgText>
          ))}
          {points.length > 1 ? <Path d={path} stroke={p.accent} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.map((point, index) => (
            <Circle key={index} cx={point.x} cy={point.y} r={point === last ? 6 : 4} fill={point === last ? p.accent : p.card} stroke={p.accent} strokeWidth={2.5} />
          ))}
          {last ? (
            <SvgText x={Math.min(last.x, width - CHART_PAD.right - 4)} y={Math.max(last.y - 12, 11)} fontSize={12} fontWeight="700" fill={p.accent} textAnchor="middle">
              {`${last.value}%`}
            </SvgText>
          ) : null}
          {trend.map((point, index) =>
            index % labelEvery === 0 || index === trend.length - 1 ? (
              <SvgText key={`l${index}`} x={x(index)} y={CHART_HEIGHT - 6} fontSize={10} fill={p.muted} textAnchor="middle">
                {point.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : (
        <View style={{ height: CHART_HEIGHT }} />
      )}
    </View>
  );
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const point = (angle: number) => [cx + r * Math.cos(angle - Math.PI / 2), cy + r * Math.sin(angle - Math.PI / 2)];
  const [sx, sy] = point(start);
  const [ex, ey] = point(end);
  return `M${sx},${sy} A${r},${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${ex},${ey}`;
}

function OutcomeDonut({ totals, p }: { totals: Record<Outcome, number>; p: Palette }) {
  const total = OUTCOMES.reduce((sum, key) => sum + totals[key], 0);
  const judged = totals.correct + totals.retry;
  const accuracy = judged > 0 ? Math.round((totals.correct / judged) * 100) : null;
  const size = 116;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const colors: Record<Outcome, string> = { correct: p.correct, retry: p.retry, skipped: p.skipped };
  let angle = 0;
  const gap = total > 1 ? 0.04 : 0;

  return (
    <View style={styles.donutRow}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.soft} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            OUTCOMES.map((key) => {
              const sweep = (totals[key] / total) * Math.PI * 2;
              const start = angle;
              angle += sweep;
              if (totals[key] === 0) return null;
              if (totals[key] === total) return <Circle key={key} cx={size / 2} cy={size / 2} r={r} stroke={colors[key]} strokeWidth={stroke} fill="none" />;
              return <Path key={key} d={arcPath(size / 2, size / 2, r, start + gap / 2, start + sweep - gap / 2)} stroke={colors[key]} strokeWidth={stroke} fill="none" />;
            })}
        </Svg>
        <View style={styles.donutCenter} pointerEvents="none">
          <Text style={[styles.donutValue, { color: p.ink }]}>{accuracy === null ? "—" : `${accuracy}%`}</Text>
          <Text style={[styles.donutLabel, { color: p.muted }]}>정답률</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {OUTCOMES.map((key) => (
          <View key={key} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors[key] }]} />
            <Text style={[styles.legendLabel, { color: p.muted }]}>{OUTCOME_LABEL[key]}</Text>
            <Text style={[styles.legendValue, { color: p.ink }]}>{totals[key]}개</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SourceBars({ rows, p }: { rows: LearningStatus["bySource"]; p: Palette }) {
  const colors: Record<Outcome, string> = { correct: p.correct, retry: p.retry, skipped: p.skipped };
  return (
    <View style={styles.sourceList}>
      {rows.map((row) => {
        const total = OUTCOMES.reduce((sum, key) => sum + row.counts[key], 0);
        const judged = row.counts.correct + row.counts.retry;
        return (
          <View key={row.label} style={styles.sourceRow}>
            <View style={styles.sourceHead}>
              <Text style={[styles.sourceLabel, { color: p.ink }]}>{row.label}</Text>
              <Text style={[styles.sourceMeta, { color: p.muted }]}>
                {total}개 중 정확 {row.counts.correct}개{judged > 0 ? ` · ${Math.round((row.counts.correct / judged) * 100)}%` : ""}
              </Text>
            </View>
            <View style={[styles.sourceTrack, { backgroundColor: p.soft }]}>
              {OUTCOMES.map((key) =>
                row.counts[key] > 0 ? <View key={key} style={{ flex: row.counts[key], backgroundColor: colors[key] }} /> : null,
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { fontFamily: font.display, fontSize: 17 },
  streakPill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  streakText: { fontFamily: font.semibold, fontSize: 12 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexBasis: "47%", flexGrow: 1, borderRadius: 20, padding: 16, gap: 2 },
  metricLabel: { fontFamily: font.body, fontSize: 13 },
  metricValue: { fontFamily: font.englishBold, fontSize: 30, lineHeight: 36 },
  metricValueSmall: { fontFamily: font.display, fontSize: 20, lineHeight: 36 },
  metricUnit: { fontFamily: font.body, fontSize: 15 },
  metricSub: { fontFamily: font.body, fontSize: 12 },
  commentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  commentAvatar: { width: 64, height: 64, borderRadius: 32 },
  commentBubble: { flex: 1, borderRadius: 20, borderTopLeftRadius: 6, padding: 14, gap: 4 },
  commentLabel: { fontFamily: font.semibold, fontSize: 12 },
  commentText: { fontFamily: font.body, fontSize: 14, lineHeight: 21 },
  card: { borderRadius: 22, padding: 18, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontFamily: font.display, fontSize: 15 },
  cardNote: { flexShrink: 1, fontFamily: font.body, fontSize: 12, textAlign: "right" },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  donutCenter: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  donutValue: { fontFamily: font.englishBold, fontSize: 22 },
  donutLabel: { fontFamily: font.body, fontSize: 11 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontFamily: font.body, fontSize: 14 },
  legendValue: { fontFamily: font.semibold, fontSize: 14 },
  sourceList: { gap: 14 },
  sourceRow: { gap: 6 },
  sourceHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  sourceLabel: { fontFamily: font.semibold, fontSize: 14 },
  sourceMeta: { fontFamily: font.body, fontSize: 12 },
  sourceTrack: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row" },
  missedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  missedCopy: { flex: 1, gap: 2 },
  missedEn: { fontFamily: font.englishBold, fontSize: 16 },
  missedKo: { fontFamily: font.body, fontSize: 13 },
  missCount: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  missCountText: { fontFamily: font.semibold, fontSize: 12 },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 21 },
});
