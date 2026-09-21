/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
import { StatusBar } from "expo-status-bar";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type {
  CallHistoryEntry,
  CallReport,
  ConversationChoice,
  InputMode,
  TeacherScheduleSettings,
} from "@yoon-call/shared";

import {
  type CallReviewSnapshot,
  previewCallReviewRepository,
} from "./src/callReviewRepository";
import { color, font, radius, space } from "./src/theme";
import {
  type FinishReason,
  type VoiceState,
  useCallSession,
} from "./src/useCallSession";
import { useCallReviewData } from "./src/useCallReviewData";

export default function App() {
  const { data, error, reload } = useCallReviewData(
    previewCallReviewRepository,
  );

  if (!data) {
    return <BootstrapScreen error={error} onRetry={reload} />;
  }

  return <CallReviewApp data={data} />;
}

function CallReviewApp({ data }: { data: CallReviewSnapshot }) {
  const session = useCallSession(data.plan);

  return (
    <View
      style={[styles.appRoot, session.isCallSurface && styles.appRootCall]}
    >
      <SafeAreaView
        style={[
          styles.safe,
          Platform.OS === "web" && styles.safeWeb,
          session.isCallSurface && styles.safeCall,
        ]}
      >
        <StatusBar style={session.isCallSurface ? "light" : "dark"} />
        {session.phase === "home" && (
          session.homeSection === "home" ? (
            <HomeScreen
              scheduledAtLabel={data.plan.scheduledAtLabel}
              onOpenMyPage={session.openMyPage}
              onStart={session.showIncomingCall}
            />
          ) : (
            <MyPageScreen
              history={data.history}
              schedule={data.schedule}
              onBack={session.closeMyPage}
            />
          )
        )}
        {session.phase === "incoming" && (
          <IncomingScreen
            onAnswer={session.answerIncomingCall}
            onDecline={session.declineIncomingCall}
          />
        )}
        {session.phase === "connecting" && <ConnectingScreen />}
        {(session.phase === "review" || session.phase === "free-talk") &&
          session.target && (
          <CallScreen
            phase={session.phase}
            progressLabel={session.progressLabel}
            coachLine={session.coachLine}
            promptKo={session.target.promptKo}
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
            onChooseAnswer={session.chooseAnswer}
            onToggleChoiceAssist={session.toggleChoiceAssist}
            onEnd={session.endCall}
            idleStopSeconds={data.plan.freeTalk.idleStopSeconds}
          />
        )}
        {session.phase === "complete" && (
          <ReportScreen
            finishReason={session.finishReason}
            report={data.report}
            onDone={session.resetCall}
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
  scheduledAtLabel,
  onOpenMyPage,
  onStart,
}: {
  scheduledAtLabel: string;
  onOpenMyPage: () => void;
  onStart: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.homeContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.brandEyebrow}>윤선생 AI 전화관리</Text>
          <Text style={styles.homeTitle}>오늘도 짧게, 확실하게.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="마이페이지 열기"
          onPress={onOpenMyPage}
          style={({ pressed }) => [
            styles.myButton,
            pressed && styles.utilityPressed,
          ]}
        >
          <Text style={styles.myButtonText}>마이</Text>
        </Pressable>
      </View>

      <View style={styles.nextCallCard}>
        <View style={styles.nextCallTop}>
          <Text style={styles.cardLabel}>다음 관리 전화</Text>
          <View style={styles.readyBadge}>
            <Text style={styles.readyBadgeText}>준비됨</Text>
          </View>
        </View>
        <Text style={styles.nextCallTime}>{scheduledAtLabel}</Text>
        <Text style={styles.nextCallDescription}>
          지난 학습에서 놓친 표현 3개와 짧은 대화를 준비했어.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onStart}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>지금 전화받기</Text>
          <Text style={styles.primaryButtonIcon}>›</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>오늘 통화에서 할 일</Text>
      <View style={styles.planList}>
        <PlanRow number="1" title="취약 표현 복습" meta="3개" />
        <PlanRow number="2" title="문장으로 다시 말하기" meta="약 3분" />
        <PlanRow number="3" title="배운 표현으로 짧은 대화" meta="약 1분" />
      </View>

      <View style={styles.accessCard}>
        <Text style={styles.accessTitle}>말하기 어려운 상황이어도 괜찮아</Text>
        <Text style={styles.accessBody}>
          통화 중 언제든 텍스트 입력으로 바꾸고 자막을 보면서 학습할 수 있어.
        </Text>
      </View>
    </ScrollView>
  );
}

function MyPageScreen({
  history,
  schedule,
  onBack,
}: {
  history: CallHistoryEntry[];
  schedule: TeacherScheduleSettings;
  onBack: () => void;
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
            pressed && styles.utilityPressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={styles.myPageHeadingCopy}>
          <Text style={styles.brandEyebrow}>마이페이지</Text>
          <Text style={styles.myPageTitle}>내 전화관리</Text>
        </View>
      </View>

      <View style={styles.profileStrip}>
        <View style={styles.avatarSmall} accessibilityLabel="학습자 계정">
          <Text style={styles.avatarText}>나</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileTitle}>학습자 계정</Text>
          <Text style={styles.profileMeta}>이번 주 전화관리 1회 완료</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>전화 일정</Text>
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleTopline}>
          <Text style={styles.scheduleLabel}>담당 교사가 설정했어요</Text>
          <View style={styles.teacherBadge}>
            <Text style={styles.teacherBadgeText}>교사 관리</Text>
          </View>
        </View>
        <Text style={styles.scheduleValue}>
          매주 {schedule.weekdays.join(" · ")}요일 {schedule.time}
        </Text>
        <Text style={styles.scheduleMeta}>
          주 {schedule.callsPerWeek}회 · {schedule.reminderMinutesBefore}분 전 알림
        </Text>
        <Text style={styles.scheduleHelp}>
          일정 변경이 필요하면 담당 교사에게 요청해 주세요.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>내 전화관리 학습이력</Text>
      <View style={styles.historyList}>
        {history.map((entry) => (
          <View key={entry.id} style={styles.historyRow}>
            <View style={styles.historyDateBlock}>
              <Text style={styles.historyDate}>{entry.completedAtLabel}</Text>
              <Text style={styles.historyResult}>{entry.resultLabel}</Text>
            </View>
            <Text style={styles.historyFocus}>{entry.focusLabel}</Text>
            <Text style={styles.historyExpressions}>
              {entry.expressions.join(" · ")}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function PlanRow({
  number,
  title,
  meta,
}: {
  number: string;
  title: string;
  meta: string;
}) {
  return (
    <View style={styles.planRow}>
      <View style={styles.planNumber}>
        <Text style={styles.planNumberText}>{number}</Text>
      </View>
      <Text style={styles.planTitle}>{title}</Text>
      <Text style={styles.planMeta}>{meta}</Text>
    </View>
  );
}

function IncomingScreen({
  onAnswer,
  onDecline,
}: {
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={styles.incomingScreen}>
      <View style={styles.incomingCopy}>
        <Text style={styles.callKicker}>윤선생 AI 전화관리</Text>
        <Text style={styles.callerName}>코코 선생님</Text>
        <Text style={styles.callMeta}>오늘의 5분 복습 전화</Text>
      </View>

      <View style={styles.pulseOuter}>
        <View style={styles.pulseMiddle}>
          <View style={styles.pulseCore}>
            <Text style={styles.pulseCoreText}>코</Text>
          </View>
        </View>
      </View>

      <View style={styles.incomingActions}>
        <CallAction label="나중에" tone="danger" onPress={onDecline} symbol="×" />
        <CallAction label="전화받기" tone="success" onPress={onAnswer} symbol="↗" />
      </View>
    </View>
  );
}

function CallAction({
  label,
  tone,
  onPress,
  symbol,
}: {
  label: string;
  tone: "danger" | "success";
  onPress: () => void;
  symbol: string;
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
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.callActionSymbol}>{symbol}</Text>
      </Pressable>
      <Text style={styles.callActionLabel}>{label}</Text>
    </View>
  );
}

function ConnectingScreen() {
  return (
    <View style={styles.connectingScreen}>
      <View style={styles.connectingDots}>
        <View style={styles.connectingDot} />
        <View style={[styles.connectingDot, styles.connectingDotDim]} />
        <View style={[styles.connectingDot, styles.connectingDotFaint]} />
      </View>
      <Text style={styles.connectingTitle}>코코 선생님과 연결 중</Text>
      <Text style={styles.connectingBody}>마이크와 오늘의 학습을 준비하고 있어.</Text>
    </View>
  );
}

type CallScreenProps = {
  phase: "review" | "free-talk";
  progressLabel: string;
  coachLine: string;
  promptKo: string;
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
  onEnd: () => void;
  idleStopSeconds: number;
};

function CallScreen(props: CallScreenProps) {
  const voiceLabel =
    props.voiceState === "idle"
      ? "말하기"
      : props.voiceState === "listening"
        ? "말한 뒤 눌러서 멈추기"
        : "확인하고 전송";
  const voiceGuide =
    props.phase === "free-talk"
      ? props.voiceState === "idle"
        ? "마이크를 누르고 영어로 대답해요"
        : props.voiceState === "listening"
          ? "영어로 말한 뒤 눌러서 멈춰요"
          : "내 영어 답변을 확인하고 전송해요"
      : voiceLabel;

  return (
    <KeyboardAvoidingView
      style={styles.callScreen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.callTopbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="힌트"
          onPress={props.onToggleHint}
          style={({ pressed }) => [styles.utilityButton, pressed && styles.utilityPressed]}
        >
          <Text style={styles.utilitySymbol}>?</Text>
        </Pressable>
        <View style={styles.callIdentity}>
          <Text style={styles.callTimer}>04:36</Text>
          <Text style={styles.callName}>코코 선생님</Text>
          <Text style={styles.callProgress}>{props.progressLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: props.captionsOn }}
          accessibilityLabel="한국어 뜻"
          onPress={props.onToggleCaptions}
          style={({ pressed }) => [styles.utilityButton, pressed && styles.utilityPressed]}
        >
          <Text style={styles.utilityCaption}>가</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.dialogueScroll}
        contentContainerStyle={styles.dialogueContent}
        showsVerticalScrollIndicator={false}
      >
        {props.previousReply ? (
          <View style={styles.learnerBubble}>
            <Text style={styles.learnerLabel}>나</Text>
            <Text style={styles.learnerText}>{props.previousReply}</Text>
          </View>
        ) : null}

        {props.phase === "free-talk" ? (
          <View style={styles.questionCard}>
            <View style={styles.questionHeader}>
              <View style={styles.questionAvatar}>
                <Text style={styles.questionAvatarText}>코</Text>
              </View>
              <View style={styles.questionHeaderCopy}>
                <Text style={styles.questionSpeaker}>코코의 질문</Text>
                <Text style={styles.questionMode}>영어로 듣고 영어로 답해요</Text>
              </View>
            </View>
            <Text style={styles.questionEnglish}>{props.coachLine}</Text>
            {props.captionsOn && props.questionMeaningKo ? (
              <View style={styles.questionMeaning}>
                <Text style={styles.questionMeaningLabel}>한국어 뜻</Text>
                <Text style={styles.questionMeaningText}>
                  {props.questionMeaningKo}
                </Text>
              </View>
            ) : null}
          </View>
        ) : props.captionsOn ? (
          <View style={styles.coachBubble}>
            <Text style={styles.speakerLabel}>코코</Text>
            <Text style={styles.coachText}>{props.coachLine}</Text>
          </View>
        ) : null}

        {props.phase === "free-talk" ? (
          <View style={styles.replyCue}>
            <View style={styles.replyCueMarker}>
              <Text style={styles.replyCueMarkerText}>나</Text>
            </View>
            <View style={styles.replyCueCopy}>
              <Text style={styles.replyCueTitle}>이제 영어로 대답해요</Text>
              <Text style={styles.replyCueBody}>
                짧게 답해도 괜찮아요. 아래 마이크를 누르고 말해 보세요.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.promptBlock}>
            <Text style={styles.promptKicker}>영어로 말해봐</Text>
            <Text style={styles.promptText}>{props.promptKo}</Text>
          </View>
        )}

        {props.hintOpen && (
          <View style={styles.hintPanel}>
            <Text style={styles.hintLabel}>힌트</Text>
            <Text style={styles.hintText}>{props.hint}</Text>
          </View>
        )}

        {props.phase === "free-talk" ? (
          <View style={styles.choiceBlock}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: props.choiceAssistOpen }}
              onPress={props.onToggleChoiceAssist}
              style={({ pressed }) => [
                styles.choiceAssistButton,
                props.choiceAssistOpen && styles.choiceAssistButtonActive,
                pressed && styles.choiceButtonPressed,
              ]}
            >
              <Text style={styles.choiceAssistButtonText}>
                {props.choiceAssistOpen ? "선택 답변 닫기" : "대답이 어려워"}
              </Text>
            </Pressable>

            {props.choiceAssistOpen && props.choiceOptions.length > 0 ? (
              <>
                <Text style={styles.choiceTitle}>화면에서 답을 골라도 돼</Text>
                <View style={styles.choiceList}>
                  {props.choiceOptions.map((choice) => (
                    <Pressable
                      accessibilityRole="button"
                      key={choice.id}
                      onPress={() => props.onChooseAnswer(choice.answerEn)}
                      style={({ pressed }) => [
                        styles.choiceButton,
                        pressed && styles.choiceButtonPressed,
                      ]}
                    >
                      <Text style={styles.choiceAnswer}>{choice.answerEn}</Text>
                      <Text style={styles.choiceMeaning}>{choice.meaningKo}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.stopTalkRow}>
              <Pressable
                accessibilityRole="button"
                onPress={props.onEnd}
                style={({ pressed }) => [
                  styles.stopTalkButton,
                  pressed && styles.utilityPressed,
                ]}
              >
                <Text style={styles.stopTalkButtonText}>오늘은 여기까지</Text>
              </Pressable>
              <Text style={styles.idleStopText}>
                {props.idleStopSeconds}초간 응답이 없으면 통화를 마쳐요.
              </Text>
            </View>
          </View>
        ) : null}

        {props.heardText ? (
          <View style={styles.heardCard}>
            <Text style={styles.heardLabel}>이렇게 들었어</Text>
            <Text style={styles.heardText}>{props.heardText}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={props.onRetryVoice}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.utilityPressed,
              ]}
            >
              <Text style={styles.retryButtonText}>다시 말하기</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.callDock}>
        <View style={styles.modeSwitch}>
          <Pressable
            accessibilityRole="button"
            onPress={() => props.onChangeMode("voice")}
            style={[
              styles.modeButton,
              props.inputMode === "voice" && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                props.inputMode === "voice" && styles.modeButtonTextActive,
              ]}
            >
              음성
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => props.onChangeMode("text")}
            style={[
              styles.modeButton,
              props.inputMode === "text" && styles.modeButtonActive,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                props.inputMode === "text" && styles.modeButtonTextActive,
              ]}
            >
              텍스트
            </Text>
          </Pressable>
        </View>

        {props.inputMode === "voice" ? (
          <View style={styles.voiceDock}>
            <Signal active={props.voiceState === "listening"} />
            <View style={styles.voiceActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="통화 종료"
                onPress={props.onEnd}
                style={({ pressed }) => [
                  styles.endButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.endButtonText}>×</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={voiceGuide}
                onPress={props.onVoiceAction}
                style={({ pressed }) => [
                  styles.voiceButton,
                  props.voiceState === "listening" && styles.voiceButtonListening,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.voiceButtonText}>
                  {props.voiceState === "listening" ? "■" : "↑"}
                </Text>
              </Pressable>
              <View style={styles.endButtonPlaceholder} />
            </View>
            <Text style={styles.voiceGuide}>{voiceGuide}</Text>
          </View>
        ) : (
          <View style={styles.textDockWrap}>
            <Text style={styles.textDockLabel}>
              {props.phase === "free-talk" ? "영어 답변" : "영어로 입력하기"}
            </Text>
            <View style={styles.textDock}>
              <TextInput
                accessibilityLabel="영어 답변 입력"
                autoCapitalize="sentences"
                autoCorrect={false}
                onChangeText={props.onChangeText}
                onSubmitEditing={props.onSubmitText}
                placeholder="영어로 대답을 입력해요"
                placeholderTextColor={color.mutedInverse}
                returnKeyType="send"
                style={styles.textInput}
                value={props.typedText}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="영어 답변 전송"
                disabled={!props.typedText.trim()}
                onPress={props.onSubmitText}
                style={({ pressed }) => [
                  styles.sendButton,
                  !props.typedText.trim() && styles.sendButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.sendButtonText}>↑</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Signal({ active }: { active: boolean }) {
  const levels = [7, 12, 18, 10, 22, 30, 16, 26, 12, 8, 14, 20, 9];
  return (
    <View style={styles.signal} accessibilityLabel={active ? "음성 듣는 중" : "대기 중"}>
      {levels.map((height, index) => (
        <View
          key={`${height}-${index}`}
          style={[
            styles.signalBar,
            { height: active ? height : Math.min(height, 8) },
            active && styles.signalBarActive,
          ]}
        />
      ))}
    </View>
  );
}

function ReportScreen({
  finishReason,
  report,
  onDone,
}: {
  finishReason: FinishReason;
  report: CallReport;
  onDone: () => void;
}) {
  const reportCopy =
    finishReason === "no-response"
      ? {
          kicker: "응답이 없어 통화를 마쳤어",
          title: "오늘은 여기까지,\n다음에 다시 이어가자.",
        }
      : finishReason === "stopped"
        ? {
            kicker: "원할 때 통화를 마칠 수 있어",
            title: "오늘 말한 만큼만\n학습이력에 남겼어.",
          }
        : {
            kicker: "오늘의 관리 전화 완료",
            title: "짧게 말했지만,\n배운 건 분명해.",
          };

  return (
    <ScrollView contentContainerStyle={styles.reportContent}>
      <Text style={styles.reportKicker}>{reportCopy.kicker}</Text>
      <Text style={styles.reportTitle}>{reportCopy.title}</Text>

      <View style={styles.reportSummary}>
        <View style={styles.reportScore}>
          <Text style={styles.reportScoreValue}>{report.reviewedCount}</Text>
          <Text style={styles.reportScoreLabel}>복습한 표현</Text>
        </View>
        <View style={styles.reportDivider} />
        <View style={styles.reportScore}>
          <Text style={styles.reportScoreValue}>{report.needsReviewCount}</Text>
          <Text style={styles.reportScoreLabel}>다음에 다시</Text>
        </View>
      </View>

      <View style={styles.commentCard}>
        <Text style={styles.commentLabel}>코코의 한마디</Text>
        <Text style={styles.commentText}>{report.coachComment}</Text>
      </View>

      <Text style={styles.sectionTitle}>오늘 사용한 표현</Text>
      <View style={styles.expressionList}>
        {report.expressions.map((expression, index) => (
          <View key={expression} style={styles.expressionRow}>
            <Text style={styles.expressionNumber}>{index + 1}</Text>
            <Text style={styles.expressionText}>{expression}</Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.primaryButtonText}>확인</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  homeContent: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  homeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.sm },
  brandEyebrow: { color: color.primaryStrong, fontFamily: font.display, fontSize: 14, fontWeight: "700" },
  homeTitle: { color: color.ink, fontFamily: font.display, fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginTop: space.xs },
  myButton: { minWidth: 52, height: 44, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md },
  myButtonText: { color: color.primaryStrong, fontSize: 14, fontWeight: "800" },
  avatarSmall: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: color.primaryStrong, fontSize: 18, fontWeight: "800" },
  nextCallCard: { backgroundColor: color.call, borderRadius: radius.lg, padding: space.lg, gap: space.md, shadowColor: color.shadow, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  nextCallTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { color: color.mutedInverse, fontSize: 13, fontWeight: "700" },
  readyBadge: { backgroundColor: color.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  readyBadgeText: { color: color.accentInk, fontSize: 12, fontWeight: "800" },
  nextCallTime: { color: color.inkInverse, fontFamily: font.display, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  nextCallDescription: { color: color.mutedInverse, fontSize: 15, lineHeight: 23 },
  primaryButton: { minHeight: 56, borderRadius: radius.md, paddingHorizontal: space.lg, backgroundColor: color.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  primaryButtonText: { color: color.accentInk, fontSize: 17, fontWeight: "800" },
  primaryButtonIcon: { color: color.accentInk, fontSize: 28, lineHeight: 28, marginTop: -2 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  sectionTitle: { color: color.ink, fontFamily: font.display, fontSize: 20, fontWeight: "800", marginTop: space.sm },
  planList: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, overflow: "hidden" },
  planRow: { minHeight: 68, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  planNumber: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center", marginRight: space.md },
  planNumberText: { color: color.primaryStrong, fontWeight: "800" },
  planTitle: { color: color.ink, fontSize: 15, fontWeight: "700", flex: 1 },
  planMeta: { color: color.muted, fontSize: 13 },
  accessCard: { backgroundColor: color.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  accessTitle: { color: color.primaryStrong, fontSize: 16, fontWeight: "800" },
  accessBody: { color: color.ink, fontSize: 14, lineHeight: 21 },
  myPageContent: { padding: space.lg, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.lg },
  myPageHeader: { flexDirection: "row", alignItems: "center", gap: space.md },
  myPageHeadingCopy: { flex: 1 },
  myPageTitle: { color: color.ink, fontFamily: font.display, fontSize: 30, fontWeight: "800", letterSpacing: -0.8, marginTop: space.xs },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceMuted },
  backButtonText: { color: color.ink, fontSize: 32, lineHeight: 34, fontWeight: "600" },
  profileStrip: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  profileCopy: { flex: 1, gap: space.xs },
  profileTitle: { color: color.ink, fontSize: 17, fontWeight: "800" },
  profileMeta: { color: color.muted, fontSize: 14 },
  scheduleCard: { backgroundColor: color.call, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  scheduleTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  scheduleLabel: { color: color.mutedInverse, fontSize: 13, fontWeight: "700", flex: 1 },
  teacherBadge: { backgroundColor: color.primarySoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: space.xs },
  teacherBadgeText: { color: color.primaryStrong, fontSize: 11, fontWeight: "800" },
  scheduleValue: { color: color.inkInverse, fontFamily: font.display, fontSize: 23, lineHeight: 31, fontWeight: "800" },
  scheduleMeta: { color: color.primarySoft, fontSize: 14, fontWeight: "700" },
  scheduleHelp: { color: color.mutedInverse, fontSize: 13, lineHeight: 20, marginTop: space.xs },
  historyList: { backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.line, overflow: "hidden" },
  historyRow: { minHeight: 108, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, gap: space.sm },
  historyDateBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  historyDate: { color: color.muted, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "700" },
  historyResult: { color: color.primaryStrong, fontSize: 12, fontWeight: "800" },
  historyFocus: { color: color.ink, fontSize: 16, fontWeight: "800" },
  historyExpressions: { color: color.muted, fontSize: 13, lineHeight: 20 },
  incomingScreen: { flex: 1, padding: space.lg, alignItems: "center", justifyContent: "space-between" },
  incomingCopy: { alignItems: "center", gap: space.sm, marginTop: space.xl },
  callKicker: { color: color.mutedInverse, fontSize: 13, fontWeight: "700" },
  callerName: { color: color.inkInverse, fontFamily: font.display, fontSize: 34, fontWeight: "800", letterSpacing: -0.7 },
  callMeta: { color: color.mutedInverse, fontSize: 15 },
  pulseOuter: { width: 250, height: 250, borderRadius: radius.pill, backgroundColor: color.callPulseOuter, alignItems: "center", justifyContent: "center" },
  pulseMiddle: { width: 188, height: 188, borderRadius: radius.pill, backgroundColor: color.callPulseMiddle, alignItems: "center", justifyContent: "center" },
  pulseCore: { width: 126, height: 126, borderRadius: radius.pill, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  pulseCoreText: { color: color.accentInk, fontSize: 40, fontWeight: "800" },
  incomingActions: { width: "100%", flexDirection: "row", justifyContent: "space-around", marginBottom: space.xl },
  callActionWrap: { alignItems: "center", gap: space.sm },
  callAction: { width: 76, height: 76, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  callActionDanger: { backgroundColor: color.danger },
  callActionSuccess: { backgroundColor: color.success },
  callActionSymbol: { color: color.accentInk, fontSize: 34, fontWeight: "700" },
  callActionLabel: { color: color.inkInverse, fontSize: 14, fontWeight: "700" },
  connectingScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  connectingDots: { flexDirection: "row", gap: space.sm, marginBottom: space.xl },
  connectingDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: color.primary },
  connectingDotDim: { opacity: 0.58 },
  connectingDotFaint: { opacity: 0.28 },
  connectingTitle: { color: color.inkInverse, fontSize: 24, fontWeight: "800" },
  connectingBody: { color: color.mutedInverse, fontSize: 15, marginTop: space.sm },
  callScreen: { flex: 1, backgroundColor: color.call },
  callTopbar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: space.md, paddingTop: space.sm },
  utilityButton: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.callRaised, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.lineInverse },
  utilityPressed: { opacity: 0.65 },
  utilitySymbol: { color: color.inkInverse, fontSize: 22, fontWeight: "800" },
  utilityCaption: { color: color.inkInverse, fontSize: 17, fontWeight: "800" },
  callIdentity: { alignItems: "center", gap: 2 },
  callTimer: { color: color.mutedInverse, fontSize: 13, fontVariant: ["tabular-nums"] },
  callName: { color: color.inkInverse, fontSize: 21, fontWeight: "800" },
  callProgress: { color: color.primarySoft, fontSize: 12, fontWeight: "700" },
  dialogueScroll: { flex: 1 },
  dialogueContent: { padding: space.lg, paddingTop: space.xl, gap: space.lg },
  learnerBubble: { alignSelf: "flex-end", maxWidth: "88%", backgroundColor: color.primary, borderRadius: radius.md, padding: space.md, gap: space.xs },
  learnerLabel: { color: color.primarySoft, fontSize: 11, fontWeight: "800" },
  learnerText: { color: color.accentInk, fontSize: 16, lineHeight: 23, fontWeight: "700" },
  coachBubble: { gap: space.sm },
  speakerLabel: { color: color.primarySoft, fontSize: 12, fontWeight: "800" },
  coachText: { color: color.inkInverse, fontSize: 18, lineHeight: 28, fontWeight: "600" },
  questionCard: { backgroundColor: color.callRaised, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: color.lineInverse, gap: space.md },
  questionHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  questionAvatar: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  questionAvatarText: { color: color.accentInk, fontSize: 16, fontWeight: "800" },
  questionHeaderCopy: { flex: 1, gap: 2 },
  questionSpeaker: { color: color.inkInverse, fontSize: 14, fontWeight: "800" },
  questionMode: { color: color.mutedInverse, fontSize: 12, lineHeight: 18 },
  questionEnglish: { color: color.inkInverse, fontSize: 25, lineHeight: 35, fontWeight: "800", letterSpacing: -0.4 },
  questionMeaning: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineInverse, paddingTop: space.md, gap: space.xs },
  questionMeaningLabel: { color: color.primarySoft, fontSize: 12, fontWeight: "800" },
  questionMeaningText: { color: color.mutedInverse, fontSize: 16, lineHeight: 24, fontWeight: "600" },
  replyCue: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.xs },
  replyCueMarker: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.primarySoft, alignItems: "center", justifyContent: "center" },
  replyCueMarkerText: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  replyCueCopy: { flex: 1, gap: space.xs },
  replyCueTitle: { color: color.inkInverse, fontSize: 17, lineHeight: 24, fontWeight: "800" },
  replyCueBody: { color: color.mutedInverse, fontSize: 14, lineHeight: 21 },
  promptBlock: { backgroundColor: color.callRaised, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: color.lineInverse, gap: space.sm },
  promptKicker: { color: color.mutedInverse, fontSize: 12, fontWeight: "700" },
  promptText: { color: color.inkInverse, fontSize: 25, lineHeight: 35, fontWeight: "800", letterSpacing: -0.5 },
  hintPanel: { backgroundColor: color.callHint, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: color.warning, gap: space.xs },
  hintLabel: { color: color.warning, fontSize: 12, fontWeight: "800" },
  hintText: { color: color.inkInverse, fontSize: 15, lineHeight: 22 },
  choiceBlock: { gap: space.sm },
  choiceAssistButton: { minHeight: 48, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.callRaised, borderWidth: 1, borderColor: color.lineInverse },
  choiceAssistButtonActive: { backgroundColor: color.callHint, borderColor: color.primary },
  choiceAssistButtonText: { color: color.inkInverse, fontSize: 13, fontWeight: "800" },
  choiceTitle: { color: color.mutedInverse, fontSize: 13, fontWeight: "800" },
  choiceList: { gap: space.sm },
  choiceButton: { minHeight: 58, backgroundColor: color.callRaised, borderRadius: radius.md, borderWidth: 1, borderColor: color.lineInverse, paddingHorizontal: space.md, paddingVertical: space.sm, justifyContent: "center", gap: space.xs },
  choiceButtonPressed: { backgroundColor: color.callHint, transform: [{ scale: 0.99 }] },
  choiceAnswer: { color: color.inkInverse, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  choiceMeaning: { color: color.mutedInverse, fontSize: 12, lineHeight: 18 },
  stopTalkRow: { alignItems: "flex-start", gap: space.xs },
  stopTalkButton: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: space.sm },
  stopTalkButtonText: { color: color.mutedInverse, fontSize: 13, fontWeight: "700", textDecorationLine: "underline" },
  idleStopText: { color: color.mutedInverse, fontSize: 11, lineHeight: 17, paddingHorizontal: space.sm },
  heardCard: { backgroundColor: color.primarySoft, borderRadius: radius.md, padding: space.md, gap: space.sm },
  heardLabel: { color: color.primaryStrong, fontSize: 12, fontWeight: "800" },
  heardText: { color: color.ink, fontSize: 18, fontWeight: "700" },
  retryButton: { alignSelf: "flex-start", paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.surface },
  retryButtonText: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  callDock: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineInverse, backgroundColor: color.call },
  modeSwitch: { alignSelf: "center", flexDirection: "row", backgroundColor: color.callRaised, borderRadius: radius.pill, padding: 4, marginBottom: space.sm },
  modeButton: { minWidth: 76, minHeight: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  modeButtonActive: { backgroundColor: color.primary },
  modeButtonText: { color: color.mutedInverse, fontSize: 13, fontWeight: "800" },
  modeButtonTextActive: { color: color.accentInk },
  voiceDock: { alignItems: "center" },
  signal: { height: 34, flexDirection: "row", alignItems: "center", gap: 4, marginBottom: space.sm },
  signalBar: { width: 3, borderRadius: radius.pill, backgroundColor: color.lineInverse },
  signalBarActive: { backgroundColor: color.primarySoft },
  voiceActions: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  endButton: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: color.danger, alignItems: "center", justifyContent: "center" },
  endButtonText: { color: color.accentInk, fontSize: 30, lineHeight: 32 },
  endButtonPlaceholder: { width: 54, height: 54 },
  voiceButton: { width: 80, height: 80, borderRadius: radius.pill, backgroundColor: color.inkInverse, alignItems: "center", justifyContent: "center" },
  voiceButtonListening: { backgroundColor: color.primarySoft, borderWidth: 6, borderColor: color.primary },
  voiceButtonText: { color: color.call, fontSize: 34, fontWeight: "800" },
  voiceGuide: { color: color.mutedInverse, fontSize: 12, marginTop: space.sm },
  textDockWrap: { gap: space.xs },
  textDockLabel: { color: color.primarySoft, fontSize: 12, fontWeight: "800", paddingHorizontal: space.xs },
  textDock: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space.sm },
  textInput: { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: color.callRaised, borderWidth: 1, borderColor: color.lineInverse, paddingHorizontal: space.md, color: color.inkInverse, fontSize: 16 },
  sendButton: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.35 },
  sendButtonText: { color: color.accentInk, fontSize: 26, fontWeight: "800" },
  reportContent: { padding: space.lg, paddingTop: space.xl, paddingBottom: space.xxl, gap: space.lg },
  reportKicker: { color: color.primaryStrong, fontSize: 13, fontWeight: "800" },
  reportTitle: { color: color.ink, fontFamily: font.display, fontSize: 32, lineHeight: 41, fontWeight: "800", letterSpacing: -0.8 },
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
});
