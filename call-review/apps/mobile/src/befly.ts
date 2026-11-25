import type { ImageSourcePropType } from "react-native";

// 공식 2D 베플리 그림(컬러라인, 2026-11-25 교체). 원본은 회사 캐릭터 PNG 묶음에서 골라 512px 정사각으로 만들었다.
// 작은 원(44px 이하)에는 얼굴만 있는 표정 그림, 큰 자리에는 동작 그림을 쓴다.
// 예전 3D 그림은 assets/befly에 그대로 있다. 되돌리려면 이 파일과 잠금 화면 수신 그림(call_ringer_befly.png)을
// 2D 교체 전 커밋으로 돌리면 된다.
export const befly = {
  home: require("../assets/befly2d/befly-face-smile.png"),
  incoming: require("../assets/befly2d/befly-call-headset.png"),
  greeting: require("../assets/befly2d/befly-greeting.png"),
  talkIntro: require("../assets/befly2d/befly-talk-intro.png"),
  cheer: require("../assets/befly2d/befly-cheer.png"),
  diary: require("../assets/befly2d/befly-diary.png"),
  call: {
    speaking: require("../assets/befly2d/befly-face-happy.png"),
    listening: require("../assets/befly2d/befly-face-curious.png"),
    waiting: require("../assets/befly2d/befly-face-worried.png"),
    default: require("../assets/befly2d/befly-face-smile.png"),
  },
  hint: require("../assets/befly2d/befly-hint.png"),
  help: require("../assets/befly2d/befly-help.png"),
  review: {
    correct: require("../assets/befly2d/befly-correct.png"),
    retry: require("../assets/befly2d/befly-retry.png"),
  },
  result: {
    completed: require("../assets/befly2d/befly-result-complete.png"),
    stopped: require("../assets/befly2d/befly-result-stopped.png"),
    "no-response": require("../assets/befly2d/befly-result-noresponse.png"),
  },
  myPageEmpty: require("../assets/befly2d/befly-mypage-empty.png"),
} as const satisfies Record<string, unknown>;

export type BeflyCallState = "speaking" | "listening" | "waiting" | "default";

export function callAvatar(state: BeflyCallState): ImageSourcePropType {
  return befly.call[state];
}
