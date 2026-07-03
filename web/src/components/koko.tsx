// AI 코치 마스코트 "코코" — 디자인 시안의 로봇 캐릭터 SVG.
// mood로 눈/입 path만 분기(파일 1개 유지, 신규 에셋 불필요).
export type KokoMood = "default" | "happy" | "cheer" | "celebrate";

const EYE = "#6FE3FF";
const STAR = "M12 2l1.6 7L21 10l-7.4 1L12 18l-1.6-7L3 10l7.4-1L12 2Z";

function Face({ mood }: { mood: KokoMood }) {
  if (mood === "happy") {
    // 반달(∩) 눈 + 미소
    return (
      <>
        <path d="M43 64 Q50 57 57 64" stroke={EYE} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M63 64 Q70 57 77 64" stroke={EYE} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M50 74 Q60 81 70 74" stroke={EYE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (mood === "cheer") {
    // 한쪽 윙크 + 응원 미소
    return (
      <>
        <circle cx="50" cy="63" r="7" fill={EYE} />
        <circle cx="52.4" cy="60.6" r="2.2" fill="#fff" />
        <path d="M63 63 Q70 68 77 63" stroke={EYE} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M50 75 Q60 81 70 75" stroke={EYE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (mood === "celebrate") {
    // 별 눈 + 크게 벌린 입
    return (
      <>
        <g transform="translate(43 56) scale(0.62)">
          <path d={STAR} fill={EYE} />
        </g>
        <g transform="translate(63 56) scale(0.62)">
          <path d={STAR} fill={EYE} />
        </g>
        <path d="M46 73 Q60 90 74 73" stroke={EYE} strokeWidth="4.2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  // default
  return (
    <>
      <circle cx="50" cy="63" r="7" fill={EYE} />
      <circle cx="70" cy="63" r="7" fill={EYE} />
      <circle cx="52.4" cy="60.6" r="2.2" fill="#fff" />
      <circle cx="72.4" cy="60.6" r="2.2" fill="#fff" />
      <path d="M50 75 Q60 81 70 75" stroke={EYE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
    </>
  );
}

export function Koko({
  size = 80,
  float = false,
  mood = "default",
}: {
  size?: number;
  float?: boolean;
  mood?: KokoMood;
}) {
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
        <Face mood={mood} />
        <circle cx="40" cy="75" r="4" fill="#FF9ED8" opacity="0.7" />
        <circle cx="80" cy="75" r="4" fill="#FF9ED8" opacity="0.7" />
      </svg>
    </span>
  );
}
