/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import type {
  CallHistoryEntry,
  CallPlan,
  ConversationChoice,
  InputMode,
  TeacherScheduleSettings,
} from "@yoon-call/shared";
import { MAX_REVIEW_ATTEMPTS } from "@yoon-call/shared";

import {
  type CallReviewRepository,
  type CallReviewSnapshot,
  createApiCallReviewRepository,
  previewCallReviewRepository,
} from "./src/callReviewRepository";
import {
  ApiError,
  type CallReportPayload,
  callReviewApiBaseUrl,
  login,
  logout,
  tokenStorage,
  unregisterPushDevice,
} from "./src/callReviewApi";
import { color, font, radius, space } from "./src/theme";
import { befly, callAvatar } from "./src/befly";
import { Icon, type IconName } from "./src/icons";
import { LearningStatusSection } from "./src/LearningStatusSection";
import { MessageInbox } from "./src/TeacherMessages";
import { CallRinger } from "./modules/call-ringer";
import { useTeacherMessages } from "./src/useTeacherMessages";
import type { MessageReaction, TeacherMessage } from "./src/callReviewApi";
import {
  currentPushToken,
  getPushToken,
  onIncomingCallNotification,
  onTeacherMessageNotification,
  savePushToken,
  syncCallNotifications,
} from "./src/callNotifications";
import { prefetchSpeech, type RemoteSpeechSource, speak, stopSpeaking, useVoiceCapture } from "./src/voice";
import Svg, { Circle, Path } from "react-native-svg";
import {
  type FinishReason,
  type ReviewFeedback,
  type SessionServices,
  type ReviewOutcome,
  type VoiceState,
  useCallSession,
} from "./src/useCallSession";
import { useCallReviewData } from "./src/useCallReviewData";

function Text({ style, ...props }: TextProps) {
  const flattened = StyleSheet.flatten(style);
  const weight = Number(flattened?.fontWeight ?? 400);
  const family = flattened?.fontFamily ??
    (weight >= 700 ? font.display : weight >= 600 ? font.semibold : weight >= 500 ? font.medium : font.body);
  // Android는 굵기별로 따로 등록한 글꼴에 fontWeight를 함께 주면 시스템 글꼴(삼성 One UI 등)로 바꿔 그린다.
  // 굵기는 이미 글꼴 이름에 들어 있으므로 Android에서는 fontWeight를 지운다.
  return <NativeText {...props} style={[{ fontFamily: family }, style, Platform.OS === "android" && androidPlainWeight]} />;
}

const androidPlainWeight = { fontWeight: "normal" } as const;


// Android는 화면 가장자리까지 그리므로(edge-to-edge) 상태바·하단 내비게이션 여백을
// safe-area-context로 받아야 버튼이 시스템 바에 가리지 않는다.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

// 키보드가 열려도 입력란이 보이도록 내용을 밀어 올린다(edge-to-edge Android도 padding 필요).
const keyboardBehavior = Platform.OS === "web" ? undefined : "padding";

function AppContent() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_500Medium: require("@expo-google-fonts/bricolage-grotesque/500Medium/BricolageGrotesque_500Medium.ttf"),
    BricolageGrotesque_700Bold: require("@expo-google-fonts/bricolage-grotesque/700Bold/BricolageGrotesque_700Bold.ttf"),
    IBMPlexSansKR_400Regular: require("@expo-google-fonts/ibm-plex-sans-kr/400Regular/IBMPlexSansKR_400Regular.ttf"),
    IBMPlexSansKR_500Medium: require("@expo-google-fonts/ibm-plex-sans-kr/500Medium/IBMPlexSansKR_500Medium.ttf"),
    IBMPlexSansKR_600SemiBold: require("@expo-google-fonts/ibm-plex-sans-kr/600SemiBold/IBMPlexSansKR_600SemiBold.ttf"),
    IBMPlexSansKR_700Bold: require("@expo-google-fonts/ibm-plex-sans-kr/700Bold/IBMPlexSansKR_700Bold.ttf"),
  });
  if (!fontsLoaded) {
    return <BootstrapScreen error={false} onRetry={() => {}} />;
  }

  // 서버 주소가 설정되면 실회원 로그인, 아니면 샘플 데이터 프리뷰.
  return callReviewApiBaseUrl ? (
    <AuthenticatedApp />
  ) : (
    <DataApp repository={previewCallReviewRepository} />
  );
}

function DataApp({
  repository,
  onLogout,
}: {
  repository: CallReviewRepository;
  onLogout?: () => void;
}) {
  const { data, error, reload } = useCallReviewData(repository);
  // 메시지 함수는 저장소가 바뀔 때만 새로 만든다(매번 새 함수면 메시지를 계속 다시 불러온다).
  const messageService = useMemo(
    () => ({ loadMessages: repository.loadMessages?.bind(repository), updateMessage: repository.updateMessage?.bind(repository) }),
    [repository],
  );

  if (!data) {
    return <BootstrapScreen error={error} onRetry={reload} />;
  }

  return (
    <CallReviewApp
      data={data}
      onLogout={onLogout}
      onSaveReport={repository.saveReport?.bind(repository)}
      onRefresh={reload}
      generateTurn={repository.generateTurn?.bind(repository)}
      checkAnswer={repository.checkAnswer?.bind(repository)}
      transcribe={repository.transcribe?.bind(repository)}
      registerPush={repository.registerPush?.bind(repository)}
      speechSource={repository.speechSource?.bind(repository)}
      messageService={messageService}
    />
  );
}

function AuthenticatedApp() {
  // undefined: 저장된 토큰 확인 중, null: 로그인 필요.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  // 갱신된 토큰은 화면을 다시 불러오지 않도록 ref로만 교체한다.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    void tokenStorage.get().then((stored) => {
      tokenRef.current = stored;
      setToken(stored);
    });
  }, []);

  const signOut = useCallback((message: string | null) => {
    tokenRef.current = null;
    void tokenStorage.clear();
    setNotice(message);
    setToken(null);
  }, []);

  const repository = useMemo(
    () =>
      createApiCallReviewRepository({
        getToken: () => tokenRef.current,
        saveToken: (next) => {
          tokenRef.current = next;
          void tokenStorage.set(next);
        },
        onUnauthorized: () => signOut("로그인이 만료됐어요. 다시 로그인해 주세요."),
      }),
    // 새로 로그인하면(token 변경) 저장소를 새로 만들어 학습 데이터를 다시 불러온다.
    [signOut, token],
  );

  if (token === undefined) {
    return <BootstrapScreen error={false} onRetry={() => {}} />;
  }

  if (!token) {
    return (
      <LoginScreen
        notice={notice}
        onLoggedIn={(next) => {
          tokenRef.current = next;
          void tokenStorage.set(next);
          setNotice(null);
          setToken(next);
        }}
      />
    );
  }

  return (
    <DataApp
      repository={repository}
      onLogout={() => {
        const current = tokenRef.current;
        signOut(null);
        if (current) {
          // 로그아웃한 기기로는 더 이상 전화 알림을 보내지 않는다.
          const pushToken = currentPushToken();
          void (pushToken ? unregisterPushDevice(current, pushToken) : Promise.resolve()).finally(() => logout(current));
          void syncCallNotifications(null).catch(() => undefined);
        }
      }}
    />
  );
}

function LoginScreen({
  notice,
  onLoggedIn,
}: {
  notice: string | null;
  onLoggedIn: (token: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = userId.trim().length > 0 && password.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(userId.trim(), password);
      setPassword("");
      onLoggedIn(result.token);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "로그인에 실패했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.appRoot}>
    <SafeAreaView style={[styles.safe, Platform.OS === "web" && styles.safeWeb]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.loginKeyboard} behavior={keyboardBehavior}>
        <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.loginIntro}>
          <Image source={befly.home} style={styles.loginAvatar} accessibilityLabel="베플리 선생님" />
          <Text style={[styles.brandEyebrow, { color: color.warningInk }]}>윤선생 AI 전화관리</Text>
          <Text style={styles.loginTitle}>베플리와 통화하려면{"\n"}먼저 로그인해요</Text>
          <Text style={styles.loginBody}>윤선생 학습 아이디로 로그인하면 지난 학습에서 헷갈렸던 표현으로 통화를 준비해요.</Text>
        </View>
        {notice ? <Text style={styles.loginNotice} accessibilityLiveRegion="polite">{notice}</Text> : null}
        <View style={styles.loginForm}>
          <View style={styles.loginField}>
            <Text style={styles.loginLabel} nativeID="login-id-label">아이디</Text>
            <TextInput
              accessibilityLabel="아이디"
              accessibilityLabelledBy="login-id-label"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              value={userId}
              onChangeText={setUserId}
              returnKeyType="next"
              style={styles.loginInput}
              placeholder="학습 아이디"
              placeholderTextColor={color.muted}
            />
          </View>
          <View style={styles.loginField}>
            <Text style={styles.loginLabel} nativeID="login-pw-label">비밀번호</Text>
            <TextInput
              accessibilityLabel="비밀번호"
              accessibilityLabelledBy="login-pw-label"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
              style={styles.loginInput}
              placeholder="비밀번호"
              placeholderTextColor={color.muted}
            />
          </View>
          {error ? <Text style={styles.loginError} accessibilityLiveRegion="assertive">{error}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.loginButton, !canSubmit && styles.loginButtonDisabled, pressed && styles.buttonPressed]}
        >
          <Text style={styles.loginButtonText}>{submitting ? "로그인하는 중…" : "로그인"}</Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "failed";

// 통화 상태를 서버에 보낼 결과 형식으로 바꾼다. 판정 전에 끝난 표현은 skipped.
function reviewPromptText(promptKo: string): string {
  // 문장 표현은 이미 마침표로 끝나므로 중복 문장부호를 지운다("출신이에요.. 영어로" 방지).
  return `${promptKo.trim().replace(/[.!?。]+$/, "")}. 영어로 말해 볼까요?`;
}

function buildReportPayload(
  plan: CallPlan,
  session: ReturnType<typeof useCallSession>,
  endedAt: string,
): CallReportPayload {
  return {
    reportId: session.callId,
    startedAt: session.callStartedAt ?? endedAt,
    endedAt,
    finishReason: session.finishReason,
    targets: plan.targets.map((target, index) => {
      const outcome = session.reviewOutcomes[index] ?? "skipped";
      // 한 번에 맞힌 표현은 답을 따로 남기지 않는다.
      const attempts = outcome === "correct" ? [] : (session.reviewAttempts[index] ?? []);
      return {
        targetId: target.id,
        sourceLabel: target.sourceLabel,
        promptKo: target.promptKo,
        answerEn: target.answerEn,
        outcome,
        ...(attempts[0] ? { learnerAnswer: attempts[0] } : {}),
        ...(attempts.length > 0 ? { attempts: attempts.slice(-MAX_REVIEW_ATTEMPTS) } : {}),
      };
    }),
    conversation: session.conversationTurns,
  };
}

// 앱을 연 딥링크(전화 알림)는 한 번만 처리한다(로그인 뒤 화면이 다시 그려져도 다시 울리지 않게).
let initialLinkHandled = false;

function CallReviewApp({
  data,
  onLogout,
  onSaveReport,
  onRefresh,
  generateTurn,
  checkAnswer,
  transcribe,
  registerPush,
  speechSource,
  messageService,
}: {
  data: CallReviewSnapshot;
  onLogout?: () => void;
  onSaveReport?: (report: CallReportPayload) => Promise<{ talkFeedback?: string }>;
  onRefresh?: () => void;
  generateTurn?: SessionServices["generateTurn"];
  checkAnswer?: SessionServices["checkAnswer"];
  transcribe?: (uri: string) => Promise<string>;
  registerPush?: (pushToken: string) => Promise<boolean>;
  speechSource?: RemoteSpeechSource;
  messageService: Parameters<typeof useTeacherMessages>[0];
}) {
  const capture = useVoiceCapture();
  const teacherMessages = useTeacherMessages(messageService);
  const { reload: reloadMessages } = teacherMessages;
  const services = useMemo<SessionServices>(
    () => ({
      generateTurn,
      checkAnswer,
      voice: transcribe ? { start: capture.start, stop: capture.stop, transcribe } : undefined,
      prepareSpeech: (questionEn) => prefetchSpeech(questionEn, "en-US", speechSource),
    }),
    [capture, checkAnswer, generateTurn, speechSource, transcribe],
  );
  const session = useCallSession(data.plan, services);
  const { setSpeaking } = session;
  // 음성 가이드(문항 자동 읽기). 기본은 켬, 통화 화면의 스피커 버튼으로 끈다. 다시 듣기 버튼은 꺼져 있어도 읽는다.
  const [voiceGuideOn, setVoiceGuideOn] = useState(true);
  // 마이페이지에서 연 지난 통화 리포트. Android 뒤로 가기로 닫는다.
  const [openedHistory, setOpenedHistory] = useState<CallHistoryEntry | null>(null);
  useEffect(() => {
    if (!openedHistory) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpenedHistory(null);
      return true;
    });
    return () => subscription.remove();
  }, [openedHistory]);

  // 전화가 오면 복습 문항 음성을 미리 받아 둔다. 그래야 문항이 뜨자마자 읽는다.
  const preparingCall = session.phase === "incoming" || session.phase === "connecting";
  useEffect(() => {
    if (!preparingCall || !voiceGuideOn) return;
    for (const target of data.plan.targets) prefetchSpeech(reviewPromptText(target.promptKo), "ko-KR", speechSource);
  }, [data.plan.targets, preparingCall, speechSource, voiceGuideOn]);

  // 짧은 대화 질문은 화면에 뜨면 영어로 읽어 준다. 무응답 타이머는 읽기가 끝난 뒤 센다.
  const questionToRead = session.phase === "free-talk" && !session.turnLoading ? session.coachLine : null;
  useEffect(() => {
    if (!questionToRead || !voiceGuideOn) return;
    speak(questionToRead, "en-US", () => setSpeaking(true), () => setSpeaking(false), speechSource);
  }, [questionToRead, session.freeTalkTurn.id, setSpeaking, speechSource, voiceGuideOn]);

  // 복습 단계도 표현이 바뀔 때마다 한국어 문제를 바로 읽어 준다.
  const reviewPrompt = session.phase === "review" && session.target ? reviewPromptText(session.target.promptKo) : null;
  useEffect(() => {
    if (!reviewPrompt || !voiceGuideOn) return;
    speak(reviewPrompt, "ko-KR", () => setSpeaking(true), () => setSpeaking(false), speechSource);
  }, [reviewPrompt, session.target, setSpeaking, speechSource, voiceGuideOn]);

  const toggleVoiceGuide = () => {
    if (voiceGuideOn) {
      stopSpeaking();
      setSpeaking(false);
    }
    setVoiceGuideOn(!voiceGuideOn);
  };

  // 통화를 벗어나거나 학생이 말하기 시작하면 읽기를 멈춘다.
  useEffect(() => {
    if (!session.isCallSurface || session.voiceState === "listening") {
      stopSpeaking();
      setSpeaking(false);
    }
  }, [session.isCallSurface, session.voiceState, setSpeaking]);

  const replay = () => {
    if (session.phase === "free-talk") {
      speak(session.coachLine, "en-US", () => setSpeaking(true), () => setSpeaking(false), speechSource);
    } else if (reviewPrompt) {
      speak(reviewPrompt, "ko-KR", () => setSpeaking(true), () => setSpeaking(false), speechSource);
    }
  };
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // 교사가 정한 일정으로 알림을 맞춘다. 서버 푸시에 기기가 등록되면 서버가 보내고,
  // 아니면(EAS 프로젝트 미설정·권한 없음·등록 실패) 기기 자체 알림을 매주 예약한다.
  useEffect(() => {
    if (data.callSchedule === undefined) return;
    let cancelled = false;
    void (async () => {
      const pushToken = registerPush ? await getPushToken() : null;
      const usePush = pushToken && registerPush ? await registerPush(pushToken) : false;
      if (pushToken) await savePushToken(pushToken);
      if (!cancelled) await syncCallNotifications(data.callSchedule, { usePush });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data.callSchedule, registerPush]);

  // 전화 알림을 누르거나 앱 사용 중 전화 시각이 되면, 홈에 있을 때만 수신 화면을 띄운다.
  useEffect(
    () =>
      onIncomingCallNotification(() => {
        const current = sessionRef.current;
        if (current.phase === "home" && data.plan.targets.length > 0) current.showIncomingCall();
      }),
    [data.plan.targets.length],
  );

  // 안드로이드 전화 알림(전체 화면·벨·진동, modules/call-ringer). 알림·잠금 화면에서 앱이 열리면
  // 딥링크(yooncall://incoming-call, ?answer=1이면 바로 받기)로 수신 화면을 띄운다.
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url?.startsWith("yooncall://")) return;
      const current = sessionRef.current;
      if (url.startsWith("yooncall://incoming-call")) {
        if (current.phase !== "home" && current.phase !== "incoming") return;
        if (url.includes("answer=1")) {
          CallRinger?.stopRinging();
          current.answerIncomingCall();
        } else {
          current.showIncomingCall();
        }
      } else if (url.includes("reminder=1")) {
        // 사전 알림을 눌러 앱을 열었으면 확인한 것으로 본다.
        CallRinger?.dismissReminder();
      }
    };
    if (!initialLinkHandled) {
      initialLinkHandled = true;
      void Linking.getInitialURL().then(handle);
    }
    const link = Linking.addEventListener("url", ({ url }) => handle(url));
    // 앱을 쓰는 중에 전화가 오면 벨과 함께 수신 화면을 띄운다.
    const incoming = CallRinger?.addListener("onIncomingCall", () => {
      if (sessionRef.current.phase === "home") sessionRef.current.showIncomingCall();
    });
    return () => {
      link.remove();
      incoming?.remove();
    };
  }, []);

  // 홈에 있는데 벨이 울리는 중이면(앱 아이콘으로 열었을 때) 수신 화면을 띄우고, 통화가 시작되면 벨을 멈춘다.
  // 통화를 마치고 홈으로 오면 잠금 화면 위 표시를 끈다.
  useEffect(() => {
    if (!CallRinger) return;
    if (session.phase === "home") {
      if (CallRinger.isRinging()) sessionRef.current.showIncomingCall();
      else CallRinger.setShowOverLockScreen(false);
    } else if (session.phase !== "incoming") {
      CallRinger.stopRinging();
    }
  }, [session.phase]);

  // 앱을 열면 부재중 전화 알림을 지운다.
  useEffect(() => {
    CallRinger?.clearMissedCalls();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") CallRinger?.clearMissedCalls();
    });
    return () => subscription.remove();
  }, []);

  // 선생님 메시지 알림: 받으면 메시지를 다시 불러오고, 눌러서 열었으면(통화 중이 아닐 때) 마이페이지 메시지함을 연다.
  useEffect(
    () =>
      onTeacherMessageNotification((tapped) => {
        void reloadMessages();
        const current = sessionRef.current;
        if (tapped && current.phase === "home") current.openMyPage();
      }),
    [reloadMessages],
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // 저장할 때 서버가 짧은 대화를 보고 만든 피드백.
  const [talkFeedback, setTalkFeedback] = useState<string | null>(null);
  const pendingReport = useRef<CallReportPayload | null>(null);

  const sendReport = useCallback(async () => {
    const report = pendingReport.current;
    if (!report || !onSaveReport) return;
    setSaveStatus("saving");
    try {
      const saved = await onSaveReport(report);
      setTalkFeedback(saved.talkFeedback ?? null);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    }
  }, [onSaveReport]);

  // 통화가 끝나는 순간 한 번 저장한다. 같은 reportId로 재시도해도 서버가 중복 저장하지 않는다.
  useEffect(() => {
    if (session.phase !== "complete" || !onSaveReport || pendingReport.current) return;
    pendingReport.current = buildReportPayload(data.plan, session, new Date().toISOString());
    void sendReport();
  }, [data.plan, onSaveReport, sendReport, session]);

  const finishCall = () => {
    const saved = saveStatus === "saved";
    pendingReport.current = null;
    setSaveStatus("idle");
    setTalkFeedback(null);
    session.resetCall();
    // 저장된 통화가 마이페이지 기록에 보이도록 다시 불러온다.
    if (saved) onRefresh?.();
  };
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<"light" | "dark" | "system">("light");
  const darkMode = themePreference === "dark" || (themePreference === "system" && systemScheme === "dark");
  const lightCall = session.isCallSurface && !darkMode;
  const toggleAppearance = () => setThemePreference(darkMode ? "light" : "dark");

  return (
    <View
      style={[styles.appRoot, session.isCallSurface && styles.appRootCall, lightCall && lightCallStyles.surface, darkMode && darkAppStyles.surface]}
    >
      <SafeAreaView
        style={[
          styles.safe,
          Platform.OS === "web" && styles.safeWeb,
          session.isCallSurface && styles.safeCall,
          lightCall && lightCallStyles.surface,
          darkMode && darkAppStyles.surface,
        ]}
      >
        <StatusBar style={darkMode ? "light" : "dark"} />
        {session.phase === "home" && (
          openedHistory?.report ? (
            <ReportScreen
              darkMode={darkMode}
              onToggleAppearance={toggleAppearance}
              dateLabel={openedHistory.completedAtLabel}
              finishReason={openedHistory.report.finishReason}
              outcomes={Object.fromEntries(openedHistory.report.targets.map((target, index) => [index, target.outcome]))}
              reviewedCount={openedHistory.report.reviewedCount}
              targets={openedHistory.report.targets}
              conversation={openedHistory.report.conversation}
              talkFeedback={openedHistory.report.talkFeedback ?? null}
              saveStatus={null}
              onRetrySave={() => {}}
              onDone={() => setOpenedHistory(null)}
            />
          ) : session.homeSection === "home" ? (
            <HomeScreen
              darkMode={darkMode}
              onToggleAppearance={toggleAppearance}
              scheduledAtLabel={data.plan.scheduledAtLabel}
              reviewCount={data.plan.targets.length}
              wordCount={data.plan.targets.filter((target) => target.sourceLabel.includes("단어")).length}
              onOpenMyPage={session.openMyPage}
              onStart={session.showIncomingCall}
              unreadMessages={teacherMessages.messages.filter((message) => !message.readAt).length}
            />
          ) : (
            <MyPageScreen
              darkMode={darkMode}
              onToggleAppearance={toggleAppearance}
              history={data.history}
              schedule={data.schedule}
              themePreference={themePreference}
              onSetTheme={setThemePreference}
              onBack={session.closeMyPage}
              onLogout={onLogout}
              onOpenReport={setOpenedHistory}
              messages={teacherMessages.enabled ? teacherMessages.messages : null}
              onReadMessage={teacherMessages.markRead}
              onReactMessage={teacherMessages.react}
            />
          )
        )}
        {session.phase === "incoming" && (
          <IncomingScreen
            darkMode={darkMode}
            onToggleAppearance={toggleAppearance}
            reviewCount={data.plan.targets.length}
            onAnswer={() => {
              CallRinger?.stopRinging();
              session.answerIncomingCall();
            }}
            onDecline={() => {
              CallRinger?.stopRinging();
              session.declineIncomingCall();
            }}
          />
        )}
        {session.phase === "connecting" && (
          <ConnectingScreen
            darkMode={darkMode}
            reviewCount={data.plan.targets.length}
            onCancel={session.cancelConnecting}
          />
        )}
        {(session.phase === "review" || session.phase === "free-talk") &&
          session.target && (
          <CallScreen
            darkMode={darkMode}
            onToggleAppearance={toggleAppearance}
            phase={session.phase}
            progressLabel={session.progressLabel}
            coachLine={session.coachLine}
            promptKo={session.target.promptKo}
            sourceLabel={session.target.sourceLabel}
            answerEn={session.target.answerEn}
            reviewFeedback={session.reviewFeedback}
            checkingAnswer={session.checkingAnswer}
            questionMeaningKo={
              session.phase === "free-talk"
                ? session.freeTalkTurn.questionMeaningKo
                : undefined
            }
            hint={
              session.phase === "free-talk"
                ? session.freeTalkTurn.answerHint
                : session.target.hint
            }
            choiceOptions={
              session.phase === "free-talk"
                ? session.freeTalkTurn.choices
                : []
            }
            choiceAssistOpen={session.choiceAssistOpen}
            previousReply={
              session.phase === "free-talk"
                ? session.conversationReplies[
                    session.conversationReplies.length - 1
                  ]
                : undefined
            }
            inputMode={session.inputMode}
            captionsOn={session.captionsOn}
            voiceState={session.voiceState}
            heardText={session.heardText}
            typedText={session.typedText}
            hintOpen={session.hintOpen}
            onChangeMode={session.changeInputMode}
            onToggleCaptions={session.toggleCaptions}
            onToggleHint={session.toggleHint}
            onChangeText={session.changeTypedText}
            onVoiceAction={session.beginOrStopVoice}
            onSubmitText={session.submitTypedAnswer}
            onRetryVoice={session.retryVoice}
            onContinueReview={session.continueReview}
            onRetryReview={session.retryReview}
            isLastTarget={session.isLastTarget}
            onChooseAnswer={session.chooseAnswer}
            onToggleChoiceAssist={session.toggleChoiceAssist}
            onEnd={session.endCall}
            onReplay={replay}
            voiceGuideOn={voiceGuideOn}
            onToggleVoiceGuide={toggleVoiceGuide}
            turnLoading={session.turnLoading}
            voiceError={session.voiceError}
            idleStopSeconds={data.plan.freeTalk.idleStopSeconds}
            idleSecondsLeft={session.idleSecondsLeft}
          />
        )}
        {session.phase === "complete" && (
          <ReportScreen
            darkMode={darkMode}
            onToggleAppearance={toggleAppearance}
            finishReason={session.finishReason}
            outcomes={session.reviewOutcomes}
            reviewedCount={session.reviewedCount}
            targets={data.plan.targets}
            conversation={session.conversationTurns}
            talkFeedback={talkFeedback}
            saveStatus={onSaveReport ? saveStatus : null}
            onRetrySave={() => void sendReport()}
            onDone={finishCall}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

function BootstrapScreen({
  error,
  onRetry,
}: {
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.bootstrapScreen}>
      <StatusBar style="dark" />
      <Text style={styles.brandEyebrow}>윤선생 AI 전화관리</Text>
      <Text style={styles.bootstrapTitle}>
        {error ? "학습 정보를 불러오지 못했어." : "오늘의 전화를 준비하고 있어."}
      </Text>
      <Text style={styles.bootstrapBody}>
        {error
          ? "연결 상태를 확인한 뒤 다시 시도해 주세요."
          : "잠시만 기다려 주세요."}
      </Text>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.bootstrapRetry,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.bootstrapRetryText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

function HomeScreen({
  darkMode,
  onToggleAppearance,
  scheduledAtLabel,
  reviewCount,
  wordCount,
  onOpenMyPage,
  onStart,
  unreadMessages,
}: {
  darkMode: boolean;
  onToggleAppearance: () => void;
  scheduledAtLabel: string;
  reviewCount: number;
  wordCount: number;
  onOpenMyPage: () => void;
  onStart: () => void;
  // 아직 읽지 않은 선생님 메시지 수(마이페이지 버튼에 표시).
  unreadMessages: number;
}) {
  return (
    <View style={styles.homeScreen}>
    <ScrollView contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeHeader}>
        <View style={styles.homeHeadingCopy}>
          <Text style={[styles.brandEyebrow, { color: color.warningInk }, darkMode && darkAppStyles.mutedText]}>윤선생 AI 전화관리</Text>
          <Text style={[styles.homeTitle, darkMode && darkAppStyles.strongText]}>오늘도 베플리와 통화해요</Text>
        </View>
        <View style={styles.homeHeaderActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadMessages > 0 ? `마이페이지 열기, 선생님 새 메시지 ${unreadMessages}개` : "마이페이지 열기"}
          onPress={onOpenMyPage}
          style={({ pressed }) => [
            styles.myButton,
            darkMode && darkAppStyles.utilityButton,
            pressed && styles.utilityPressed,
          ]}
        >
          <Icon name="person" size={22} color={darkMode ? color.inkInverse : color.ink} />
          {unreadMessages > 0 ? (
            <View style={[styles.myButtonBadge, darkMode && { borderColor: color.call }]} accessible={false}>
              <Text style={styles.myButtonBadgeText}>{unreadMessages > 9 ? "9+" : unreadMessages}</Text>
            </View>
          ) : null}
        </Pressable>
        </View>
      </View>

      <View style={[styles.nextCallCard, darkMode && darkAppStyles.card]}>
        <View style={styles.homeBeflyRow}>
          <Image source={befly.home} style={styles.homeBeflyAvatar} accessibilityLabel="베플리 선생님" />
          <View><Text style={styles.homeCardMuted}>다음 관리 전화</Text><Text style={styles.homeBeflyName}>베플리 선생님</Text></View>
        </View>
        <View><Text style={styles.nextCallTime}>{scheduledAtLabel}</Text><Text style={styles.homeCardMuted}>선생님과 약속한 시간에 베플리가 전화해요</Text></View>
        <View style={styles.homeReadyStrip}><View style={styles.homeReadyDot}/><Text style={styles.homeReadyText}>통화 준비가 됐어요. 조용한 곳이면 더 좋아요.</Text></View>
      </View>

      <View style={styles.homeReviewSection}>
        <View style={styles.homeReviewHeading}><Text style={[styles.homeSectionTitle, darkMode && darkAppStyles.strongText]}>오늘 복습할 표현</Text><Text style={[styles.homeReviewSub, darkMode && darkAppStyles.mutedText]}>지난 학습에서 헷갈렸던 것</Text></View>
        <View style={styles.homeStatsRow}>
          <View style={[styles.homeStatCard, darkMode && darkAppStyles.card]}><Text style={[styles.homeStatLabel,darkMode && darkAppStyles.mutedText]}>단어</Text><Text style={[styles.homeStatNumber,darkMode && darkAppStyles.strongText]}>{wordCount}<Text style={[styles.homeStatUnit,darkMode && darkAppStyles.strongText]}>개</Text></Text></View>
          <View style={[styles.homeStatCard, darkMode && darkAppStyles.card]}><Text style={[styles.homeStatLabel,darkMode && darkAppStyles.mutedText]}>문장</Text><Text style={[styles.homeStatNumber,darkMode && darkAppStyles.strongText]}>{Math.max(0, reviewCount - wordCount)}<Text style={[styles.homeStatUnit,darkMode && darkAppStyles.strongText]}>개</Text></Text></View>
        </View>
        <Text style={[styles.homeReviewDescription,darkMode && darkAppStyles.mutedText]}>{reviewCount > 0 ? `표현 ${reviewCount}개를 복습하고, 베플리의 영어 질문에 짧게 대답하면 끝나요.` : "최근 학습에서 다시 볼 단어·문장이 없어요. 새로 학습하면 여기에 모여요."}</Text>
      </View>
    </ScrollView>
    <View style={[styles.homeBottom, darkMode && darkAppStyles.surface]}><Pressable accessibilityRole="button" accessibilityState={{ disabled: reviewCount === 0 }} disabled={reviewCount === 0} onPress={onStart} style={({pressed}) => [styles.homeAnswerButton,reviewCount === 0 && styles.homeAnswerButtonDisabled,pressed && styles.buttonPressed]}><Icon name="phone" size={22} color={color.surface} strokeWidth={2.2} /><Text style={styles.homeAnswerButtonText}>{reviewCount > 0 ? "지금 전화받기" : "오늘은 복습할 표현이 없어요"}</Text></Pressable></View>
    </View>
  );
}

// "19:30" -> "오후 7:30", matching the home card's scheduled-call label.
function formatClock(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${match[2]}`;
}

function MyPageScreen({
  darkMode,
  onToggleAppearance,
  history,
  schedule,
  themePreference,
  onSetTheme,
  onBack,
  onLogout,
  onOpenReport,
  messages,
  onReadMessage,
  onReactMessage,
}: {
  darkMode: boolean;
  onToggleAppearance: () => void;
  history: CallHistoryEntry[];
  // 선생님 메시지함(메시지 기능이 없는 저장소면 null).
  messages: TeacherMessage[] | null;
  onReadMessage: (id: string) => void;
  onReactMessage: (id: string, reaction: MessageReaction) => void;
  onOpenReport: (entry: CallHistoryEntry) => void;
  schedule: TeacherScheduleSettings | null;
  themePreference: "light" | "dark" | "system";
  onSetTheme: (preference: "light" | "dark" | "system") => void;
  onBack: () => void;
  onLogout?: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.myPageContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.myPageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="홈으로 돌아가기"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            darkMode && darkAppStyles.utilityButton,
            pressed && styles.utilityPressed,
          ]}
        >
          <Icon name="back" size={22} strokeWidth={2.2} color={darkMode ? color.inkInverse : color.ink} />
        </Pressable>
        <Text style={[styles.myPageTitle, darkMode && darkAppStyles.strongText]}>마이페이지</Text>
      </View>

      {messages ? <MessageInbox darkMode={darkMode} messages={messages} onRead={onReadMessage} onReact={onReactMessage} /> : null}
      <LearningStatusSection history={history} darkMode={darkMode} />
      <View style={[styles.scheduleCard, darkMode && darkAppStyles.card]}>
        <View style={styles.scheduleTopline}>
          <Text style={[styles.mySectionTitle,darkMode && darkAppStyles.strongText]}>전화 일정</Text>
          <View style={[styles.myTeacherBadge,darkMode && darkAppStyles.mutedCard]}><Icon name="clock" size={13} strokeWidth={2.2} color={darkMode ? color.mutedInverse : color.muted} /><Text style={[styles.myTeacherBadgeText,darkMode && darkAppStyles.mutedText]}>선생님과 약속</Text></View>
        </View>
        {schedule ? (<>
        <View style={styles.myWeekdays} accessible accessibilityLabel={`전화 오는 요일: ${schedule.weekdays.join(", ")}`}>{["월","화","수","목","금","토","일"].map((day) => {
          const active = schedule.weekdays.includes(day);
          return <View key={day} style={[styles.myWeekday,active && styles.myWeekdayActive,darkMode && (active ? darkAppStyles.activeChip : darkAppStyles.mutedCard)]}><Text style={[styles.myWeekdayText,active && styles.myWeekdayTextActive,darkMode && (active ? darkAppStyles.activeChipText : darkAppStyles.mutedText)]}>{day}</Text></View>;
        })}</View>
        <View style={styles.myScheduleDetails}><View><Text style={[styles.myDetailLabel,darkMode && darkAppStyles.mutedText]}>시간</Text><Text style={[styles.myDetailValue,darkMode && darkAppStyles.strongText]}>{formatClock(schedule.time)}</Text></View><View><Text style={[styles.myDetailLabel,darkMode && darkAppStyles.mutedText]}>횟수</Text><Text style={[styles.myDetailValue,darkMode && darkAppStyles.strongText]}>주 {schedule.callsPerWeek}회</Text></View></View>
        <Text style={[styles.myScheduleHelp,darkMode && darkAppStyles.mutedText]}>시간을 바꾸고 싶으면 선생님과 다시 이야기해 주세요.{schedule.reminderMinutesBefore > 0 ? ` 통화 ${schedule.reminderMinutesBefore}분 전에 알려드려요.` : ""}</Text>
        </>) : (
          <Text style={[styles.myScheduleHelp,darkMode && darkAppStyles.mutedText]}>아직 선생님과 전화 시간을 정하지 않았어요. 선생님과 시간을 정하면 여기와 홈에 표시돼요.</Text>
        )}
      </View>

      <View style={styles.myThemeSection}><Text style={[styles.mySectionTitle,darkMode && darkAppStyles.strongText]}>통화 화면</Text><View style={[styles.myThemeSelector,darkMode && darkAppStyles.mutedCard]}>{(["light","dark","system"] as const).map((preference,index) => <Pressable key={preference} accessibilityRole="radio" accessibilityState={{selected:themePreference===preference}} onPress={() => onSetTheme(preference)} style={[styles.myThemeChoice,themePreference === preference && styles.myThemeChoiceActive,darkMode && themePreference===preference && darkAppStyles.card]}><Text style={[styles.myThemeChoiceText,themePreference===preference && styles.myThemeChoiceTextActive,darkMode && darkAppStyles.strongText]}>{["밝게","어둡게","기기 설정"][index]}</Text></Pressable>)}</View></View>

      <Text style={[styles.mySectionTitle, darkMode && darkAppStyles.strongText]}>지난 전화관리</Text>
      <View style={[styles.historyList, darkMode && darkAppStyles.card]}>
        {history.length === 0 && <View style={styles.emptyHistory}>
          <Image source={befly.myPageEmpty} style={styles.emptyHistoryAvatar} accessibilityLabel="기다리는 베플리 선생님" />
          <Text style={[styles.emptyHistoryTitle, darkMode && darkAppStyles.strongText]}>아직 전화관리 기록이 없어요</Text>
          <Text style={[styles.emptyHistoryBody, darkMode && darkAppStyles.mutedText]}>첫 통화를 마치면 여기에 모아 볼 수 있어요.</Text>
        </View>}
        {history.slice(0, 10).map((entry) => (
          <Pressable
            key={entry.id}
            disabled={!entry.report}
            accessibilityRole="button"
            accessibilityLabel={`${entry.completedAtLabel} 통화 리포트 보기`}
            onPress={() => onOpenReport(entry)}
            style={({ pressed }) => [styles.myHistoryRow, darkMode && darkAppStyles.bottomBorder, pressed && styles.utilityPressed]}
          >
            <View style={styles.myHistoryDate}><Text style={[styles.myHistoryDay,darkMode && darkAppStyles.strongText]}>{entry.completedAtLabel.match(/(\d+)일/)?.[1] ?? "—"}</Text><Text style={[styles.myHistoryMonth,darkMode && darkAppStyles.mutedText]}>{entry.completedAtLabel.match(/(\d+)월/)?.[1] ?? ""}월</Text></View>
            <View style={styles.myHistoryCopy}><Text style={[styles.myHistorySummary,darkMode && darkAppStyles.strongText]}>{entry.focusLabel}</Text><Text style={[styles.myHistoryDetail,darkMode && darkAppStyles.mutedText]}>{entry.expressions.join(" · ")}</Text></View>
            <View style={[styles.myHistoryTag, entry.resultLabel === "직접 종료" && { backgroundColor: color.primarySoft }, entry.resultLabel === "응답 없음" && { backgroundColor: color.surfaceMuted }]}><Text style={[styles.myHistoryTagText, entry.resultLabel === "직접 종료" && { color: color.primaryStrong }, entry.resultLabel === "응답 없음" && { color: color.muted }]}>{entry.resultLabel}</Text></View>
            {entry.report && <Icon name="chevron-right" size={18} color={darkMode ? color.mutedInverse : color.muted} />}
          </Pressable>
        ))}
      </View>
      {onLogout ? (
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutButton, darkMode && darkAppStyles.card, pressed && styles.buttonPressed]}
        >
          <Text style={[styles.logoutButtonText, darkMode && darkAppStyles.mutedText]}>로그아웃</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PlanRow({
  darkMode,
  number,
  title,
  meta,
}: {
  darkMode: boolean;
  number: string;
  title: string;
  meta: string;
}) {
  return (
    <View style={[styles.planRow, darkMode && darkAppStyles.bottomBorder]}>
      <View style={[styles.planNumber, darkMode && darkAppStyles.mutedCard]}>
        <Text style={[styles.planNumberText, darkMode && darkAppStyles.mutedText]}>{number}</Text>
      </View>
      <Text style={[styles.planTitle, darkMode && darkAppStyles.strongText]}>{title}</Text>
      <Text style={[styles.planMeta, darkMode && darkAppStyles.mutedText]}>{meta}</Text>
    </View>
  );
}

function IncomingScreen({
  darkMode,
  onToggleAppearance,
  reviewCount,
  onAnswer,
  onDecline,
}: {
  darkMode: boolean;
  onToggleAppearance: () => void;
  reviewCount: number;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.incomingScreen}>
      <View style={styles.incomingCopy}>
        <Text style={[styles.callKicker, !darkMode && lightCallStyles.mutedText]}>윤선생 AI 전화관리</Text>
        <Text style={[styles.callerName, !darkMode && lightCallStyles.strongText]}>관리 전화가 왔어요</Text>
      </View>

      <View style={styles.incomingCenter}>
      <View style={styles.incomingStage}>
        <RingRipple ringColor={darkMode ? "#5A4130" : "#E2C9AE"} delay={0} />
        <RingRipple ringColor={darkMode ? "#5A4130" : "#E2C9AE"} delay={1200} />
        <View style={[styles.incomingHalo, { backgroundColor: darkMode ? "#2A1F1A" : "#F7EDC9" }]} />
        <Image source={befly.incoming} style={[styles.incomingAvatar, darkMode && darkAppStyles.beflyRing]} accessibilityLabel="헤드셋을 쓰고 손 흔드는 베플리 선생님" />
      </View>
      <View style={styles.incomingIdentity}><Text style={[styles.incomingName,!darkMode && lightCallStyles.strongText]}>베플리 선생님</Text><Text style={[styles.incomingMeta,!darkMode && lightCallStyles.mutedText]}>오늘 복습할 표현 {reviewCount}개</Text></View>
      <View style={[styles.incomingSpeech,!darkMode && lightCallStyles.raisedSurface]}><Text style={[styles.incomingEnglish,!darkMode && lightCallStyles.strongText]}>Hi, it’s Befly!</Text><Text style={[styles.incomingKo,!darkMode && lightCallStyles.strongText]}>오늘 배운 표현으로 짧게 이야기해 볼까요?</Text></View>
      </View>

      <View style={styles.incomingActions}>
        <CallAction darkMode={darkMode} label="나중에" tone="danger" onPress={onDecline} icon="clock" />
        <CallAction darkMode={darkMode} label="전화받기" tone="success" onPress={onAnswer} icon="phone" />
      </View>
    </View>
  );
}

function CallAction({
  darkMode,
  label,
  tone,
  onPress,
  icon,
}: {
  darkMode: boolean;
  label: string;
  tone: "danger" | "success";
  onPress: () => void;
  icon: IconName;
}) {
  return (
    <View style={styles.callActionWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [
          styles.callAction,
          tone === "danger" ? styles.callActionDanger : styles.callActionSuccess,
          !darkMode && tone === "danger" && lightCallStyles.declineButton,
          pressed && styles.buttonPressed,
        ]}
      >
        {tone === "success" ? (
          <Wiggle><Icon name={icon} size={30} strokeWidth={2.2} color={color.accentInk} /></Wiggle>
        ) : (
          <Icon name={icon} size={28} color={darkMode ? color.inkInverse : color.ink} />
        )}
      </Pressable>
      <Text style={[styles.callActionLabel, !darkMode && lightCallStyles.strongText]}>{label}</Text>
    </View>
  );
}

function AppearanceToggle({ darkMode, onPress, compact = false }: { darkMode: boolean; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="다크 모드"
      accessibilityState={{ checked: darkMode }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.appearanceToggle,
        compact && styles.appearanceToggleCompact,
        !darkMode && lightCallStyles.appearanceToggle,
        pressed && styles.utilityPressed,
      ]}
    >
      {compact ? (
        <Icon name={darkMode ? "sun" : "moon"} size={20} color={darkMode ? color.inkInverse : color.ink} />
      ) : (
        <Text style={[styles.appearanceToggleText, !darkMode && lightCallStyles.mutedText]}>
          {darkMode ? "밝게 보기" : "어둡게 보기"}
        </Text>
      )}
    </Pressable>
  );
}

const nativeDriver = Platform.OS !== "web";

// Loops 0 -> 1 forever; stays at 0 when the OS asks for reduced motion.
function useLoop(duration: number, { delay = 0, easing = Easing.linear, reverse = false } = {}) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      const forward = Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: nativeDriver });
      loop = Animated.loop(
        reverse
          ? Animated.sequence([forward, Animated.timing(value, { toValue: 0, duration, easing, useNativeDriver: nativeDriver })])
          : forward,
      );
      timer = setTimeout(() => loop?.start(), delay);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      loop?.stop();
    };
  }, [delay, duration, easing, reverse, value]);
  return value;
}

function useSpin() {
  return useLoop(1400).interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
}

function RingRipple({ ringColor, delay }: { ringColor: string; delay: number }) {
  const progress = useLoop(2400, { delay, easing: Easing.out(Easing.quad) });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.incomingRipple,
        {
          borderColor: ringColor,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) }],
        },
      ]}
    />
  );
}

function Wiggle({ children }: { children: React.ReactNode }) {
  const progress = useLoop(1200, { easing: Easing.inOut(Easing.quad) });
  const rotate = progress.interpolate({
    inputRange: [0, 0.6, 0.7, 0.8, 0.9, 1],
    outputRange: ["0deg", "0deg", "-12deg", "12deg", "-6deg", "0deg"],
  });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

function MicPulse({ pulseColor, size }: { pulseColor: string; size: number }) {
  const progress = useLoop(1600, { easing: Easing.out(Easing.quad) });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: pulseColor,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
      }}
    />
  );
}

function ConnectingScreen({
  darkMode,
  reviewCount,
  onCancel,
}: {
  darkMode: boolean;
  reviewCount: number;
  onCancel: () => void;
}) {
  const rotate = useSpin();
  const light = !darkMode;
  const steps = [
    { label: `오늘 표현 ${reviewCount}개 준비`, state: "done" as const, status: "완료" },
    { label: "마이크 준비", state: "active" as const, status: "확인 중" },
    { label: "베플리 선생님 연결", state: "waiting" as const, status: "대기" },
  ];
  return (
    <View style={styles.connectingScreen}>
      <View style={styles.connectingCenter}>
        <View style={styles.connectingRingWrap}>
          <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
            <Svg width={168} height={168} viewBox="0 0 168 168" accessible={false}>
              <Circle cx={84} cy={84} r={78} fill="none" stroke={light ? "#E9E3D9" : color.callPulseOuter} strokeWidth={6} />
              <Path d="M84 6a78 78 0 0 1 78 78" fill="none" stroke={light ? color.befly : color.beflyDark} strokeWidth={6} strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <Image source={befly.call.default} style={styles.connectingAvatar} accessibilityLabel="베플리 선생님" />
        </View>
        <View style={styles.connectingCopy} accessibilityLiveRegion="polite">
          <Text style={[styles.connectingTitle, light && lightCallStyles.strongText]}>베플리와 연결하고 있어요</Text>
          <Text style={[styles.connectingBody, light && lightCallStyles.mutedText]}>잠시 후 베플리의 목소리가 들려요</Text>
        </View>
        <View accessibilityLabel="연결 준비 단계" style={[styles.connectingSteps, light ? lightCallStyles.raisedSurface : darkAppStyles.card]}>
          {steps.map((step) => (
            <View key={step.label} style={styles.connectingStep}>
              {step.state === "done" ? (
                <View style={[styles.connectingStepMark, { backgroundColor: light ? color.success : color.successDark }]}>
                  <Icon name="check" size={14} strokeWidth={3} color={color.accentInk} />
                </View>
              ) : step.state === "active" ? (
                <View style={[styles.connectingStepMark, styles.connectingStepActive, !light && { borderColor: color.actionDark }]}>
                  <Icon name="mic" size={12} strokeWidth={3} color={light ? color.primary : color.actionDark} />
                </View>
              ) : (
                <View style={[styles.connectingStepMark, styles.connectingStepWaiting, !light && { borderColor: color.lineInverse }]} />
              )}
              <Text style={[styles.connectingStepLabel, light && lightCallStyles.strongText, step.state === "active" && { fontWeight: "600" }, step.state === "waiting" && (light ? lightCallStyles.mutedText : darkAppStyles.mutedText)]}>{step.label}</Text>
              <Text style={[styles.connectingStepStatus, step.state === "done" && { color: light ? "#17673F" : "#7FDCAE" }, step.state === "active" && { color: light ? color.primaryStrong : color.actionInkDark }, step.state === "waiting" && { fontWeight: "400" }, step.state === "waiting" && (light ? lightCallStyles.mutedText : darkAppStyles.mutedText)]}>{step.status}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.connectingNote, light && lightCallStyles.mutedText]}>마이크를 쓸 수 없어도 괜찮아요.{"\n"}통화 중에 글자로 답할 수 있어요.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => [styles.connectingCancel, light ? lightCallStyles.raisedSurface : darkAppStyles.card, pressed && styles.buttonPressed]}
      >
        <Text style={[styles.connectingCancelText, light && lightCallStyles.strongText]}>취소</Text>
      </Pressable>
    </View>
  );
}

type CallScreenProps = {
  darkMode: boolean;
  onToggleAppearance: () => void;
  phase: "review" | "free-talk";
  progressLabel: string;
  coachLine: string;
  promptKo: string;
  sourceLabel: string;
  answerEn: string;
  reviewFeedback: ReviewFeedback | null;
  // 뜻이 맞는 다른 답인지 서버 AI가 판정하는 중.
  checkingAnswer: boolean;
  questionMeaningKo?: string;
  hint: string;
  choiceOptions: ConversationChoice[];
  choiceAssistOpen: boolean;
  previousReply?: string;
  inputMode: InputMode;
  captionsOn: boolean;
  voiceState: VoiceState;
  heardText: string;
  typedText: string;
  hintOpen: boolean;
  onChangeMode: (mode: InputMode) => void;
  onToggleCaptions: () => void;
  onToggleHint: () => void;
  onChangeText: (value: string) => void;
  onChooseAnswer: (answer: string) => void;
  onToggleChoiceAssist: () => void;
  onVoiceAction: () => void;
  onSubmitText: () => void;
  onRetryVoice: () => void;
  onContinueReview: () => void;
  onRetryReview: () => void;
  isLastTarget: boolean;
  onEnd: () => void;
  idleStopSeconds: number;
  idleSecondsLeft: number;
  onReplay: () => void;
  voiceGuideOn: boolean;
  onToggleVoiceGuide: () => void;
  turnLoading: boolean;
  voiceError: string | null;
};

// Gentle no-response notice appears for the final seconds before the call ends.
const IDLE_NOTICE_SECONDS = 10;

// "I have homework today." -> "I h___ h_______ t____."
function maskAnswer(answer: string) {
  return answer
    .split(" ")
    .map((word) => word.replace(/^([^A-Za-z]*[A-Za-z])([A-Za-z']*)/, (_, head: string, rest: string) => head + "_".repeat(rest.length)))
    .join(" ");
}

function reviewGuide(props: CallScreenProps) {
  if (props.checkingAnswer) return "베플리가 답을 확인하고 있어요…";
  if (props.reviewFeedback) {
    return props.reviewFeedback.kind === "correct"
      ? "좋아요! 아주 자연스러워요."
      : props.reviewFeedback.kind === "hint"
        ? "힌트를 보고 다시 말해 볼까요?"
        : "괜찮아요, 같이 다시 볼까요?";
  }
  if (props.inputMode === "text") return "글자로 써도 좋아요.";
  if (props.voiceState === "listening") return "천천히 말해도 괜찮아요.";
  if (props.voiceState === "review") return "내가 이렇게 들었어. 맞니?";
  return "영어로 말해 볼까요?";
}

function CallScreen(props: CallScreenProps) {
  const { width, height } = useWindowDimensions();
  const compact = width < 350 || height < 700;
  // 상단 버튼이 셋(음성 가이드·화면 밝기·종료)이라 보통 폰 폭에서는 종료를 아이콘만 보인다.
  const wide = width >= 440;
  const light = !props.darkMode;
  const isChat = props.phase === "free-talk";
  const t = light
    ? { ink: color.ink, ink2: color.muted, line: color.line, action: color.primary, actionInk: color.primaryStrong, actionSoft: color.primarySoft, surface2: color.surfaceMuted, beflyInk: color.warningInk, beflySoft: color.beflySoft, ok: color.success, okInk: "#17673F", okSoft: color.successSoft, live: "#1E9E63", end: color.danger }
    : { ink: color.inkInverse, ink2: color.mutedInverse, line: color.lineInverse, action: color.actionDark, actionInk: color.actionInkDark, actionSoft: color.actionSoftDark, surface2: color.callPulseOuter, beflyInk: "#EBC9A6", beflySoft: color.callPulseMiddle, ok: color.successDark, okInk: "#7FDCAE", okSoft: "#16302A", end: "#D94545", live: "#3CCB86" };
  const listening = props.voiceState === "listening";
  const transcribing = props.voiceState === "transcribing";
  const preparing = props.voiceState === "preparing";
  const feedback = !isChat ? props.reviewFeedback : null;
  const auxOpen = isChat ? props.choiceAssistOpen : props.hintOpen;
  const onAux = isChat ? props.onToggleChoiceAssist : props.onToggleHint;
  const micLabel = listening
    ? "다 말했어요"
    : transcribing
      ? "알아듣는 중…"
      : preparing
        ? "마이크 준비 중…"
        : props.turnLoading
          ? "잠깐만요…"
          : "눌러서 말하기";
  const micBusy = transcribing || preparing || props.turnLoading;
  const step = Number(props.progressLabel.match(/\d+/)?.[0] ?? 1);
  const segmentColor = (index: number) =>
    index < step - 1 || (index === step - 1 && feedback) ? t.action : index === step - 1 ? t.ink2 : t.line;

  return (
    <KeyboardAvoidingView
      style={[styles.callScreen, light && lightCallStyles.surface]}
      behavior={keyboardBehavior}
    >
      <View style={[styles.callTopbar, compact && styles.callTopbarCompact]}>
        <Image
          source={callAvatar(listening ? "listening" : isChat && props.idleSecondsLeft <= IDLE_NOTICE_SECONDS ? "waiting" : props.voiceState === "idle" && !feedback ? "speaking" : "default")}
          style={[styles.callHeaderAvatar, compact && styles.callHeaderAvatarCompact, props.darkMode && darkAppStyles.beflyRing, listening && { borderColor: t.action }]}
          accessibilityLabel="베플리 선생님"
        />
        <View style={styles.callIdentity}>
          <Text numberOfLines={1} style={[styles.callName, light && lightCallStyles.strongText]}>베플리 선생님</Text>
          <View style={styles.callStatusRow}>
            <View style={[styles.callLiveDot, { backgroundColor: t.live }]} />
            <Text numberOfLines={1} style={[styles.callProgress, light && lightCallStyles.mutedText]}>통화 중 · {isChat ? "짧은 대화" : "표현 복습"}</Text>
          </View>
        </View>
        <View style={styles.callTopbarActions}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="음성 가이드"
            accessibilityHint={props.voiceGuideOn ? "문항을 소리 내어 읽지 않게 해요" : "문항을 소리 내어 읽어 줘요"}
            accessibilityState={{ checked: props.voiceGuideOn }}
            onPress={props.onToggleVoiceGuide}
            style={({ pressed }) => [styles.utilityButton, light && lightCallStyles.utilityButton, pressed && styles.utilityPressed]}
          >
            <Icon name={props.voiceGuideOn ? "replay" : "sound-off"} size={20} color={props.voiceGuideOn ? t.ink : t.ink2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.darkMode ? "밝은 화면으로 보기" : "어두운 화면으로 보기"}
            onPress={props.onToggleAppearance}
            style={({ pressed }) => [styles.utilityButton, light && lightCallStyles.utilityButton, pressed && styles.utilityPressed]}
          >
            <Icon name={props.darkMode ? "sun" : "moon"} size={20} color={t.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isChat ? "오늘은 여기까지, 통화 마치기" : "통화 종료"}
            onPress={props.onEnd}
            style={({ pressed }) => [styles.topEndButton, { backgroundColor: t.end }, pressed && styles.buttonPressed]}
          >
            {isChat ? (
              <Text style={styles.topEndButtonText}>여기까지</Text>
            ) : (
              <>
                <Icon name="phone-end" size={18} strokeWidth={2.2} color={color.accentInk} />
                {wide && <Text style={styles.topEndButtonText}>종료</Text>}
              </>
            )}
          </Pressable>
        </View>
      </View>
      <View
        style={styles.segmentProgress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={isChat ? "대화 진행" : "복습 진행"}
        accessibilityValue={{ text: props.progressLabel }}
      >
        <View style={styles.segmentTrack}>
          {[0, 1, 2].map((segment) => (
            <View key={segment} style={[styles.segmentBar, { backgroundColor: segmentColor(segment) }]} />
          ))}
        </View>
        <Text style={[styles.segmentLabel, light && lightCallStyles.mutedText]}>{props.progressLabel}</Text>
      </View>

      <ScrollView
        style={styles.dialogueScroll}
        contentContainerStyle={[styles.dialogueContent, compact && styles.dialogueContentCompact]}
        showsVerticalScrollIndicator={false}
      >
        {props.previousReply ? (
          <View style={styles.learnerBubble}>
            <Text style={styles.learnerLabel}>내 답변</Text>
            <Text style={styles.learnerText}>{props.previousReply}</Text>
          </View>
        ) : null}

        {isChat ? (
          <View style={[styles.questionCard, compact && styles.questionCardCompact, light && lightCallStyles.raisedSurface]}>
            <View style={styles.questionHeader}>
              <Text style={[styles.questionSpeaker, light && lightCallStyles.strongText]}>베플리의 질문</Text>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: props.captionsOn }}
                accessibilityLabel="한국어 뜻"
                onPress={props.onToggleCaptions}
                style={[styles.meaningToggle, light && lightCallStyles.utilityButton]}
              >
                <View style={[styles.meaningTrack, { backgroundColor: props.captionsOn ? t.action : t.line }]}>
                  <View style={[styles.meaningKnob, props.captionsOn && styles.meaningKnobOn]} />
                </View>
                <Text style={[styles.meaningToggleText, light && lightCallStyles.strongText]}>한국어 뜻</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="질문 다시 듣기"
                onPress={props.onReplay}
                style={({ pressed }) => [styles.replayButton, { backgroundColor: t.surface2 }, pressed && styles.utilityPressed]}
              >
                <Icon name="replay" size={20} color={t.ink} />
              </Pressable>
            </View>
            {props.turnLoading ? (
              <Text style={[styles.questionLoading, { color: t.ink2 }]} accessibilityLiveRegion="polite">베플리가 질문을 생각하고 있어요…</Text>
            ) : (
              <Text style={[styles.questionEnglish, compact && styles.questionEnglishCompact, light && lightCallStyles.strongText]}>{props.coachLine}</Text>
            )}
            {props.captionsOn && props.questionMeaningKo && !props.turnLoading ? (
              <View style={[styles.questionMeaning, light && lightCallStyles.topBorder]}>
                <Text style={[styles.questionMeaningLabel, { color: t.actionInk }]}>뜻</Text>
                <Text style={[styles.questionMeaningText, light && lightCallStyles.mutedText]}>{props.questionMeaningKo}</Text>
              </View>
            ) : null}
          </View>
        ) : props.captionsOn ? (
          <View style={styles.guideRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="베플리의 안내 다시 듣기"
              onPress={props.onReplay}
              style={({ pressed }) => [styles.replayButton, { backgroundColor: t.surface2 }, pressed && styles.utilityPressed]}
            >
              <Icon name="replay" size={20} color={t.ink} />
            </Pressable>
            <Text style={[styles.guideText, light && lightCallStyles.strongText]} accessibilityLiveRegion="polite">{reviewGuide(props)}</Text>
          </View>
        ) : null}

        {isChat ? (
          <View style={[styles.replyCue, { backgroundColor: t.actionSoft }]} accessibilityLiveRegion="polite">
            <Icon name="mic" size={20} color={t.actionInk} />
            <Text style={[styles.replyCueTitle, { color: t.actionInk }]}>이제 영어로 대답해요</Text>
          </View>
        ) : (
          <View style={[styles.promptBlock, compact && styles.promptBlockCompact, light && lightCallStyles.raisedSurface]}>
            <View style={styles.promptHeading}>
              <Text style={[styles.promptKicker, { color: t.actionInk }]}>오늘의 복습 표현</Text>
              <Text style={[styles.sourceBadge, light && lightCallStyles.strongText, !light && { borderColor: color.lineInverse }]}>{props.sourceLabel}</Text>
            </View>
            <Text style={[styles.promptText, compact && styles.promptTextCompact, light && lightCallStyles.strongText]}>{props.promptKo}</Text>
            <Text style={[styles.promptGuide, light && lightCallStyles.mutedText]}>영어로 말해 볼까요?</Text>
          </View>
        )}

        {listening ? (
          <View style={styles.listeningRow} accessibilityLiveRegion="polite">
            <Signal barColor={t.action} />
            <Text style={[styles.listeningText, { color: t.actionInk }]}>듣고 있어요</Text>
          </View>
        ) : null}

        {transcribing || preparing ? (
          <View style={styles.listeningRow} accessibilityLiveRegion="polite">
            <Text style={[styles.listeningText, { color: t.actionInk }]}>
              {preparing ? "마이크를 준비하고 있어요… 권한을 묻는 창이 뜨면 허용해 주세요." : "말한 내용을 알아듣는 중이에요…"}
            </Text>
          </View>
        ) : null}

        {props.voiceError ? (
          <View style={[styles.voiceErrorCard, { backgroundColor: t.surface2 }]} accessibilityLiveRegion="assertive">
            <Icon name="mic-off" size={20} color={t.ink2} />
            <Text style={[styles.voiceErrorText, { color: t.ink }]}>{props.voiceError}</Text>
          </View>
        ) : null}

        {props.heardText ? (
          <View style={[styles.heardCard, { backgroundColor: t.actionSoft }]} accessibilityLabel="음성 인식 결과">
            <Text style={[styles.heardLabel, { color: t.actionInk }]}>이렇게 들었어</Text>
            <Text style={[styles.heardText, { color: t.ink }]}>“{props.heardText}”</Text>
            {!isChat && <Text style={[styles.heardHelp, { color: t.ink2 }]}>맞으면 보내고, 아니면 다시 말해요.</Text>}
          </View>
        ) : null}

        {feedback?.kind === "correct" && (
          <View style={[styles.reviewFeedbackCard, { backgroundColor: t.okSoft }]} accessibilityLiveRegion="polite" accessibilityLabel="정답">
            <Image source={befly.review.correct} style={styles.reviewFeedbackAvatar} accessible={false} />
            <View style={styles.reviewFeedbackCopy}>
              <View style={styles.reviewFeedbackTitleRow}>
                <View style={[styles.reviewCheck, { backgroundColor: t.ok }]}>
                  <Icon name="check" size={16} strokeWidth={3} color={color.accentInk} />
                </View>
                <Text style={[styles.reviewFeedbackTitle, { color: t.okInk }]}>{feedback.message ?? "정확해요"}</Text>
              </View>
              <Text style={[styles.reviewFeedbackAnswer, { color: t.ink }]}>{props.answerEn}</Text>
            </View>
          </View>
        )}

        {props.checkingAnswer ? (
          <View style={styles.listeningRow} accessibilityLiveRegion="polite">
            <Text style={[styles.listeningText, { color: t.actionInk }]}>베플리가 답을 확인하고 있어요…</Text>
          </View>
        ) : null}

        {feedback?.kind === "hint" && !props.checkingAnswer && (
          <View style={[styles.reviewFeedbackCard, styles.reviewFeedbackCardRetry, light ? lightCallStyles.raisedSurface : darkAppStyles.card]} accessibilityLiveRegion="polite" accessibilityLabel="힌트">
            <View style={styles.reviewRetryHead}>
              <Image source={befly.hint} style={styles.reviewFeedbackAvatar} accessible={false} />
              <View style={styles.reviewFeedbackTitleRow}>
                <Icon name="hint" size={20} color={t.beflyInk} />
                <Text style={[styles.reviewFeedbackTitle, { color: t.beflyInk }]}>{feedback.message ?? "다시 말해 볼까요?"}</Text>
              </View>
            </View>
            <View style={[styles.reviewAnswerBox, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.reviewAnswerLabel, { color: t.ink2 }]}>내 답</Text>
              <Text style={[styles.reviewAnswerText, { color: t.ink2 }]}>{feedback.answer}</Text>
            </View>
            {feedback.hint ? (
              <View style={[styles.reviewAnswerBox, { backgroundColor: t.beflySoft }]}>
                <Text style={[styles.reviewAnswerLabel, { color: t.beflyInk }]}>힌트</Text>
                <Text style={[styles.reviewAnswerText, { color: t.ink }]}>{feedback.hint}</Text>
              </View>
            ) : null}
          </View>
        )}

        {feedback?.kind === "retry" && (
          <View style={[styles.reviewFeedbackCard, styles.reviewFeedbackCardRetry, light ? lightCallStyles.raisedSurface : darkAppStyles.card]} accessibilityLiveRegion="polite" accessibilityLabel="다시 해보기">
            <View style={styles.reviewRetryHead}>
              <Image source={befly.review.retry} style={styles.reviewFeedbackAvatar} accessible={false} />
              <View style={styles.reviewFeedbackTitleRow}>
                <Icon name="retry" size={20} strokeWidth={2.2} color={t.beflyInk} />
                <Text style={[styles.reviewFeedbackTitle, { color: t.beflyInk }]}>{feedback.message ?? "거의 다 왔어요"}</Text>
              </View>
            </View>
            <View style={[styles.reviewAnswerBox, { backgroundColor: t.surface2 }]}>
              <Text style={[styles.reviewAnswerLabel, { color: t.ink2 }]}>내 답</Text>
              <Text style={[styles.reviewAnswerText, { color: t.ink2 }]}>{feedback.answer}</Text>
            </View>
            <View style={[styles.reviewAnswerBox, { backgroundColor: t.okSoft }]}>
              <Text style={[styles.reviewAnswerLabel, { color: t.okInk }]}>이렇게 말해요</Text>
              <Text style={[styles.reviewAnswerText, { color: t.ink }]}>{props.answerEn}</Text>
            </View>
          </View>
        )}

        {isChat && props.idleSecondsLeft <= IDLE_NOTICE_SECONDS && props.voiceState === "idle" && !props.typedText.trim() && (
          <View style={[styles.idleNotice, { backgroundColor: t.surface2 }]} accessibilityLiveRegion="polite" accessibilityLabel="응답 안내">
            <Text style={[styles.idleNoticeTitle, light && lightCallStyles.strongText]}>천천히 생각해도 괜찮아요</Text>
            <Text style={[styles.idleNoticeBody, light && lightCallStyles.mutedText]}>{props.idleSecondsLeft}초 뒤 오늘 통화를 마칠게요. 짧게 한 단어만 말해도 좋아요.</Text>
            <View style={[styles.idleTrack, { backgroundColor: t.line }]} accessible={false}>
              <View style={[styles.idleFill, { backgroundColor: t.ink2, width: `${Math.min(1, props.idleSecondsLeft / IDLE_NOTICE_SECONDS) * 100}%` }]} />
            </View>
          </View>
        )}
      </ScrollView>

      {props.hintOpen && !isChat && (
        <View style={[styles.dockedHintPanel, styles.hintPanel, light && lightCallStyles.hintPanel]} accessibilityLabel="힌트">
          <View style={styles.panelHeading}>
            <Image source={befly.hint} style={styles.panelAvatar} accessible={false} />
            <Text style={[styles.hintLabel, light && lightCallStyles.hintLabel]}>힌트</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="힌트 닫기" onPress={props.onToggleHint} style={styles.panelClose}>
              <Icon name="close" size={20} color={t.ink2} />
            </Pressable>
          </View>
          <Text style={[styles.hintMask, light && lightCallStyles.strongText]} accessibilityLabel="첫 글자 힌트">{maskAnswer(props.answerEn)}</Text>
          <Text style={[styles.hintText, light && lightCallStyles.strongText]}>{props.hint}</Text>
        </View>
      )}

      {isChat && props.choiceAssistOpen && props.choiceOptions.length > 0 && (
        <View style={[styles.dockedHintPanel, styles.choicePanel, light && lightCallStyles.hintPanel]} accessibilityLabel="영어 답변 선택지">
          <View style={styles.panelHeading}>
            <Image source={befly.help} style={styles.panelAvatar} accessible={false} />
            <Text style={[styles.choiceTitle, light && lightCallStyles.hintLabel]}>이렇게 대답해 볼 수 있어요</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="선택지 닫기" onPress={props.onToggleChoiceAssist} style={styles.panelClose}>
              <Icon name="close" size={20} color={t.ink2} />
            </Pressable>
          </View>
          <ScrollView style={styles.choicePanelScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.choiceList}>
              {props.choiceOptions.map((choice) => (
                <Pressable accessibilityRole="button" key={choice.id} onPress={() => props.onChooseAnswer(choice.answerEn)} style={({ pressed }) => [styles.choiceButton, light && lightCallStyles.utilityButton, pressed && styles.choiceButtonPressed]}>
                  <Text style={[styles.choiceAnswer, light && lightCallStyles.strongText]}>{choice.answerEn}</Text>
                  {props.captionsOn && <Text style={[styles.choiceMeaning, light && lightCallStyles.mutedText]}>{choice.meaningKo}</Text>}
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={[styles.choicePanelHelp, light && lightCallStyles.mutedText]}>골라서 소리 내어 읽어도, 내 말로 바꿔 말해도 좋아요.</Text>
        </View>
      )}

      <View style={[styles.callDock, compact && styles.callDockCompact, light && lightCallStyles.dock]}>
        {feedback?.kind === "correct" ? (
          <Pressable accessibilityRole="button" onPress={props.onContinueReview} style={({ pressed }) => [styles.confirmPrimary, styles.nextButton, { backgroundColor: t.action }, pressed && styles.buttonPressed]}>
            <Text style={styles.confirmPrimaryText}>{props.isLastTarget ? "베플리와 짧게 대화하기" : "다음 표현"}</Text>
            <Icon name="send" size={20} strokeWidth={2.4} color={color.accentInk} />
          </Pressable>
        ) : feedback?.kind === "retry" ? (
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" onPress={props.onRetryReview} style={({ pressed }) => [styles.confirmSecondary, light && lightCallStyles.utilityButton, pressed && styles.buttonPressed]}>
              <Text style={[styles.confirmSecondaryText, light && lightCallStyles.strongText]}>{props.inputMode === "text" ? "다시 입력하기" : "다시 말하기"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={props.onContinueReview} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: t.action }, pressed && styles.buttonPressed]}>
              <Text style={styles.confirmPrimaryText}>다음으로</Text>
            </Pressable>
          </View>
        ) : props.inputMode === "voice" && props.voiceState === "review" ? (
          <View style={styles.confirmActions}>
            <Pressable accessibilityRole="button" onPress={props.onRetryVoice} style={({ pressed }) => [styles.confirmSecondary, light && lightCallStyles.utilityButton, pressed && styles.buttonPressed]}>
              <Text style={[styles.confirmSecondaryText, light && lightCallStyles.strongText]}>다시 말하기</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={props.onVoiceAction} style={({ pressed }) => [styles.confirmPrimary, { backgroundColor: t.action }, pressed && styles.buttonPressed]}>
              <Text style={styles.confirmPrimaryText}>이대로 보내기</Text>
            </Pressable>
          </View>
        ) : props.inputMode === "voice" ? (
          <View style={styles.voiceActions}>
            <View style={styles.dockColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isChat ? "대답이 어려워, 답변 선택지 보기" : "힌트"}
                accessibilityState={{ expanded: auxOpen }}
                onPress={onAux}
                style={({ pressed }) => [styles.dockAuxButton, { backgroundColor: auxOpen ? t.beflySoft : t.surface2 }, pressed && styles.buttonPressed]}
              >
                <Icon name={isChat ? "answer-help" : "hint"} color={auxOpen ? t.beflyInk : t.ink} />
              </Pressable>
              <Text style={[styles.dockLabel, { color: t.ink2 }]}>{isChat ? "대답이 어려워" : "힌트"}</Text>
            </View>
            <View style={styles.dockColumn}>
              <View style={styles.micStage}>
              {listening && <MicPulse pulseColor={t.action} size={compact ? 68 : 80} />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={micLabel}
                accessibilityState={{ disabled: micBusy, busy: transcribing || preparing }}
                disabled={micBusy}
                onPress={props.onVoiceAction}
                style={({ pressed }) => [
                  styles.voiceButton,
                  compact && styles.voiceButtonCompact,
                  { backgroundColor: pressed ? (light ? color.primaryStrong : color.actionDark) : t.action },
                  listening && styles.voiceButtonListening,
                  micBusy && styles.voiceButtonBusy,
                  pressed && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <Icon name={listening ? "stop" : "mic"} size={listening ? 26 : 30} color={color.accentInk} />
              </Pressable>
              </View>
              <Text style={[styles.dockLabel, styles.dockLabelPrimary, { color: t.actionInk }]}>{micLabel}</Text>
            </View>
            <View style={styles.dockColumn}>
              <Pressable accessibilityRole="button" accessibilityLabel="글자로 답하기" onPress={() => props.onChangeMode("text")} style={({ pressed }) => [styles.dockAuxButton, { backgroundColor: t.surface2 }, pressed && styles.buttonPressed]}>
                <Icon name="keyboard" color={t.ink} />
              </Pressable>
              <Text style={[styles.dockLabel, { color: t.ink2 }]}>글자로</Text>
            </View>
          </View>
        ) : (
          <View style={styles.textDockWrap}>
            <View style={styles.textDockTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: auxOpen }}
                onPress={onAux}
                style={({ pressed }) => [styles.textDockChip, { backgroundColor: auxOpen ? t.beflySoft : t.surface2 }, pressed && styles.utilityPressed]}
              >
                {!isChat && <Icon name="hint" size={16} color={auxOpen ? t.beflyInk : t.ink} />}
                <Text style={[styles.textDockChipText, { color: auxOpen ? t.beflyInk : t.ink }]}>{isChat ? "대답이 어려워" : "힌트"}</Text>
              </Pressable>
              <Text style={[styles.textDockLabel, { color: t.ink2 }]}>{isChat ? "영어로 대답해요" : "영어로 입력해요"}</Text>
            </View>
            <View style={styles.textDock}>
              <Pressable accessibilityRole="button" accessibilityLabel="말로 답하기" onPress={() => props.onChangeMode("voice")} style={({ pressed }) => [styles.textDockRound, { backgroundColor: t.surface2 }, pressed && styles.buttonPressed]}>
                <Icon name="mic" size={22} color={t.ink} />
              </Pressable>
              <TextInput
                accessibilityLabel={isChat ? "영어로 대답해요" : "영어로 입력해요"}
                autoCapitalize="sentences"
                autoCorrect={false}
                onChangeText={props.onChangeText}
                onSubmitEditing={props.onSubmitText}
                placeholder="짧게 써도 괜찮아요"
                placeholderTextColor={t.ink2}
                returnKeyType="send"
                style={[styles.textInput, light && lightCallStyles.textInput]}
                value={props.typedText}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="보내기"
                disabled={!props.typedText.trim()}
                onPress={props.onSubmitText}
                style={({ pressed }) => [styles.sendButton, { backgroundColor: t.action }, !props.typedText.trim() && styles.sendButtonDisabled, pressed && styles.buttonPressed]}
              >
                <Icon name="send" size={22} strokeWidth={2.4} color={color.accentInk} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function SignalBar({ barHeight, barColor, delay }: { barHeight: number; barColor: string; delay: number }) {
  const progress = useLoop(1000, { delay, easing: Easing.inOut(Easing.quad), reverse: true });
  return (
    <Animated.View
      style={[
        styles.signalBar,
        {
          height: barHeight,
          backgroundColor: barColor,
          transform: [{ scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
        },
      ]}
    />
  );
}

function Signal({ barColor }: { barColor: string }) {
  const levels = [14, 26, 38, 22, 44, 30, 18, 36, 48, 28, 20, 34, 24, 12];
  return (
    <View style={styles.signal} accessible={false}>
      {levels.map((barHeight, index) => (
        <SignalBar key={`${barHeight}-${index}`} barHeight={barHeight * 0.7} barColor={barColor} delay={(index % 5) * 120} />
      ))}
    </View>
  );
}

const REPORT_TAGS = {
  correct: { label: "완료함", ink: "#17673F", bg: color.successSoft, darkInk: "#7FDCAE", darkBg: "#16302A" },
  hinted: { label: "힌트로 완료", ink: color.primaryStrong, bg: color.primarySoft, darkInk: color.actionInkDark, darkBg: color.actionSoftDark },
  retry: { label: "복습 필요", ink: color.warningInk, bg: color.beflySoft, darkInk: "#EBC9A6", darkBg: color.callPulseMiddle },
  skipped: { label: "못 했어요", ink: color.muted, bg: color.surfaceMuted, darkInk: color.mutedInverse, darkBg: color.callPulseOuter },
} as const;

function ReportScreen({
  darkMode,
  onToggleAppearance,
  finishReason,
  outcomes,
  reviewedCount,
  targets,
  conversation,
  talkFeedback,
  saveStatus,
  onRetrySave,
  onDone,
  dateLabel,
}: {
  darkMode: boolean;
  onToggleAppearance: () => void;
  finishReason: FinishReason;
  outcomes: Record<number, ReviewOutcome | "skipped">;
  reviewedCount: number;
  targets: { id: string; promptKo: string; answerEn: string; learnerAnswer?: string }[];
  conversation: { questionEn: string; answer: string }[];
  talkFeedback: string | null;
  saveStatus: SaveStatus | null;
  onRetrySave: () => void;
  onDone: () => void;
  // 있으면 마이페이지에서 연 지난 통화 리포트(날짜 표시, "목록으로" 버튼).
  dateLabel?: string;
}) {
  const past = Boolean(dateLabel);
  const reportCopy =
    finishReason === "no-response"
      ? {
          kicker: "응답이 없어 종료",
          title: "바쁜 순간이었나 봐요",
        }
      : finishReason === "stopped"
        ? {
            kicker: "직접 종료",
            title: "오늘은 여기까지!\n충분히 잘했어요",
          }
        : {
            kicker: "통화 완료",
            title: "오늘 통화 끝!\n잘 해냈어요",
          };
  const title = past ? `${dateLabel} 통화 리포트` : reportCopy.title;

  const againTargets = targets.filter((_, index) => outcomes[index] === "retry");
  const coachComment =
    finishReason === "no-response"
      ? "대답이 없어서 통화를 마쳤어요. 다음 통화에서 이어서 해요."
      : finishReason === "stopped"
        ? "중간에 멈춰도 괜찮아요. 오늘 말해 본 표현만으로도 한 걸음 나아갔어요."
        : againTargets.length > 0
          ? `끝까지 잘 해냈어요. ${againTargets[0]!.answerEn}는 복습할 때 한 번 더 같이 말해 봐요.`
          : past
            ? "이날 표현을 모두 정확하게 말했어요."
            : "오늘 표현을 모두 정확하게 말했어요. 다음 통화도 이렇게 가볍게 해 봐요.";

  return (
    <View style={styles.reportScreen}>
      <ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
        <View style={styles.resultChipRow}><View style={[styles.resultChip, finishReason === "stopped" && styles.resultChipStopped, finishReason === "no-response" && styles.resultChipIdle]}><Text style={[styles.resultChipText, finishReason === "stopped" && styles.resultChipTextStopped, finishReason === "no-response" && styles.resultChipTextIdle]}>{reportCopy.kicker}</Text></View><AppearanceToggle darkMode={darkMode} onPress={onToggleAppearance} compact /></View>
        <Text style={[styles.reportTitle, darkMode && darkAppStyles.strongText]}>{title}</Text>
        {saveStatus && saveStatus !== "idle" ? (
          <View style={[styles.saveStatus, darkMode && darkAppStyles.card]} accessibilityLiveRegion="polite">
            <Text style={[styles.saveStatusText, darkMode && darkAppStyles.mutedText, saveStatus === "failed" && styles.saveStatusFailed]}>
              {saveStatus === "saving" ? "통화 기록을 저장하고 있어요…" : saveStatus === "saved" ? "선생님이 볼 수 있게 통화 기록을 저장했어요." : "통화 기록을 저장하지 못했어요."}
            </Text>
            {saveStatus === "failed" ? (
              <Pressable accessibilityRole="button" onPress={onRetrySave} style={({ pressed }) => [styles.saveRetry, pressed && styles.buttonPressed]}>
                <Text style={styles.saveRetryText}>다시 시도</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.reportCoachRow}><Image source={befly.result[finishReason]} style={styles.reportAvatar} accessibilityLabel="베플리 선생님" /><View style={[styles.reportSpeechBubble,darkMode && darkAppStyles.card]}><Text style={[styles.reportSpeechText,darkMode && darkAppStyles.strongText]}>{coachComment}</Text></View></View>
        <View style={styles.reportStatRow}>
          <View style={[styles.reportStatCard,darkMode && darkAppStyles.card]}><Text style={[styles.reportStatLabel,darkMode && darkAppStyles.mutedText]}>복습한 표현</Text><Text style={[styles.reportStatNumber,darkMode && darkAppStyles.strongText]}>{reviewedCount}<Text style={[styles.reportStatSuffix,darkMode && darkAppStyles.strongText]}> / {targets.length}</Text></Text></View>
          <View style={[styles.reportStatCard,darkMode && darkAppStyles.card]}><Text style={[styles.reportStatLabel,darkMode && darkAppStyles.mutedText]}>다시 볼 표현</Text><Text style={[styles.reportStatNumber,{color: darkMode ? color.beflyDark : color.befly}]}>{againTargets.length}<Text style={[styles.reportStatSuffix,darkMode && darkAppStyles.strongText]}> 개</Text></Text></View>
        </View>
        <View style={[styles.reportExpressionCard,darkMode && darkAppStyles.card]} accessibilityLabel="오늘의 표현">
          {targets.map((target,index) => {
            const tag = REPORT_TAGS[outcomes[index] ?? "skipped"];
            return <View key={target.id} style={[styles.reportExpressionRow,index < targets.length - 1 && styles.reportExpressionDivider,darkMode && darkAppStyles.bottomBorder]}><View style={styles.reportExpressionCopy}><Text style={[styles.reportExpressionEn,darkMode && darkAppStyles.strongText]}>{target.answerEn}</Text><Text style={[styles.reportExpressionKo,darkMode && darkAppStyles.mutedText]}>{target.promptKo}</Text>{target.learnerAnswer && (outcomes[index] === "retry" || outcomes[index] === "hinted") ? <Text style={[styles.reportExpressionKo,darkMode && darkAppStyles.mutedText]}>내 답: {target.learnerAnswer}</Text> : null}</View><View style={[styles.reportExpressionTag,{backgroundColor: darkMode ? tag.darkBg : tag.bg}]}><Text style={[styles.reportExpressionTagText,{color: darkMode ? tag.darkInk : tag.ink}]}>{tag.label}</Text></View></View>;
          })}
        </View>
        {conversation.length > 0 && (
          <View style={styles.reportConversation}>
            <Text style={[styles.reportConversationTitle, darkMode && darkAppStyles.strongText]}>베플리와 나눈 대화</Text>
            {conversation.map((turn, index) => (
              <View key={`${index}-${turn.questionEn}`} style={styles.chatTurn}>
                <View style={styles.chatBeflyRow}>
                  <Image source={befly.home} style={styles.chatAvatar} accessibilityLabel="베플리" />
                  <View style={[styles.chatBeflyBubble, darkMode && darkAppStyles.card]}>
                    <Text style={[styles.chatSpeaker, { color: darkMode ? color.beflyDark : color.befly }]}>베플리</Text>
                    <Text style={[styles.chatText, darkMode && darkAppStyles.strongText]}>{turn.questionEn}</Text>
                  </View>
                </View>
                <View style={styles.chatMeRow}>
                  <View style={styles.reportReplyChip}>
                    <Text style={styles.reportReplyText}>{turn.answer}</Text>
                  </View>
                </View>
              </View>
            ))}
            {talkFeedback ? (
              <View style={[styles.talkFeedbackCard, darkMode && darkAppStyles.card]} accessibilityLabel="베플리 선생님의 대화 피드백">
                <Text style={[styles.talkFeedbackLabel, { color: darkMode ? color.beflyDark : color.befly }]}>베플리 선생님의 한마디</Text>
                <Text style={[styles.talkFeedbackText, darkMode && darkAppStyles.strongText]}>{talkFeedback}</Text>
              </View>
            ) : !past && saveStatus === "saving" ? (
              <Text style={[styles.talkFeedbackPending, darkMode && darkAppStyles.mutedText]}>대화 피드백을 정리하고 있어요…</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
      <View style={[styles.reportBottom,darkMode && darkAppStyles.surface]}><Pressable accessibilityRole="button" onPress={onDone} style={({pressed}) => [styles.reportHomeButton,pressed && styles.buttonPressed]}><Text style={styles.reportHomeButtonText}>{past ? "목록으로" : "홈으로"}</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  choicePanel: { backgroundColor: color.callHint, borderWidth: 1, borderColor: color.warning, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  choicePanelScroll: { flexGrow: 0 },
  choicePanelHelp: { color: color.mutedInverse, fontSize: 12, lineHeight: 18 },
  textDockTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  meaningToggle: { minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: color.lineInverse, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: color.callRaised },
  meaningTrack: { width: 30, height: 18, borderRadius: 9, padding: 2, justifyContent: "center" },
  meaningKnob: { width: 14, height: 14, borderRadius: 7, backgroundColor: color.surface },
  meaningKnobOn: { alignSelf: "flex-end" },
  replayButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  guideText: { flex: 1, color: color.inkInverse, fontSize: 16, lineHeight: 23, fontWeight: "500" },
  listeningRow: { alignItems: "center", gap: 8, paddingVertical: 8 },
  listeningText: { fontSize: 15, fontWeight: "700" },
  heardHelp: { fontSize: 13, lineHeight: 19 },
  callStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  callLiveDot: { width: 7, height: 7, borderRadius: 4 },
  callHeaderAvatarCompact: { width: 36, height: 36 },
  dockColumn: { alignItems: "center", gap: 8, minWidth: 72 },
  dockLabel: { fontSize: 12, fontWeight: "600" },
  dockLabelPrimary: { fontWeight: "700" },
  textDockChip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18, paddingHorizontal: 12 },
  textDockChipText: { fontSize: 13, fontWeight: "700" },
  textDockRound: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  nextButton: { flex: 0, flexDirection: "row", gap: 8 },
  reviewFeedbackCopy: { flex: 1, gap: 4 },
  reviewFeedbackTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewCheck: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reviewFeedbackCardRetry: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  reviewRetryHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  reviewAnswerBox: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  reviewAnswerLabel: { fontSize: 12, fontWeight: "700" },
  reviewAnswerText: { fontFamily: font.englishBold, fontSize: 17, lineHeight: 23 },
  meaningToggleText: { color: color.inkInverse, fontSize: 12, fontWeight: "600" },
  dockedHintPanel: { marginHorizontal: 20, marginBottom: 10, borderRadius: 22, maxHeight: "45%" },
  panelClose: { marginLeft: "auto", width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  incomingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 24 },
  incomingIdentity: { alignItems: "center", gap: 6 },
  incomingName: { color: color.inkInverse, fontSize: 24, fontWeight: "700" },
  incomingMeta: { color: color.mutedInverse, fontSize: 15 },
  incomingSpeech: { maxWidth: 280, backgroundColor: color.callRaised, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, paddingHorizontal: 18, paddingVertical: 14, gap: 4 },
  incomingEnglish: { color: color.inkInverse, fontFamily: font.englishBold, fontSize: 18 },
  incomingKo: { color: color.inkInverse, fontSize: 16, lineHeight: 24 },
  mySectionTitle: { color: color.ink, fontSize: 17, fontWeight: "700" },
  myTeacherBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, backgroundColor: color.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5 },
  myTeacherBadgeText: { color: color.muted, fontSize: 12, fontWeight: "600" },
  myWeekdays: { flexDirection: "row", gap: 6 },
  myWeekday: { flex: 1, height: 44, borderRadius: 14, backgroundColor: color.paper, alignItems: "center", justifyContent: "center" },
  myWeekdayActive: { backgroundColor: color.ink },
  myWeekdayText: { color: color.muted, fontSize: 14 },
  myWeekdayTextActive: { color: color.surface, fontWeight: "700" },
  myScheduleDetails: { flexDirection: "row", gap: 24 },
  myDetailLabel: { color: color.muted, fontSize: 13 },
  myDetailValue: { color: color.ink, fontSize: 18, fontWeight: "700" },
  myScheduleHelp: { color: color.muted, fontSize: 14, lineHeight: 22, borderTopWidth: 1, borderTopColor: color.surfaceMuted, paddingTop: 14 },
  myThemeSection: { gap: 10 },
  myThemeSelector: { flexDirection: "row", backgroundColor: "#E9E3D9", borderRadius: 16, padding: 4, gap: 4 },
  myThemeChoice: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  myThemeChoiceActive: { backgroundColor: color.surface },
  myThemeChoiceText: { color: color.ink, fontSize: 14 },
  myThemeChoiceTextActive: { fontWeight: "700" },
  myHistoryRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.surfaceMuted },
  myHistoryDate: { width: 48, alignItems: "center" },
  myHistoryDay: { color: color.ink, fontFamily: font.englishBold, fontSize: 20, lineHeight: 23 },
  myHistoryMonth: { color: color.muted, fontSize: 11 },
  myHistoryCopy: { flex: 1, gap: 2 },
  myHistorySummary: { color: color.ink, fontSize: 15, fontWeight: "600" },
  myHistoryDetail: { color: color.muted, fontSize: 13 },
  myHistoryTag: { borderRadius: 99, backgroundColor: color.successSoft, paddingHorizontal: 10, paddingVertical: 4 },
  myHistoryTagText: { color: color.success, fontSize: 12, fontWeight: "600" },
  segmentProgress: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  segmentTrack: { flex: 1, flexDirection: "row", gap: 4 },
  segmentBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: color.line },
  segmentLabel: { color: color.mutedInverse, fontSize: 13, fontWeight: "600" },
  homeScreen: { flex: 1 },
  homeBottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30, backgroundColor: color.paper },
  homeAnswerButton: { height: 60, borderRadius: 30, backgroundColor: "#1E8A5A", flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  saveStatus: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, backgroundColor: color.surface, paddingHorizontal: 14, paddingVertical: 10 },
  saveStatusText: { flex: 1, color: color.muted, fontSize: 14, lineHeight: 20 },
  saveStatusFailed: { color: color.danger },
  saveRetry: { minHeight: 44, borderRadius: 22, backgroundColor: color.primary, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  saveRetryText: { color: color.surface, fontSize: 14, fontWeight: "700" },
  questionLoading: { fontSize: 17, lineHeight: 26, fontWeight: "600", paddingVertical: 8 },
  voiceErrorCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  voiceErrorText: { flex: 1, fontSize: 14, lineHeight: 20 },
  voiceButtonBusy: { opacity: 0.55 },
  homeAnswerButtonDisabled: { backgroundColor: "#8A8F9C" },
  logoutButton: { minHeight: 52, borderRadius: 26, backgroundColor: color.surface, alignItems: "center", justifyContent: "center" },
  logoutButtonText: { color: color.muted, fontSize: 15, fontWeight: "600" },
  loginKeyboard: { flex: 1 },
  loginScreen: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32, gap: 24 },
  loginIntro: { gap: 10 },
  loginAvatar: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: color.beflySoft, marginBottom: 6 },
  loginTitle: { color: color.ink, fontSize: 26, lineHeight: 35, fontWeight: "700", letterSpacing: -0.5 },
  loginBody: { color: color.muted, fontSize: 15, lineHeight: 23 },
  loginNotice: { color: color.warningInk, backgroundColor: color.callHintLight, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, lineHeight: 21 },
  loginForm: { gap: 16 },
  loginField: { gap: 6 },
  loginLabel: { color: color.ink, fontSize: 14, fontWeight: "600" },
  loginInput: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, paddingHorizontal: 16, color: color.ink, fontSize: 16, fontFamily: font.body },
  loginError: { color: color.danger, fontSize: 14, lineHeight: 21 },
  loginButton: { height: 56, borderRadius: 28, backgroundColor: color.primary, alignItems: "center", justifyContent: "center", marginTop: "auto" },
  loginButtonDisabled: { backgroundColor: "#A7AAB3" },
  loginButtonText: { color: color.surface, fontSize: 17, fontWeight: "700" },
  homeAnswerButtonText: { color: color.surface, fontSize: 17, fontWeight: "700" },
  homeCardMuted: { color: "#C9CCD4", fontSize: 14, lineHeight: 22 },
  homeReadyStrip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: "#30343E", paddingHorizontal: 12, paddingVertical: 10 },
  homeReadyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#3CCB86" },
  homeReadyText: { color: color.inkInverse, fontSize: 13, flex: 1 },
  homeReviewSection: { gap: 10 },
  homeReviewHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  homeSectionTitle: { color: color.ink, fontSize: 17, fontWeight: "700" },
  homeReviewSub: { color: color.muted, fontSize: 12, flexShrink: 1 },
  homeStatsRow: { flexDirection: "row", gap: 10 },
  homeStatCard: { flex: 1, borderRadius: 20, backgroundColor: color.surface, padding: 16, gap: 2 },
  homeStatLabel: { color: color.muted, fontSize: 14 },
  homeStatNumber: { color: color.ink, fontFamily: font.englishBold, fontSize: 34, lineHeight: 40 },
  homeStatUnit: { color: color.ink, fontFamily: font.body, fontSize: 15 },
  homeReviewDescription: { color: color.muted, fontSize: 14, lineHeight: 22 },
  reportScreen: { flex: 1 },
  resultChipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultChip: { alignSelf: "flex-start", borderRadius: 99, backgroundColor: color.successSoft, paddingHorizontal: 12, paddingVertical: 7 },
  resultChipStopped: { backgroundColor: color.primarySoft },
  resultChipIdle: { backgroundColor: color.surfaceMuted },
  resultChipText: { color: color.success, fontSize: 13, fontWeight: "700" },
  resultChipTextStopped: { color: color.primaryStrong },
  resultChipTextIdle: { color: color.muted },
  reportCoachRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  reportSpeechBubble: { flex: 1, backgroundColor: color.surface, borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingHorizontal: 16, paddingVertical: 14 },
  reportSpeechText: { color: color.ink, fontSize: 16, lineHeight: 25 },
  reportStatRow: { flexDirection: "row", gap: 10 },
  reportStatCard: { flex: 1, backgroundColor: color.surface, borderRadius: 20, padding: 16, gap: 4 },
  reportStatLabel: { color: color.muted, fontSize: 14 },
  reportStatNumber: { color: color.ink, fontFamily: font.englishBold, fontSize: 34, lineHeight: 40 },
  reportStatSuffix: { color: color.ink, fontFamily: font.body, fontSize: 15 },
  reportExpressionCard: { backgroundColor: color.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 6 },
  reportExpressionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  reportExpressionDivider: { borderBottomWidth: 1, borderBottomColor: color.surfaceMuted },
  reportExpressionCopy: { flex: 1, gap: 2 },
  reportExpressionEn: { color: color.ink, fontFamily: font.englishBold, fontSize: 17, lineHeight: 22 },
  reportExpressionKo: { color: color.muted, fontSize: 13 },
  reportExpressionTag: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  reportExpressionTagDone: { backgroundColor: color.successSoft },
  reportExpressionTagRepeat: { backgroundColor: color.beflySoft },
  reportExpressionTagText: { fontSize: 12, fontWeight: "600" },
  reportConversation: { gap: 12 },
  reportConversationTitle: { color: color.ink, fontSize: 15, fontWeight: "700" },
  chatTurn: { gap: 8 },
  talkFeedbackCard: { marginTop: 4, borderRadius: 18, borderWidth: 1, borderColor: color.line, backgroundColor: color.beflySoft, padding: 16, gap: 6 },
  talkFeedbackLabel: { fontSize: 13, fontWeight: "700" },
  talkFeedbackText: { color: color.ink, fontSize: 15, lineHeight: 22 },
  talkFeedbackPending: { color: color.muted, fontSize: 13 },
  chatBeflyRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingRight: 40 },
  chatAvatar: { width: 32, height: 32, borderRadius: 16 },
  chatBeflyBubble: { flexShrink: 1, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  chatSpeaker: { fontFamily: font.semibold, fontSize: 11 },
  chatText: { color: color.ink, fontFamily: font.english, fontSize: 15, lineHeight: 21 },
  chatMeRow: { alignItems: "flex-end", paddingLeft: 56 },
  reportReplyChip: { backgroundColor: color.ink, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  reportReplyText: { color: color.surface, fontFamily: font.english, fontSize: 15 },
  reportBottom: { backgroundColor: color.paper, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  reportHomeButton: { height: 56, borderRadius: 28, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  reportHomeButtonText: { color: color.surface, fontSize: 16, fontWeight: "700" },
  bootstrapScreen: { flex: 1, justifyContent: "center", padding: space.lg, backgroundColor: color.paper, gap: space.md },
  bootstrapTitle: { color: color.ink, fontFamily: font.display, fontSize: 28, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  bootstrapBody: { color: color.muted, fontSize: 15, lineHeight: 23 },
  bootstrapRetry: { minHeight: 52, alignSelf: "flex-start", justifyContent: "center", borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: color.primary },
  bootstrapRetryText: { color: color.accentInk, fontSize: 15, fontWeight: "800" },
  appRoot: { flex: 1, alignItems: "center", backgroundColor: color.paper },
  appRootCall: { backgroundColor: color.call },
  safe: { flex: 1, width: "100%", backgroundColor: color.paper },
  safeWeb: { maxWidth: 480 },
  safeCall: { backgroundColor: color.call },
  homeContent: { padding: 20, paddingTop: 44, paddingBottom: 20, gap: 24 },
  homeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm, gap: space.sm },
  brandEyebrow: { color: color.muted, fontFamily: font.body, fontSize: 13, fontWeight: "700" },
  homeTitle: { color: color.ink, fontFamily: font.display, fontSize: 27, lineHeight: 35, fontWeight: "800", letterSpacing: -0.8, marginTop: space.xs },
  myButton: { minWidth: 52, height: 44, borderRadius: radius.pill, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  myButtonText: { color: color.ink, fontSize: 14, fontWeight: "700" },
  avatarSmall: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: color.primaryStrong, fontSize: 18, fontWeight: "800" },
  nextCallCard: { backgroundColor: color.ink, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  nextCallTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: color.muted, fontSize: 13, fontWeight: "700" },
  readyBadge: { backgroundColor: color.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  readyBadgeText: { color: color.success, fontSize: 12, fontWeight: "800" },
  nextCallTime: { color: color.inkInverse, fontFamily: font.display, fontSize: 36, lineHeight: 42, fontWeight: "700", letterSpacing: -0.7 },
  nextCallDescription: { color: color.muted, fontSize: 15, lineHeight: 23 },
  primaryButton: { minHeight: 58, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: color.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, marginTop: space.xs },
  primaryButtonText: { color: color.accentInk, fontSize: 17, fontWeight: "800" },
  primaryButtonIcon: { color: color.accentInk, fontSize: 28, lineHeight: 28, marginTop: -2 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  sectionTitle: { color: color.ink, fontFamily: font.display, fontSize: 20, fontWeight: "800", marginTop: space.sm },
  planList: { borderTopWidth: 1, borderTopColor: color.line },
  planRow: { minHeight: 66, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: color.line },
  planNumber: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: color.surfaceMuted, alignItems: "center", justifyContent: "center", marginRight: space.md },
  planNumberText: { color: color.muted, fontWeight: "800" },
  planTitle: { color: color.ink, fontSize: 15, fontWeight: "700", flex: 1 },
  planMeta: { color: color.muted, fontSize: 13 },
  accessCard: { backgroundColor: color.surfaceMuted, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  accessTitle: { color: color.ink, fontSize: 16, fontWeight: "800" },
  accessBody: { color: color.ink, fontSize: 14, lineHeight: 21 },
  myPageContent: { paddingHorizontal: 20, paddingTop: 44, paddingBottom: 32, gap: 24 },
  myPageHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  myPageHeadingCopy: { flex: 1 },
  myPageTitle: { color: color.ink, fontFamily: font.display, fontSize: 20, fontWeight: "700", flex: 1 },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted },
  profileStrip: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  profileCopy: { flex: 1, gap: space.xs },
  profileTitle: { color: color.ink, fontSize: 17, fontWeight: "800" },
  profileMeta: { color: color.muted, fontSize: 14 },
  scheduleCard: { backgroundColor: color.surface, borderRadius: 24, padding: 22, gap: 16 },
  scheduleTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  scheduleLabel: { color: color.mutedInverse, fontSize: 13, fontWeight: "700", flex: 1 },
  teacherBadge: { backgroundColor: color.primarySoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  teacherBadgeText: { color: color.primaryStrong, fontSize: 11, fontWeight: "800" },
  scheduleValue: { color: color.inkInverse, fontFamily: font.display, fontSize: 23, lineHeight: 31, fontWeight: "800" },
  scheduleMeta: { color: color.primarySoft, fontSize: 14, fontWeight: "700" },
  scheduleHelp: { color: color.mutedInverse, fontSize: 13, lineHeight: 20, marginTop: space.xs },
  historyList: { backgroundColor: color.surface, borderRadius: 22, paddingHorizontal: 18, overflow: "hidden" },
  historyRow: { minHeight: 108, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, gap: space.sm },
  historyDateBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  historyDate: { color: color.muted, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "700" },
  historyResult: { color: color.primaryStrong, fontSize: 12, fontWeight: "800" },
  historyFocus: { color: color.ink, fontSize: 16, fontWeight: "800" },
  historyExpressions: { color: color.muted, fontSize: 13, lineHeight: 20 },
  incomingScreen: { flex: 1, paddingHorizontal: 28, paddingTop: 48, paddingBottom: 32, alignItems: "center", justifyContent: "space-between" },
  incomingCopy: { alignItems: "center", gap: 10 },
  callKicker: { color: color.mutedInverse, fontSize: 14, fontWeight: "700" },
  callerName: { color: color.inkInverse, fontFamily: font.display, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  callMeta: { color: color.mutedInverse, fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: space.sm },
  incomingStage: { width: 220, height: 220, alignItems: "center", justifyContent: "center" },
  incomingRipple: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 110, borderWidth: 2 },
  incomingHalo: { position: "absolute", top: 30, left: 30, right: 30, bottom: 30, borderRadius: 80 },
  micStage: { alignItems: "center", justifyContent: "center" },
  incomingActions: { width: "100%", flexDirection: "row", justifyContent: "space-around" },
  callActionWrap: { alignItems: "center", gap: space.sm },
  callAction: { width: 72, height: 72, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  callActionDanger: { backgroundColor: color.callPulseOuter },
  callActionSuccess: { backgroundColor: color.success },
  callActionLabel: { color: color.inkInverse, fontSize: 14, fontWeight: "700" },
  appearanceToggle: { minHeight: 36, borderRadius: radius.pill, paddingHorizontal: space.md, justifyContent: "center", borderWidth: 1, borderColor: color.lineInverse, marginTop: space.md },
  appearanceToggleText: { color: color.mutedInverse, fontSize: 13, fontWeight: "700" },
  connectingScreen: { flex: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 48, paddingBottom: 32 },
  connectingCenter: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", gap: 28 },
  connectingRingWrap: { width: 168, height: 168, alignItems: "center", justifyContent: "center" },
  connectingCopy: { alignItems: "center", gap: 6 },
  connectingTitle: { color: color.inkInverse, fontSize: 24, fontWeight: "700" },
  connectingBody: { color: color.mutedInverse, fontSize: 15 },
  connectingSteps: { width: "100%", borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, gap: 14 },
  connectingStep: { flexDirection: "row", alignItems: "center", gap: 12 },
  connectingStepMark: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  connectingStepActive: { borderWidth: 2.5, borderColor: color.primary },
  connectingStepWaiting: { borderWidth: 2, borderStyle: "dashed", borderColor: "#C9C2B6" },
  connectingStepLabel: { flex: 1, color: color.inkInverse, fontSize: 15 },
  connectingStepStatus: { fontSize: 13, fontWeight: "600" },
  connectingNote: { color: color.mutedInverse, fontSize: 13, lineHeight: 20, textAlign: "center" },
  connectingCancel: { width: "100%", height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  connectingCancelText: { color: color.inkInverse, fontSize: 16, fontWeight: "600" },
  callScreen: { flex: 1, backgroundColor: color.call },
  callTopbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14, gap: 12 },
  callTopbarActions: { flexDirection: "row", gap: space.xs },
  utilityButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.callRaised, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.lineInverse },
  utilityPressed: { opacity: 0.65 },
  utilitySymbol: { color: color.inkInverse, fontSize: 22, fontWeight: "800" },
  callIdentity: { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 2 },
  callTimer: { color: color.mutedInverse, fontSize: 13, fontVariant: ["tabular-nums"] },
  callName: { color: color.inkInverse, fontSize: 16, fontWeight: "800" },
  callProgress: { color: color.mutedInverse, fontSize: 12, fontWeight: "700" },
  dialogueScroll: { flex: 1 },
  dialogueContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 14 },
  learnerBubble: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: color.primary, borderRadius: radius.md, padding: space.md, gap: space.xs },
  learnerLabel: { color: color.primarySoft, fontSize: 11, fontWeight: "800" },
  learnerText: { color: color.accentInk, fontSize: 16, lineHeight: 23, fontWeight: "700" },
  coachBubble: { gap: space.xs },
  speakerLabel: { color: color.mutedInverse, fontSize: 12, fontWeight: "800" },
  coachText: { color: color.mutedInverse, fontSize: 16, lineHeight: 25, fontWeight: "500" },
  questionCard: { backgroundColor: color.callRaised, borderRadius: 24, padding: space.lg, gap: 12 },
  questionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  questionAvatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  questionAvatarText: { color: color.accentInk, fontSize: 16, fontWeight: "800" },
  questionHeaderCopy: { flex: 1, gap: 2 },
  questionSpeaker: { color: color.inkInverse, fontSize: 13, fontWeight: "700", flex: 1 },
  questionMode: { color: color.mutedInverse, fontSize: 12, lineHeight: 18 },
  questionEnglish: { color: color.inkInverse, fontFamily: font.englishBold, fontSize: 26, lineHeight: 33, fontWeight: "700", letterSpacing: -0.3 },
  questionMeaning: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineInverse, paddingTop: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  questionMeaningLabel: { color: color.primarySoft, fontSize: 12, fontWeight: "800" },
  questionMeaningText: { color: color.mutedInverse, fontSize: 15, lineHeight: 23, flex: 1 },
  replyCue: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 99, backgroundColor: color.actionSoftDark, paddingHorizontal: 14, paddingVertical: 8 },
  replyCueMarker: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
  replyCueMarkerText: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  replyCueCopy: { flex: 1, gap: space.xs },
  replyCueTitle: { color: color.actionInkDark, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  replyCueBody: { color: color.mutedInverse, fontSize: 14, lineHeight: 21 },
  promptBlock: { backgroundColor: color.callRaised, borderRadius: 24, padding: space.lg, minHeight: 160, justifyContent: "center", gap: space.sm },
  promptHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  sourceBadge: { fontSize: 12, fontWeight: "700", borderWidth: 1, borderColor: color.line, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs, color: color.inkInverse },
  promptKicker: { color: color.mutedInverse, fontSize: 13, fontWeight: "700" },
  promptText: { color: color.inkInverse, fontFamily: font.display, fontSize: 30, lineHeight: 40, fontWeight: "700", letterSpacing: -0.6 },
  promptGuide: { color: color.mutedInverse, fontSize: 13, lineHeight: 19, marginTop: space.xs },
  hintPanel: { backgroundColor: color.callHint, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: color.warning, gap: space.xs },
  hintLabel: { color: color.warning, fontSize: 12, fontWeight: "800" },
  hintText: { color: color.inkInverse, fontSize: 15, lineHeight: 22 },
  hintMask: { color: color.inkInverse, fontFamily: font.englishBold, fontSize: 22, lineHeight: 28, letterSpacing: 1 },
  choiceBlock: { gap: space.sm },
  choiceAssistButton: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.callRaised, borderWidth: 1, borderColor: color.lineInverse },
  choiceAssistButtonActive: { backgroundColor: color.callHint, borderColor: color.primary },
  choiceAssistButtonText: { color: color.inkInverse, fontSize: 13, fontWeight: "800" },
  choiceTitle: { color: color.mutedInverse, fontSize: 13, fontWeight: "800" },
  choiceList: { gap: space.sm },
  choiceButton: { minHeight: 58, backgroundColor: color.callRaised, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineInverse, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: "center", gap: space.xs },
  choiceButtonPressed: { backgroundColor: color.callHint, transform: [{ scale: 0.99 }] },
  choiceAnswer: { color: color.inkInverse, fontFamily: font.englishBold, fontSize: 16, lineHeight: 22, fontWeight: "700" },
  choiceMeaning: { color: color.mutedInverse, fontSize: 12, lineHeight: 18 },
  stopTalkRow: { alignItems: "flex-start", gap: space.xs },
  stopTalkButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: space.sm },
  stopTalkButtonText: { color: color.mutedInverse, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  idleStopText: { color: color.mutedInverse, fontSize: 11, lineHeight: 17, paddingHorizontal: space.sm },
  heardCard: { backgroundColor: color.primarySoft, borderRadius: radius.md, padding: space.md, gap: space.sm },
  heardLabel: { color: color.primaryStrong, fontSize: 12, fontWeight: "800" },
  heardText: { color: color.ink, fontFamily: font.englishBold, fontSize: 20, fontWeight: "700" },
  retryButton: { alignSelf: "flex-start", paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.surface },
  retryButtonText: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  callDock: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineInverse, backgroundColor: color.call },
  modeSwitch: { alignSelf: "center", flexDirection: "row", backgroundColor: color.callRaised, borderRadius: radius.pill, padding: 4, marginBottom: space.md },
  modeButton: { minWidth: 76, minHeight: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  modeButtonActive: { backgroundColor: color.primary },
  modeButtonText: { color: color.mutedInverse, fontSize: 13, fontWeight: "800" },
  modeButtonTextActive: { color: color.accentInk },
  voiceDock: { alignItems: "center" },
  signal: { height: 36, flexDirection: "row", alignItems: "center", gap: 4 },
  signalBar: { width: 4, borderRadius: radius.pill },
  voiceActions: { width: "100%", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: space.sm },
  endButton: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: color.danger, alignItems: "center", justifyContent: "center" },
  endButtonText: { color: color.accentInk, fontSize: 30, lineHeight: 32 },
  endButtonPlaceholder: { width: 54, height: 54 },
  voiceButton: { width: 80, height: 80, borderRadius: radius.pill, backgroundColor: color.actionDark, alignItems: "center", justifyContent: "center" },
  voiceButtonListening: { boxShadow: "0 0 0 10px rgba(47,85,212,0.18)" },
  voiceButtonText: { color: color.accentInk, fontSize: 34, fontWeight: "800" },
  voiceGuide: { color: color.mutedInverse, fontSize: 13, fontWeight: "600", marginTop: space.sm },
  textDockWrap: { gap: space.xs },
  textDockLabel: { color: color.mutedInverse, fontSize: 13, fontWeight: "600" },
  textDock: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space.sm },
  textInput: { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: color.callRaised, borderWidth: 1, borderColor: color.lineInverse, paddingHorizontal: space.md, color: color.inkInverse, fontSize: 16 },
  sendButton: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.35 },
  reportContent: { padding: 20, paddingTop: 52, paddingBottom: 20, gap: 24 },
  reportKicker: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  reportTitle: { color: color.ink, fontFamily: font.display, fontSize: 28, lineHeight: 36, fontWeight: "700", letterSpacing: -0.6 },
  reportSummary: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, flexDirection: "row", paddingVertical: space.lg },
  reportScore: { flex: 1, alignItems: "center", gap: space.xs },
  reportScoreValue: { color: color.primaryStrong, fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  reportScoreLabel: { color: color.muted, fontSize: 13, fontWeight: "700" },
  reportDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.line },
  commentCard: { backgroundColor: color.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  commentLabel: { color: color.primaryStrong, fontSize: 12, fontWeight: "800" },
  commentText: { color: color.ink, fontSize: 16, lineHeight: 25, fontWeight: "600" },
  expressionList: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, overflow: "hidden" },
  expressionRow: { minHeight: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, gap: space.md },
  expressionNumber: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  expressionText: { color: color.ink, fontSize: 15, fontWeight: "700", flex: 1 },
  homeHeaderActions: { flexDirection: "row", alignItems: "center", gap: space.xs },
  myButtonBadge: { position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: color.danger, borderWidth: 2, borderColor: color.paper, alignItems: "center", justifyContent: "center" },
  myButtonBadgeText: { color: color.accentInk, fontSize: 12, fontWeight: "800" },
  homeHeadingCopy: { flex: 1, minWidth: 0 },
  appearanceToggleCompact: { width: 44, height: 44, alignItems: "center", paddingHorizontal: 0, marginTop: 0 },
  homeBeflyRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  homeBeflyAvatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.beflySoft },
  homeBeflyName: { color: color.inkInverse, fontWeight: "600", fontSize: 15 },
  incomingAvatar: { width: 168, height: 168, borderRadius: radius.pill, backgroundColor: color.beflySoft, borderWidth: 4, borderColor: color.befly },
  connectingAvatar: { width: 140, height: 140, borderRadius: radius.pill, backgroundColor: color.beflySoft },
  callHeaderAvatar: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 2, borderColor: color.befly, backgroundColor: color.beflySoft },
  callHeaderAvatarListening: { borderColor: color.primary },
  questionAvatarImage: { width: 40, height: 40, borderRadius: radius.pill },
  panelHeading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  panelAvatar: { width: 40, height: 40, borderRadius: radius.pill },
  progressTrack: { height: 4, marginHorizontal: space.lg, backgroundColor: color.line, borderRadius: radius.pill },
  progressFill: { height: 4, backgroundColor: color.primary, borderRadius: radius.pill },
  reportTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  reportAvatar: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: color.beflySoft, borderWidth: 3, borderColor: color.warning },
  topEndButton: { minWidth: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.danger, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  topEndButtonText: { color: color.accentInk, fontSize: 13, fontWeight: "800" },
  dockAuxButton: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: color.callRaised, alignItems: "center", justifyContent: "center" },
  confirmActions: { flexDirection: "row", gap: space.sm },
  confirmSecondary: { flex: 1, minHeight: 56, borderRadius: radius.md, backgroundColor: color.callRaised, borderWidth: 1, borderColor: color.lineInverse, alignItems: "center", justifyContent: "center" },
  confirmSecondaryText: { color: color.inkInverse, fontSize: 15, fontWeight: "800" },
  confirmPrimary: { flex: 1, minHeight: 56, borderRadius: radius.md, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  confirmPrimaryText: { color: color.accentInk, fontSize: 15, fontWeight: "800" },
  idleNotice: { gap: 8, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16 },
  idleTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  idleFill: { height: 4, borderRadius: 2 },
  idleNoticeTitle: { color: color.inkInverse, fontSize: 15, fontWeight: "700" },
  idleNoticeBody: { color: color.mutedInverse, fontSize: 14, lineHeight: 21 },
  emptyHistory: { alignItems: "center", padding: space.lg, gap: space.sm },
  emptyHistoryAvatar: { width: 96, height: 96 },
  emptyHistoryTitle: { color: color.ink, fontSize: 16, fontWeight: "800" },
  emptyHistoryBody: { color: color.muted, fontSize: 13, textAlign: "center" },
  reviewFeedbackCard: { borderRadius: 24, padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  reviewFeedbackCorrect: { backgroundColor: color.successSoft },
  reviewFeedbackRetry: { backgroundColor: color.callHintLight },
  reviewFeedbackAvatar: { width: 68, height: 68, borderRadius: radius.pill },
  reviewFeedbackTitle: { flexShrink: 1, color: color.ink, fontSize: 18, fontWeight: "700" },
  reviewFeedbackCaption: { color: color.muted, fontSize: 13 },
  reviewFeedbackAnswer: { color: color.ink, fontFamily: font.englishBold, fontSize: 20, lineHeight: 26 },
  callTopbarCompact: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm },
  dialogueContentCompact: { padding: space.md, gap: space.md },
  questionCardCompact: { padding: space.md, gap: space.sm },
  questionEnglishCompact: { fontSize: 21, lineHeight: 27 },
  promptBlockCompact: { padding: space.md, minHeight: 136 },
  promptTextCompact: { fontSize: 23, lineHeight: 31 },
  callDockCompact: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md },
  voiceButtonCompact: { width: 68, height: 68 },
});

const lightCallStyles = StyleSheet.create({
  surface: { backgroundColor: color.paper },
  raisedSurface: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  strongText: { color: color.ink },
  mutedText: { color: color.muted },
  primaryText: { color: color.primaryStrong },
  topBorder: { borderTopColor: color.line },
  bottomBorder: { borderBottomColor: color.line },
  utilityButton: { backgroundColor: color.surface, borderColor: color.line },
  appearanceToggle: { backgroundColor: color.surface, borderColor: color.line },
  declineButton: { backgroundColor: "#E9E3D9" },
  hintPanel: { backgroundColor: color.callHintLight, borderColor: color.warning },
  hintLabel: { color: color.warningInk },
  choiceActive: { backgroundColor: color.primarySoft, borderColor: color.primary },
  dock: { backgroundColor: color.surface, borderTopColor: color.line },
  modeSwitch: { backgroundColor: color.surfaceMuted },
  voiceButton: { backgroundColor: color.primary },
  voiceButtonText: { color: color.accentInk },
  textInput: { backgroundColor: color.surface, borderColor: color.line, color: color.ink },
});

const darkAppStyles = StyleSheet.create({
  surface: { backgroundColor: color.call },
  card: { backgroundColor: color.callRaised, borderColor: color.lineInverse },
  mutedCard: { backgroundColor: color.callPulseOuter },
  activeChip: { backgroundColor: color.inkInverse },
  activeChipText: { color: color.call },
  utilityButton: { backgroundColor: color.callRaised, borderColor: color.lineInverse },
  strongText: { color: color.inkInverse },
  mutedText: { color: color.mutedInverse },
  accentText: { color: color.actionInkDark },
  beflyRing: { borderColor: color.beflyDark },
  progressTrack: { backgroundColor: color.lineInverse },
  progressFill: { backgroundColor: color.actionDark },
  topBorder: { borderTopColor: color.lineInverse },
  bottomBorder: { borderBottomColor: color.lineInverse },
});
