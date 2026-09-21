import { Platform } from "react-native";

export const color = {
  paper: "#F7F4FC",
  surface: "#FFFCFF",
  surfaceMuted: "#F0EBFA",
  call: "#171522",
  callRaised: "#242130",
  callPulseOuter: "#2B2740",
  callPulseMiddle: "#3B3563",
  callHint: "#2D2848",
  ink: "#262231",
  inkInverse: "#FAF9FF",
  muted: "#756F80",
  mutedInverse: "#B4AEBD",
  primary: "#6D58F0",
  primaryStrong: "#5D46E8",
  primarySoft: "#EAE5FF",
  success: "#247F48",
  warning: "#E6A63B",
  danger: "#EF5B62",
  line: "#E4DDF0",
  lineInverse: "#3B3748",
  accentInk: "#FEFCFF",
  shadow: "#2B2050",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const font = {
  body: Platform.select({
    ios: "Apple SD Gothic Neo",
    android: "sans-serif",
    default: "system-ui",
  }),
  display: Platform.select({
    ios: "Apple SD Gothic Neo",
    android: "sans-serif-medium",
    default: "system-ui",
  }),
} as const;
