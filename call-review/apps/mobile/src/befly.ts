import type { ImageSourcePropType } from "react-native";

export const befly = {
  home: require("../assets/befly/avatar/befly-home-avatar.png"),
  incoming: require("../assets/befly/avatar/befly-incoming-avatar.png"),
  call: {
    speaking: require("../assets/befly/avatar/befly-call-speaking-avatar.png"),
    listening: require("../assets/befly/avatar/befly-call-listening-avatar.png"),
    waiting: require("../assets/befly/avatar/befly-call-waiting-avatar.png"),
    default: require("../assets/befly/avatar/befly-call-default-avatar.png"),
  },
  hint: require("../assets/befly/avatar/befly-hint-avatar.png"),
  help: require("../assets/befly/avatar/befly-help-avatar.png"),
  review: {
    correct: require("../assets/befly/avatar/befly-correct-avatar.png"),
    retry: require("../assets/befly/avatar/befly-retry-avatar.png"),
  },
  result: {
    completed: require("../assets/befly/avatar/befly-result-complete-avatar.png"),
    stopped: require("../assets/befly/avatar/befly-result-early-avatar.png"),
    "no-response": require("../assets/befly/avatar/befly-result-noresponse-avatar.png"),
  },
  myPageEmpty: require("../assets/befly/full/befly-mypage-empty.png"),
} as const satisfies Record<string, unknown>;

export type BeflyCallState = "speaking" | "listening" | "waiting" | "default";

export function callAvatar(state: BeflyCallState): ImageSourcePropType {
  return befly.call[state];
}
