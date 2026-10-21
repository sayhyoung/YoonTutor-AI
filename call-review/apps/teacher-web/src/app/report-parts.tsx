import type { Segment } from "./charts";
import type { CallOutcome } from "./types";

// 표현 판정 3종은 색과 명도를 모두 다르게 두고, 범례에 이름·수치를 함께 쓴다.
export function OUTCOME_SEGMENTS(counts: Record<CallOutcome, number>): Segment[] {
  return [
    { key: "correct", label: "복습함", value: counts.correct, tone: "correct" },
    { key: "retry", label: "복습 필요", value: counts.retry, tone: "retry" },
    { key: "skipped", label: "못 했어요", value: counts.skipped, tone: "skipped" },
  ];
}

export function DailyBarsLegend() {
  return (
    <ul className="inline-legend" aria-hidden="true">
      <li><span className="legend-dot tone-correct" />정상 완료</li>
      <li><span className="legend-dot tone-stopped" />직접 종료</li>
      <li><span className="legend-dot tone-retry" />응답 없음</li>
    </ul>
  );
}
