// 리포트용 차트(외부 라이브러리 없이 CSS·SVG). 색만으로 구분하지 않도록 범례에 수치를 함께 쓴다.

import type { DailyCalls } from "./types";

export type Segment = { key: string; label: string; value: number; tone: string };

export function Donut({
  segments,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      cursor += (segment.value / total) * 100;
      return `var(--tone-${segment.tone}) ${start}% ${cursor}%`;
    });
  const background = total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--color-paper-2)";

  return (
    <div className="donut-layout">
      <div className="donut" role="img" aria-label={`${ariaLabel}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`} style={{ background }}>
        <div className="donut-center">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="legend-list">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`legend-dot tone-${segment.tone}`} aria-hidden="true" />
            <span>{segment.label}</span>
            <strong>{segment.value}</strong>
            <small>{total > 0 ? `${Math.round((segment.value / total) * 100)}%` : "—"}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StackedBars({ rows }: { rows: { label: string; segments: Segment[] }[] }) {
  if (rows.length === 0) return <p className="chart-empty">표시할 데이터가 없어요.</p>;
  return (
    <div className="stacked-rows">
      {rows.map((row) => {
        const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
        return (
          <div className="stacked-row" key={row.label}>
            <div className="stacked-row-head">
              <span>{row.label}</span>
              <strong>{total}개</strong>
            </div>
            <div className="stacked-bar" role="img" aria-label={`${row.label}: ${row.segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
              {row.segments.map((segment) =>
                segment.value > 0 ? (
                  <span
                    className={`tone-${segment.tone}`}
                    key={segment.key}
                    style={{ width: `${(segment.value / Math.max(total, 1)) * 100}%` }}
                    title={`${segment.label} ${segment.value}`}
                  />
                ) : null,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 통화별 복습 정답률 추이. 판정할 표현이 없던 통화는 점을 건너뛴다.
export function TrendLine({ points }: { points: { label: string; accuracy: number | null }[] }) {
  const valid = points.map((point, index) => ({ ...point, index })).filter((point) => point.accuracy !== null);
  if (valid.length === 0) return <p className="chart-empty">정답률을 계산할 통화가 아직 없어요.</p>;

  const width = 560;
  const height = 200;
  const padX = 28;
  const padY = 22;
  const x = (index: number) =>
    points.length === 1 ? width / 2 : padX + (index / (points.length - 1)) * (width - padX * 2);
  const y = (value: number) => height - padY - (value / 100) * (height - padY * 2);
  const line = valid.map((point, i) => `${i === 0 ? "M" : "L"}${x(point.index)},${y(point.accuracy as number)}`).join(" ");
  const area = `${line} L${x(valid.at(-1)!.index)},${height - padY} L${x(valid[0].index)},${height - padY} Z`;

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`통화별 복습 정답률: ${valid.map((p) => `${p.label} ${p.accuracy}%`).join(", ")}`}>
      <defs>
        <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line className="trend-grid" x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} />
          <text className="trend-tick" x={4} y={y(tick) + 4}>{tick}</text>
        </g>
      ))}
      <path d={area} fill="url(#trend-fill)" />
      <path className="trend-line" d={line} />
      {valid.map((point) => (
        <g key={point.index}>
          <circle className="trend-dot" cx={x(point.index)} cy={y(point.accuracy as number)} r={5} />
          <text className="trend-value" x={x(point.index)} y={y(point.accuracy as number) - 10} textAnchor="middle">
            {point.accuracy}%
          </text>
        </g>
      ))}
      {points.map((point, index) => (
        <text className="trend-label" key={`${point.label}-${index}`} x={x(index)} y={height - 4} textAnchor="middle">
          {point.label}
        </text>
      ))}
    </svg>
  );
}

// 최근 N일 일별 통화 수(종료 유형별 누적 막대).
export function DailyBars({ days }: { days: DailyCalls[] }) {
  const max = Math.max(1, ...days.map((day) => day.completed + day.stopped + day.noResponse));
  return (
    <div className="daily-bars" role="img" aria-label={`최근 ${days.length}일 일별 통화 수: ${days.map((d) => `${d.date.slice(5)} ${d.completed + d.stopped + d.noResponse}건`).join(", ")}`}>
      {days.map((day) => {
        const total = day.completed + day.stopped + day.noResponse;
        return (
          <div className="daily-bar" key={day.date}>
            <span className="daily-bar-value">{total > 0 ? total : ""}</span>
            <div className="daily-bar-track">
              <div className="daily-bar-stack" style={{ height: `${(total / max) * 100}%` }}>
                {day.noResponse > 0 ? <span className="tone-retry" style={{ flex: day.noResponse }} /> : null}
                {day.stopped > 0 ? <span className="tone-stopped" style={{ flex: day.stopped }} /> : null}
                {day.completed > 0 ? <span className="tone-correct" style={{ flex: day.completed }} /> : null}
              </div>
            </div>
            <span className="daily-bar-label">{Number(day.date.slice(8))}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Kpi({
  label,
  value,
  unit,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  detail?: string;
  tone?: "default" | "good" | "warn" | "accent";
}) {
  return (
    <article className={`kpi kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </strong>
      {detail ? <span className="kpi-detail">{detail}</span> : null}
    </article>
  );
}
