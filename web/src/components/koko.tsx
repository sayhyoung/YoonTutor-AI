// AI 코치 마스코트 "코코" — 디자인 시안의 로봇 캐릭터 SVG.
export function Koko({ size = 80, float = false }: { size?: number; float?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        animation: float ? "koko-float 3.2s ease-in-out infinite" : undefined,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <line x1="60" y1="26" x2="60" y2="13" stroke="#9B8BFF" strokeWidth="5" strokeLinecap="round" />
        <circle cx="60" cy="9" r="6" fill="#FF9ED8" />
        <rect x="9" y="54" width="13" height="23" rx="6.5" fill="#6FE3FF" />
        <rect x="98" y="54" width="13" height="23" rx="6.5" fill="#6FE3FF" />
        <rect x="22" y="28" width="76" height="70" rx="27" fill="#7C6BFF" />
        <rect x="26" y="32" width="68" height="34" rx="22" fill="#9385FF" opacity="0.5" />
        <rect x="32" y="42" width="56" height="45" rx="21" fill="#2A2350" />
        <g>
          <circle cx="50" cy="63" r="7" fill="#6FE3FF" />
          <circle cx="70" cy="63" r="7" fill="#6FE3FF" />
          <circle cx="52.4" cy="60.6" r="2.2" fill="#fff" />
          <circle cx="72.4" cy="60.6" r="2.2" fill="#fff" />
        </g>
        <path d="M50 75 Q60 81 70 75" stroke="#6FE3FF" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <circle cx="40" cy="75" r="4" fill="#FF9ED8" opacity="0.7" />
        <circle cx="80" cy="75" r="4" fill="#FF9ED8" opacity="0.7" />
      </svg>
    </span>
  );
}
