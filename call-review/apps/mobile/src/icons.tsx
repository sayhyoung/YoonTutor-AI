import Svg, { Circle, Path, Rect } from "react-native-svg";

// Stroke icons from the Paper Call design system (24×24 grid).
export type IconName =
  | "mic"
  | "mic-off"
  | "stop"
  | "keyboard"
  | "hint"
  | "answer-help"
  | "replay"
  | "moon"
  | "sun"
  | "phone"
  | "phone-end"
  | "check"
  | "retry"
  | "close"
  | "send"
  | "clock"
  | "lock"
  | "person"
  | "back"
  | "sound-off"
  | "chevron-right";

export function Icon({
  name,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  const stroke = {
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === "mic" && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...stroke} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...stroke} />
        </>
      )}
      {name === "mic-off" && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...stroke} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" {...stroke} />
        </>
      )}
      {name === "stop" && <Rect x={6} y={6} width={12} height={12} rx={3} fill={color} />}
      {name === "keyboard" && (
        <>
          <Rect x={3} y={6} width={18} height={12} rx={2.5} {...stroke} />
          <Path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" {...stroke} />
        </>
      )}
      {name === "hint" && (
        <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" {...stroke} />
      )}
      {name === "answer-help" && <Path d="M4 5h16v11H9l-5 4zM8 9h8M8 12.5h5" {...stroke} />}
      {name === "replay" && <Path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7" {...stroke} />}
      {name === "moon" && <Path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" {...stroke} />}
      {name === "sun" && (
        <>
          <Circle cx={12} cy={12} r={4} {...stroke} />
          <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...stroke} />
        </>
      )}
      {name === "phone" && (
        <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" {...stroke} />
      )}
      {name === "phone-end" && (
        <Path d="M3 14.5c5-4.7 13-4.7 18 0l-2.3 2.3-3.4-1.5v-2.5a10 10 0 0 0-6.6 0v2.5l-3.4 1.5z" {...stroke} />
      )}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} />}
      {name === "retry" && (
        <Path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" {...stroke} />
      )}
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
      {name === "send" && <Path d="M5 12h14M13 6l6 6-6 6" {...stroke} />}
      {name === "clock" && (
        <>
          <Circle cx={12} cy={13} r={8} {...stroke} />
          <Path d="M12 9v4l2.5 2.5M9 2h6" {...stroke} />
        </>
      )}
      {name === "lock" && (
        <>
          <Rect x={5} y={11} width={14} height={10} rx={2} {...stroke} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...stroke} />
        </>
      )}
      {name === "person" && (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4 21a8 8 0 0 1 16 0" {...stroke} />
        </>
      )}
      {name === "back" && <Path d="M15 5l-7 7 7 7" {...stroke} />}
      {name === "sound-off" && <Path d="M4 9v6h4l5 4V5L8 9H4zM16.5 9.5l5 5M21.5 9.5l-5 5" {...stroke} />}
      {name === "chevron-right" && <Path d="M9 5l7 7-7 7" {...stroke} />}
    </Svg>
  );
}
