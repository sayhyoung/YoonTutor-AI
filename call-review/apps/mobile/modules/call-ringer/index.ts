import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

// 안드로이드 관리 전화 알림(전체 화면 수신·벨·부재중). iOS·웹이나 이 모듈이 없는 예전 빌드에서는 null.
type CallRingerModule = {
  showIncomingCall(title: string, body: string): void;
  stopRinging(): void;
  isRinging(): boolean;
  clearMissedCalls(): void;
  dismissReminder(): void;
  canUseFullScreen(): boolean;
  openFullScreenSettings(): void;
  setShowOverLockScreen(show: boolean): void;
  addListener(event: "onIncomingCall", listener: () => void): { remove(): void };
};

export const CallRinger: CallRingerModule | null =
  Platform.OS === "android" ? requireOptionalNativeModule<CallRingerModule>("CallRinger") : null;
