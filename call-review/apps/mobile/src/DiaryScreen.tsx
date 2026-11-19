// 영어 한 줄 일기. 일기장(오늘·지난 일기, 선생님 댓글) → 쓰기(한글이나 영어로 글·말, 사진, 기분) →
// 추천 문장 고르기(쉬움·보통·도전) → 듣고 따라 말하기 → 저장. 일기는 담당 선생님도 본다.
// 사진은 기기에서 줄여 문장 추천 요청에만 보내고, 기기에 남은 사본은 바로 지운다(서버도 저장하지 않음).
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Vibration,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import {
  containsBadWords,
  DIARY_LEVEL_LABELS,
  DIARY_MOODS,
  type DiaryEntry,
  type DiaryMood,
  repeatMatch,
  type RepeatResult,
} from "@yoon-call/shared";

import { ApiError, type DiarySavePayload, type DiarySuggestBody, type DiarySuggestion } from "./callReviewApi";
import { befly } from "./befly";
import { Icon } from "./icons";
import { color, font, radius, space } from "./theme";
import { MicUnavailableError, prefetchSpeech, type RemoteSpeechSource, speak, stopSpeaking, type VoiceCapture } from "./voice";

export type DiaryServices = {
  suggest?: (body: DiarySuggestBody) => Promise<DiarySuggestion[]>;
  save?: (payload: DiarySavePayload) => Promise<DiaryEntry>;
  readComment?: (id: string) => Promise<DiaryEntry>;
  transcribe?: (uri: string, language: "en" | "ko") => Promise<string>;
  capture: VoiceCapture;
  speechSource?: RemoteSpeechSource;
};

type Step = "book" | "write" | "choose" | "practice" | "done";
type VoiceState = "idle" | "listening" | "transcribing";
type PickedPhoto = { base64: string; previewUri: string };

const MAX_NOTE = 100;
const PHOTO_MAX_SIDE = 1024;
const BAD_NOTE_MESSAGE = "앗, 그런 말은 일기에 쓰지 않아요. 바르고 고운 말로 다시 써 볼까요?";
const MIC_MESSAGE = "마이크를 쓸 수 없어요. 앱 설정에서 마이크를 허용해 주세요.";
// 따라 말하기를 이만큼 해 보면 통과하지 못해도 저장할 수 있다.
const SAVE_ANYWAY_AFTER = 2;

const PRAISES = ["Great job!", "Wonderful!", "Excellent!", "Very good!", "Perfect!"];
// 통과했지만 빠진 단어가 있을 때(완벽하다고 하지 않는다).
const ALMOST_PRAISES = ["Good job! Almost perfect!", "Nice! Almost perfect!"];

function todayKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const weekday = "일월화수목금토"[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일 ${weekday}요일`;
}

// 대소문자·문장부호를 뺀 비교용 문장(내가 쓴 영어와 고친 문장이 같은지 볼 때).
function sentenceKey(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function moodOf(key: DiaryMood | null) {
  return DIARY_MOODS.find((mood) => mood.key === key) ?? null;
}

// 앱 캐시 폴더 안의 사본만 지운다(사진첩 원본은 절대 건드리지 않는다).
function deleteCachedCopy(uri: string) {
  if (Platform.OS === "web") return;
  try {
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 지우지 못한 캐시는 기기가 정리한다.
  }
}

async function preparePhoto(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const resize =
    Math.max(width, height) > PHOTO_MAX_SIDE ? [{ resize: width >= height ? { width: PHOTO_MAX_SIDE } : { height: PHOTO_MAX_SIDE } }] : [];
  const result = await manipulateAsync(asset.uri, resize, { compress: 0.6, format: SaveFormat.JPEG, base64: true });
  deleteCachedCopy(asset.uri);
  deleteCachedCopy(result.uri);
  if (!result.base64) throw new Error("photo");
  return { base64: result.base64, previewUri: `data:image/jpeg;base64,${result.base64}` };
}

type Palette = {
  page: string;
  card: string;
  soft: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
  // 녹음 중 표시(빨강).
  rec: string;
  recSoft: string;
  recInk: string;
};

const LIGHT: Palette = {
  page: color.paper,
  card: color.surface,
  soft: color.surfaceMuted,
  ink: color.ink,
  muted: color.muted,
  accent: color.primaryStrong,
  accentSoft: color.primarySoft,
  line: color.line,
  rec: color.danger,
  recSoft: "#FDECEC",
  recInk: "#9F1F1F",
};

const DARK: Palette = {
  page: color.call,
  card: color.callRaised,
  soft: color.callPulseOuter,
  ink: color.inkInverse,
  muted: color.mutedInverse,
  accent: color.actionInkDark,
  accentSoft: color.actionSoftDark,
  line: color.lineInverse,
  rec: "#F06464",
  recSoft: "#3A1D20",
  recInk: "#FFB4B4",
};

function TypingDots({ tint }: { tint: string }) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - index) * 160),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);
  return (
    <View style={styles.dots} accessible={false}>
      {values.map((value, index) => (
        <Animated.View key={index} style={[styles.dot, { backgroundColor: tint, opacity: value }]} />
      ))}
    </View>
  );
}

// 녹음이 켜져 있음을 분명히 보여 준다: 퍼지는 빨간 점, 녹음 시간, 안내.
function RecordingIndicator({ palette, hint }: { palette: Palette; hint: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
  }, [pulse]);
  const ring = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
  };
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <View
      style={[styles.recording, { backgroundColor: palette.recSoft, borderColor: palette.rec }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`마이크가 켜졌어요. 녹음 중이에요. ${hint}`}
    >
      <View style={styles.recDotWrap}>
        <Animated.View style={[styles.recRing, { backgroundColor: palette.rec }, ring]} />
        <View style={[styles.recDot, { backgroundColor: palette.rec }]} />
      </View>
      <View style={styles.recCopy}>
        <Text style={[styles.recTitle, { color: palette.recInk }]}>마이크가 켜졌어요 · 녹음 중</Text>
        <Text style={[styles.small, { color: palette.recInk }]}>{hint}</Text>
      </View>
      <Text style={[styles.recTime, { color: palette.recInk }]}>{time}</Text>
    </View>
  );
}

// 녹음이 시작되면 짧게 진동해 알려 준다(안드로이드).
function buzzRecordingStart() {
  if (Platform.OS === "android") Vibration.vibrate(40);
}

export function DiaryScreen({
  darkMode,
  entries,
  learnedWords,
  services,
  onEntriesChange,
  onSaved,
  onBack,
}: {
  darkMode: boolean;
  entries: DiaryEntry[];
  // 최근 복습 단어(추천 문장에 자연스러우면 넣는다).
  learnedWords: string[];
  services: DiaryServices;
  onEntriesChange: (entries: DiaryEntry[]) => void;
  // 저장하면 통화 계획(다음 전화 문항)을 다시 불러온다.
  onSaved: (entry: DiaryEntry) => void;
  onBack: () => void;
}) {
  const palette = darkMode ? DARK : LIGHT;
  const [step, setStep] = useState<Step>("book");
  const [note, setNote] = useState("");
  const [noteBySpeech, setNoteBySpeech] = useState(false);
  // 한글로 쓸지 영어로 쓸지(말로 하기 언어·안내 문구). 영어로 쓰면 베플리가 고친 문장을 '내 문장'으로 보여 준다.
  const [noteLang, setNoteLang] = useState<"ko" | "en">("ko");
  const [mood, setMood] = useState<DiaryMood | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<DiarySuggestion[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState<RepeatResult | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<DiaryEntry | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const today = todayKst();
  const todayEntry = entries.find((entry) => entry.date === today) ?? null;
  const pastEntries = entries.filter((entry) => entry.date !== today);
  const choice = selected === null ? null : (suggestions[selected] ?? null);
  const canRewrite = !todayEntry?.teacherComment;
  const canSpeak = Boolean(services.transcribe);

  const play = useCallback(
    (text: string) => {
      speak(text, "en-US", () => setPlaying(text), () => setPlaying((current) => (current === text ? null : current)), services.speechSource);
    },
    [services.speechSource],
  );

  // 화면을 나가거나 단계가 바뀌면 읽기를 멈춘다.
  useEffect(() => {
    return () => {
      stopSpeaking();
      setPlaying(null);
    };
  }, [step]);

  // 연습 단계에 들어가면 고른 문장을 원어민 음성으로 바로 들려준다(위의 멈춤 뒤에 실행).
  useEffect(() => {
    if (step === "practice" && choice) play(choice.sentenceEn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 일기장을 보면 새로 달린 선생님 댓글을 읽은 것으로 남긴다.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const reading = useRef(new Set<string>());
  useEffect(() => {
    if (step !== "book" || !services.readComment) return;
    for (const entry of entries) {
      if (!entry.teacherComment || entry.commentReadAt || reading.current.has(entry.id)) continue;
      reading.current.add(entry.id);
      void services.readComment(entry.id).then(
        (next) => onEntriesChange(entriesRef.current.map((item) => (item.id === next.id ? next : item))),
        () => reading.current.delete(entry.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, step]);

  const resetDraft = () => {
    setNote("");
    setNoteBySpeech(false);
    setMood(null);
    setPhoto(null);
    setSuggestions([]);
    setSelected(null);
    setAttempts(0);
    setResult(null);
    setHeard(null);
    setError(null);
    setVoice("idle");
  };

  const goBack = useCallback(() => {
    if (voice === "listening") void services.capture.stop().catch(() => undefined);
    setVoice("idle");
    setError(null);
    switch (step) {
      case "book":
        onBack();
        break;
      case "write":
        setPhoto(null);
        setStep("book");
        break;
      case "choose":
        setStep("write");
        break;
      case "practice":
        setResult(null);
        setHeard(null);
        setStep("choose");
        break;
      case "done":
        setStep("book");
        break;
    }
  }, [onBack, services.capture, step, voice]);

  // Android 뒤로 가기: 한 단계 앞으로.
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (loading || saving) return true;
      goBackRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [loading, saving]);

  const startWriting = () => {
    resetDraft();
    setStep("write");
  };

  // ---- 쓰기: 한글·영어로 말하기 ----
  const toggleNoteVoice = async () => {
    if (!services.transcribe || voice === "transcribing") return;
    setError(null);
    if (voice === "idle") {
      try {
        stopSpeaking();
        await services.capture.start();
        buzzRecordingStart();
        setVoice("listening");
      } catch (caught) {
        setError(caught instanceof MicUnavailableError ? MIC_MESSAGE : "녹음을 시작하지 못했어요.");
      }
      return;
    }
    setVoice("transcribing");
    try {
      const uri = await services.capture.stop();
      const text = uri ? (await services.transcribe(uri, noteLang)).trim() : "";
      if (!text) setError("잘 못 들었어요. 다시 말해 볼까요?");
      else {
        setNote((current) => (current ? `${current} ${text}` : text).slice(0, MAX_NOTE));
        setNoteBySpeech(true);
      }
    } catch {
      setError("말한 내용을 알아듣지 못했어요. 글자로 써도 돼요.");
    } finally {
      setVoice("idle");
    }
  };

  // ---- 쓰기: 사진 ----
  const pickPhoto = async (from: "camera" | "library") => {
    setError(null);
    try {
      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError("카메라를 쓸 수 없어요. 앱 설정에서 카메라를 허용해 주세요.");
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
      const picked = from === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      setPhotoBusy(true);
      setPhoto(await preparePhoto(asset));
    } catch {
      setError("사진을 불러오지 못했어요. 다른 사진을 골라 주세요.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const choosePhoto = () => {
    Keyboard.dismiss();
    if (Platform.OS === "web") {
      void pickPhoto("library");
      return;
    }
    Alert.alert("사진 올리기", "사진은 영어 문장을 만드는 데만 쓰고 저장하지 않아요.", [
      { text: "사진 찍기", onPress: () => void pickPhoto("camera") },
      { text: "앨범에서 고르기", onPress: () => void pickPhoto("library") },
      { text: "취소", style: "cancel" },
    ]);
  };

  // ---- 문장 추천 ----
  const requestSuggestions = async () => {
    if (!services.suggest || loading) return;
    Keyboard.dismiss();
    const text = note.replace(/\s+/g, " ").trim();
    if (!text && !photo) return;
    if (containsBadWords(text)) {
      setError(BAD_NOTE_MESSAGE);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const next = await services.suggest({
        ...(text ? { noteKo: text } : {}),
        ...(mood ? { mood } : {}),
        ...(photo ? { photo: { data: photo.base64, mimeType: "image/jpeg" as const } } : {}),
        learnedWords: learnedWords.slice(0, 5),
      });
      for (const item of next) void prefetchSpeech(item.sentenceEn, "en-US", services.speechSource);
      setSuggestions(next);
      setSelected(null);
      setStep("choose");
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status !== 0 ? caught.message : "문장을 만들지 못했어요. 다시 한 번 해 볼까요?");
    } finally {
      setLoading(false);
    }
  };

  // ---- 듣고 따라 말하기 ----
  const startPractice = () => {
    if (!choice) return;
    setAttempts(0);
    setResult(null);
    setHeard(null);
    setError(null);
    setStep("practice");
  };

  const togglePracticeVoice = async () => {
    if (!choice || !services.transcribe || voice === "transcribing") return;
    setError(null);
    if (voice === "idle") {
      try {
        stopSpeaking();
        setPlaying(null);
        await services.capture.start();
        buzzRecordingStart();
        setVoice("listening");
      } catch (caught) {
        setError(caught instanceof MicUnavailableError ? MIC_MESSAGE : "녹음을 시작하지 못했어요.");
      }
      return;
    }
    setVoice("transcribing");
    try {
      const uri = await services.capture.stop();
      const text = uri ? (await services.transcribe(uri, "en")).trim() : "";
      if (!text) {
        setError("잘 못 들었어요. 다시 말해 볼까요?");
        return;
      }
      setHeard(text);
      setAttempts((count) => count + 1);
      const graded = repeatMatch(choice.sentenceEn, text);
      setResult(graded);
      if (graded.passed) {
        const praises = graded.words.every((word) => word.said) ? PRAISES : ALMOST_PRAISES;
        play(praises[(attempts + choice.sentenceEn.length) % praises.length]!);
      }
    } catch {
      setError("말한 내용을 알아듣지 못했어요. 다시 말해 볼까요?");
    } finally {
      setVoice("idle");
    }
  };

  const saveDiary = async () => {
    if (!choice || !services.save || saving) return;
    setSaving(true);
    setError(null);
    try {
      const text = note.replace(/\s+/g, " ").trim();
      const entry = await services.save({
        source: photo ? "photo" : noteBySpeech ? "voice" : "text",
        noteKo: text || null,
        mood,
        sentenceEn: choice.sentenceEn,
        meaningKo: choice.meaningKo,
        level: choice.level,
        usedWord: choice.usedWord,
        practice: { attempts, passed: Boolean(result?.passed), ...(heard ? { heard } : {}) },
      });
      // 저장했으면 사진은 더 들고 있지 않는다.
      setPhoto(null);
      setSaved(entry);
      onEntriesChange([entry, ...entriesRef.current.filter((item) => item.id !== entry.id)]);
      onSaved(entry);
      setStep("done");
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status !== 0 ? caught.message : "일기를 저장하지 못했어요. 다시 해 볼까요?");
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(
    () => ({ book: "영어 한 줄 일기", write: "오늘 일기 쓰기", choose: "문장 고르기", practice: "듣고 따라 말하기", done: "일기 완성" })[step],
    [step],
  );

  const ink = { color: palette.ink };
  const muted = { color: palette.muted };
  const card = { backgroundColor: palette.card, borderColor: palette.line };

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={step === "book" ? "홈으로 돌아가기" : "앞 단계로 돌아가기"}
        disabled={loading || saving}
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, { backgroundColor: palette.card, borderColor: palette.line }, pressed && styles.pressed]}
      >
        <Icon name="back" size={22} strokeWidth={2.2} color={palette.ink} />
      </Pressable>
      <Text style={[styles.title, ink]} accessibilityRole="header">
        {title}
      </Text>
      {step !== "book" && step !== "done" ? (
        <Text style={[styles.stepCount, muted]}>{{ write: "1", choose: "2", practice: "3" }[step]} / 3</Text>
      ) : null}
    </View>
  );

  const errorBox = error ? (
    <View style={[styles.errorBox, darkMode && { backgroundColor: color.callHint }]} accessibilityLiveRegion="polite">
      <Icon name="hint" size={18} color={darkMode ? color.warning : color.warningInk} />
      <Text style={[styles.errorText, darkMode && { color: color.callHintLight }]}>{error}</Text>
    </View>
  ) : null;

  // ---- 화면 ----
  if (step === "book") {
    return (
      <View style={[styles.screen, { backgroundColor: palette.page }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}
          {todayEntry ? (
            <View style={[styles.card, card]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.eyebrow, { color: palette.accent }]}>오늘의 일기</Text>
                <PracticeBadge entry={todayEntry} palette={palette} />
              </View>
              <EntryBody entry={todayEntry} palette={palette} playing={playing} onPlay={play} />
              {canRewrite ? (
                <Pressable accessibilityRole="button" onPress={startWriting} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
                  <Icon name="pencil" size={16} color={palette.accent} />
                  <Text style={[styles.linkText, { color: palette.accent }]}>오늘 일기 다시 쓰기</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={[styles.card, styles.introCard, card]}>
              <Image source={befly.home} style={styles.introAvatar} accessibilityLabel="베플리 선생님" />
              <View style={styles.introCopy}>
                <Text style={[styles.introTitle, ink]}>오늘 있었던 일을 영어 한 줄로 남겨요</Text>
                <Text style={[styles.body, muted]}>한글이나 영어로 쓰거나 말하면, 베플리가 영어 문장을 추천해 줘요.</Text>
              </View>
            </View>
          )}
          <View style={[styles.notice, { backgroundColor: palette.accentSoft }]}>
            <Icon name="person" size={16} color={palette.accent} />
            <Text style={[styles.noticeText, { color: palette.accent }]}>쓴 일기는 선생님도 함께 보고 댓글을 남겨 줘요.</Text>
          </View>

          <Text style={[styles.sectionTitle, ink]}>지난 일기</Text>
          {pastEntries.length === 0 ? (
            <View style={[styles.card, card]}>
              <Text style={[styles.body, muted]}>아직 지난 일기가 없어요. 하루 한 줄씩 모아 봐요!</Text>
            </View>
          ) : (
            pastEntries.map((entry) => (
              <View key={entry.id} style={[styles.card, card]}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.dateText, muted]}>{dateLabel(entry.date)}</Text>
                  <PracticeBadge entry={entry} palette={palette} />
                </View>
                <EntryBody entry={entry} palette={palette} playing={playing} onPlay={play} />
              </View>
            ))
          )}
        </ScrollView>
        {!todayEntry ? (
          <BottomBar palette={palette}>
            <PrimaryButton label="오늘 일기 쓰기" icon="pencil" onPress={startWriting} />
          </BottomBar>
        ) : null}
      </View>
    );
  }

  if (step === "write") {
    const ready = Boolean(note.trim() || photo);
    return (
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: palette.page }]} behavior={Platform.OS === "web" ? undefined : "padding"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {header}
          {loading ? (
            <View style={[styles.card, styles.loadingCard, card]} accessibilityLiveRegion="polite">
              <Image source={befly.home} style={styles.loadingAvatar} accessibilityLabel="베플리 선생님" />
              <TypingDots tint={palette.accent} />
              <Text style={[styles.body, ink]}>베플리가 영어 문장을 만들고 있어요</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.prompt, ink]}>오늘 어떤 일이 있었어요?</Text>
              <View style={[styles.langRow, { backgroundColor: palette.soft }]} accessibilityRole="radiogroup" accessibilityLabel="쓸 말">
                {(["ko", "en"] as const).map((lang) => {
                  const active = noteLang === lang;
                  return (
                    <Pressable
                      key={lang}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled: voice !== "idle" }}
                      disabled={voice !== "idle"}
                      onPress={() => {
                        setNoteLang(lang);
                        setError(null);
                      }}
                      style={({ pressed }) => [styles.langOption, active && { backgroundColor: palette.card }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.langText, active ? { color: palette.accent } : muted]}>{lang === "ko" ? "한글로 쓰기" : "영어로 쓰기"}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.body, muted]}>
                {noteLang === "ko"
                  ? "한 줄로 써 주세요. 말로 하거나 사진을 올려도 돼요."
                  : "영어로 한 줄 써 보세요. 틀려도 괜찮아요, 베플리가 고쳐 줘요."}
              </Text>
              <View style={[styles.inputCard, card]}>
                <TextInput
                  accessibilityLabel="오늘 있었던 일"
                  maxLength={MAX_NOTE}
                  multiline
                  onChangeText={(value) => {
                    setNote(value);
                    setError(null);
                  }}
                  autoCorrect={noteLang === "ko"}
                  spellCheck={noteLang === "ko"}
                  placeholder={noteLang === "ko" ? "예) 학교 끝나고 친구랑 떡볶이를 먹었어" : "e.g. I ate tteokbokki with my friend."}
                  placeholderTextColor={palette.muted}
                  style={[styles.input, ink]}
                  value={note}
                />
                <Text style={[styles.counter, muted]}>
                  {note.length} / {MAX_NOTE}
                </Text>
              </View>
              <View style={styles.toolRow}>
                {canSpeak ? (
                  <ToolButton
                    palette={palette}
                    icon={voice === "listening" ? "stop" : "mic"}
                    label={voice === "listening" ? "다 말했어요" : voice === "transcribing" ? "알아듣는 중…" : noteLang === "ko" ? "말로 하기" : "영어로 말하기"}
                    active={voice === "listening"}
                    disabled={voice === "transcribing"}
                    onPress={() => void toggleNoteVoice()}
                  />
                ) : null}
                <ToolButton
                  palette={palette}
                  icon="photo"
                  label={photoBusy ? "사진 준비 중…" : photo ? "사진 바꾸기" : "사진 올리기"}
                  disabled={photoBusy || voice !== "idle"}
                  onPress={choosePhoto}
                />
              </View>
              {voice === "listening" ? (
                <RecordingIndicator
                  palette={palette}
                  hint={noteLang === "ko" ? "오늘 있었던 일을 말한 뒤 ‘다 말했어요’를 눌러요." : "영어로 말한 뒤 ‘다 말했어요’를 눌러요."}
                />
              ) : null}
              {photo ? (
                <View style={[styles.photoCard, card]}>
                  <Image source={{ uri: photo.previewUri }} style={styles.photo} accessibilityLabel="고른 사진" />
                  <View style={styles.photoCopy}>
                    <Text style={[styles.photoTitle, ink]}>사진을 골랐어요</Text>
                    <Text style={[styles.small, muted]}>문장을 만드는 데만 쓰고 저장하지 않아요.</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="사진 빼기"
                    onPress={() => setPhoto(null)}
                    style={({ pressed }) => [styles.photoRemove, pressed && styles.pressed]}
                  >
                    <Icon name="close" size={18} color={palette.muted} />
                  </Pressable>
                </View>
              ) : null}
              <Text style={[styles.sectionTitle, ink]}>
                기분은 어땠어요? <Text style={[styles.small, muted]}>(골라도 되고 안 골라도 돼요)</Text>
              </Text>
              <View style={styles.moodRow}>
                {DIARY_MOODS.map((item) => {
                  const active = mood === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      accessibilityLabel={item.label}
                      onPress={() => setMood(active ? null : item.key)}
                      style={({ pressed }) => [
                        styles.moodChip,
                        { backgroundColor: palette.card, borderColor: palette.line },
                        active && { backgroundColor: palette.accentSoft, borderColor: palette.accent },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.moodEmoji}>{item.emoji}</Text>
                      <Text style={[styles.moodLabel, active ? { color: palette.accent } : muted]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {errorBox}
            </>
          )}
        </ScrollView>
        {!loading ? (
          <BottomBar palette={palette}>
            <PrimaryButton
              label="영어 문장 추천받기"
              icon="send"
              disabled={!ready || voice !== "idle" || photoBusy}
              onPress={() => void requestSuggestions()}
            />
          </BottomBar>
        ) : null}
      </KeyboardAvoidingView>
    );
  }

  if (step === "choose") {
    return (
      <View style={[styles.screen, { backgroundColor: palette.page }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}
          <Text style={[styles.prompt, ink]}>마음에 드는 문장을 골라요</Text>
          <Text style={[styles.body, muted]}>
            {suggestions.some((item) => item.mine)
              ? "‘내 문장’은 내가 쓴 영어를 베플리가 고친 거예요. 스피커를 누르면 원어민 음성으로 들을 수 있어요."
              : "스피커를 누르면 원어민 음성으로 들을 수 있어요."}
          </Text>
          {suggestions.map((item, index) => {
            const active = selected === index;
            const written = note.replace(/\s+/g, " ").trim();
            const changed = Boolean(item.mine && written) && sentenceKey(written) !== sentenceKey(item.sentenceEn);
            return (
              <Pressable
                key={`${item.level}-${item.sentenceEn}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${item.mine ? "내 문장, " : ""}${DIARY_LEVEL_LABELS[item.level]} 문장, ${item.sentenceEn}, ${item.meaningKo}`}
                onPress={() => setSelected(index)}
                style={({ pressed }) => [
                  styles.card,
                  card,
                  active && { borderColor: palette.accent, backgroundColor: palette.accentSoft },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.levelRow}>
                    {item.mine ? (
                      <View style={[styles.levelChip, { backgroundColor: palette.accent }]}>
                        <Text style={[styles.levelText, { color: palette.card }]}>내 문장</Text>
                      </View>
                    ) : null}
                    <View style={[styles.levelChip, { backgroundColor: active ? palette.card : palette.soft }]}>
                      <Text style={[styles.levelText, { color: palette.accent }]}>{DIARY_LEVEL_LABELS[item.level]}</Text>
                    </View>
                    {item.usedWord ? (
                      <Text style={[styles.small, { color: color.success }]}>배운 단어 ‘{item.usedWord}’</Text>
                    ) : null}
                  </View>
                  <SpeakerButton palette={palette} text={item.sentenceEn} playing={playing === item.sentenceEn} onPlay={play} />
                </View>
                <Text style={[styles.sentence, ink]}>{item.sentenceEn}</Text>
                <Text style={[styles.body, muted]}>{item.meaningKo}</Text>
                {changed ? (
                  <Text style={[styles.small, muted]}>
                    내가 쓴 문장: <Text style={styles.written}>{written}</Text>
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          {errorBox}
        </ScrollView>
        <BottomBar palette={palette}>
          <PrimaryButton label="이 문장으로 연습하기" icon="mic" disabled={!choice} onPress={startPractice} />
        </BottomBar>
      </View>
    );
  }

  if (step === "practice" && choice) {
    const passed = Boolean(result?.passed);
    const perfect = passed && Boolean(result?.words.every((word) => word.said));
    const canSaveAnyway = !passed && (attempts >= SAVE_ANYWAY_AFTER || !canSpeak);
    const recording = voice === "listening";
    const canSave = passed || canSaveAnyway;
    return (
      <View style={[styles.screen, { backgroundColor: palette.page }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}
          <Text style={[styles.prompt, ink]}>원어민 음성을 듣고 따라 말해 봐요</Text>
          <View style={[styles.card, styles.practiceCard, card]}>
            <Text style={[styles.practiceSentence, ink]} accessibilityLabel={choice.sentenceEn}>
              {result
                ? result.words.map((word, index) => (
                    <Text key={index} style={!word.said && styles.missedWord}>
                      {word.text}
                      {index < result.words.length - 1 ? " " : ""}
                    </Text>
                  ))
                : choice.sentenceEn}
            </Text>
            <Text style={[styles.body, muted]}>{choice.meaningKo}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => play(choice.sentenceEn)}
              style={({ pressed }) => [styles.listenButton, { backgroundColor: palette.accentSoft }, pressed && styles.pressed]}
            >
              <Icon name="replay" size={18} color={palette.accent} />
              <Text style={[styles.linkText, { color: palette.accent }]}>{playing === choice.sentenceEn ? "듣는 중…" : "다시 듣기"}</Text>
            </Pressable>
          </View>

          {recording ? (
            <RecordingIndicator palette={palette} hint="문장을 따라 말한 뒤 ‘다 말했어요’를 눌러요." />
          ) : heard ? (
            <View style={[styles.card, card, passed && { borderColor: color.success }]} accessibilityLiveRegion="polite">
              <View style={styles.feedbackRow}>
                <Image source={passed ? befly.review.correct : befly.review.retry} style={styles.feedbackAvatar} accessible={false} />
                <View style={styles.feedbackCopy}>
                  <Text style={[styles.feedbackTitle, { color: passed ? color.success : palette.ink }]}>
                    {perfect
                      ? "완벽해요! 끝까지 정확하게 따라 말했어요."
                      : passed
                        ? "잘했어요! 거의 완벽했어요."
                        : "거의 다 왔어요! 주황색 단어를 다시 들어 봐요."}
                  </Text>
                  {passed && !perfect ? (
                    <Text style={[styles.small, muted]}>주황색 단어만 다시 들어 보면 완벽해요. 다시 녹음해도 좋아요.</Text>
                  ) : null}
                  <Text style={[styles.small, muted]}>
                    {attempts}번째로 말한 문장: {heard}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
          {errorBox}
        </ScrollView>
        <BottomBar palette={palette}>
          {canSave && !recording ? (
            <PrimaryButton
              label={saving ? "저장하는 중…" : "일기장에 저장하기"}
              icon="book"
              disabled={saving || voice !== "idle"}
              onPress={() => void saveDiary()}
            />
          ) : null}
          {canSpeak ? (
            <PrimaryButton
              tone={recording ? "danger" : canSave ? "secondary" : "primary"}
              label={recording ? "다 말했어요" : voice === "transcribing" ? "알아듣는 중…" : heard ? "다시 녹음하기" : "따라 말하기"}
              icon={recording ? "stop" : "mic"}
              disabled={voice === "transcribing" || saving}
              onPress={() => void togglePracticeVoice()}
            />
          ) : null}
        </BottomBar>
      </View>
    );
  }

  // done
  return (
    <View style={[styles.screen, { backgroundColor: palette.page }]}>
      <ScrollView contentContainerStyle={[styles.content, styles.doneContent]} showsVerticalScrollIndicator={false}>
        {header}
        <Image source={befly.review.correct} style={styles.doneAvatar} accessibilityLabel="기뻐하는 베플리 선생님" />
        <Text style={[styles.doneTitle, ink]}>오늘의 영어 일기를 저장했어요!</Text>
        {saved ? (
          <View style={[styles.card, card, styles.doneCard]}>
            <Text style={[styles.sentence, ink]}>{saved.sentenceEn}</Text>
            <Text style={[styles.body, muted]}>{saved.meaningKo}</Text>
          </View>
        ) : null}
        <Text style={[styles.body, muted, styles.centerText]}>다음 전화에서 베플리가 이 문장을 다시 물어볼 거예요.{"\n"}선생님도 일기를 보고 댓글을 남겨 줄 거예요.</Text>
      </ScrollView>
      <BottomBar palette={palette}>
        <PrimaryButton label="일기장 보기" icon="book" onPress={() => setStep("book")} />
      </BottomBar>
    </View>
  );
}

function EntryBody({
  entry,
  palette,
  playing,
  onPlay,
}: {
  entry: DiaryEntry;
  palette: Palette;
  playing: string | null;
  onPlay: (text: string) => void;
}) {
  const mood = moodOf(entry.mood);
  const unread = Boolean(entry.teacherComment && !entry.commentReadAt);
  return (
    <>
      <View style={styles.entryRow}>
        <View style={styles.entryCopy}>
          <Text style={[styles.sentence, { color: palette.ink }]}>
            {mood ? `${mood.emoji} ` : ""}
            {entry.sentenceEn}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>{entry.meaningKo}</Text>
        </View>
        <SpeakerButton palette={palette} text={entry.sentenceEn} playing={playing === entry.sentenceEn} onPlay={onPlay} />
      </View>
      {entry.teacherComment ? (
        <View style={[styles.comment, { backgroundColor: palette.soft }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.commentTitle, { color: palette.ink }]}>
              {entry.teacherComment.teacherName ? `${entry.teacherComment.teacherName} 선생님` : "선생님"}
            </Text>
            {unread ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>새 댓글</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.body, { color: palette.ink }]}>{entry.teacherComment.body}</Text>
        </View>
      ) : null}
    </>
  );
}

function PracticeBadge({ entry, palette }: { entry: DiaryEntry; palette: Palette }) {
  const passed = entry.practice.passed;
  return (
    <View style={[styles.badge, { backgroundColor: passed ? color.successSoft : palette.soft }]}>
      <Text style={[styles.badgeText, { color: passed ? color.success : palette.muted }]}>
        {DIARY_LEVEL_LABELS[entry.level]} · {passed ? "따라 말하기 완료" : "따라 말하기 연습"}
      </Text>
    </View>
  );
}

function SpeakerButton({ palette, text, playing, onPlay }: { palette: Palette; text: string; playing: boolean; onPlay: (text: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text} 듣기`}
      hitSlop={8}
      onPress={() => onPlay(text)}
      style={({ pressed }) => [styles.speaker, { backgroundColor: playing ? palette.accent : palette.accentSoft }, pressed && styles.pressed]}
    >
      <Icon name="replay" size={18} color={playing ? color.surface : palette.accent} />
    </Pressable>
  );
}

function ToolButton({
  palette,
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  palette: Palette;
  icon: "mic" | "stop" | "photo";
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolButton,
        { backgroundColor: palette.card, borderColor: palette.line },
        active && { backgroundColor: color.danger, borderColor: color.danger },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={active ? color.surface : palette.accent} />
      <Text style={[styles.toolText, { color: active ? color.surface : palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

function BottomBar({ palette, children }: { palette: Palette; children: ReactNode }) {
  return <View style={[styles.bottomBar, { backgroundColor: palette.page, borderTopColor: palette.line }]}>{children}</View>;
}

function PrimaryButton({
  label,
  icon,
  disabled,
  tone = "primary",
  onPress,
}: {
  label: string;
  icon: "pencil" | "send" | "mic" | "stop" | "book";
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  onPress: () => void;
}) {
  const secondary = tone === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        secondary && styles.secondaryButton,
        tone === "danger" && styles.dangerButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={20} color={secondary ? color.primaryStrong : color.surface} strokeWidth={2.2} />
      <Text style={[styles.primaryText, secondary && { color: color.primaryStrong }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 52 },
  backButton: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: font.display, fontSize: 20, lineHeight: 28 },
  stepCount: { fontFamily: font.medium, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  eyebrow: { fontFamily: font.semibold, fontSize: 13 },
  dateText: { fontFamily: font.medium, fontSize: 13 },
  introCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  introAvatar: { width: 64, height: 64, borderRadius: 32 },
  introCopy: { flex: 1, gap: space.xs },
  introTitle: { fontFamily: font.display, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  centerText: { textAlign: "center" },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10 },
  noticeText: { flex: 1, fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, marginTop: space.xs },
  sentence: { fontFamily: font.englishBold, fontSize: 19, lineHeight: 26 },
  entryRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  entryCopy: { flex: 1, gap: space.xs },
  comment: { borderRadius: radius.sm, padding: 12, gap: 4 },
  commentTitle: { fontFamily: font.semibold, fontSize: 13 },
  newBadge: { backgroundColor: color.danger, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  newBadgeText: { fontFamily: font.semibold, fontSize: 11, color: color.surface },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontFamily: font.medium, fontSize: 12 },
  linkButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  linkText: { fontFamily: font.semibold, fontSize: 14 },
  prompt: { fontFamily: font.display, fontSize: 22, lineHeight: 30 },
  inputCard: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  input: { fontFamily: font.body, fontSize: 17, lineHeight: 25, minHeight: 76, textAlignVertical: "top", padding: 0 },
  counter: { fontFamily: font.body, fontSize: 12, alignSelf: "flex-end" },
  toolRow: { flexDirection: "row", gap: space.sm },
  langRow: { flexDirection: "row", borderRadius: radius.pill, padding: 4, gap: 4 },
  langOption: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  langText: { fontFamily: font.semibold, fontSize: 14 },
  written: { fontFamily: font.english, textDecorationLine: "line-through" },
  toolButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space.sm,
  },
  toolText: { fontFamily: font.semibold, fontSize: 14 },
  photoCard: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  photo: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: color.surfaceMuted },
  photoCopy: { flex: 1, gap: 2 },
  photoTitle: { fontFamily: font.semibold, fontSize: 15 },
  photoRemove: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  moodChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, minHeight: 40 },
  moodEmoji: { fontSize: 18 },
  moodLabel: { fontFamily: font.medium, fontSize: 14 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: color.callHintLight, borderRadius: radius.sm, padding: 12 },
  errorText: { flex: 1, fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: color.warningInk },
  loadingCard: { alignItems: "center", paddingVertical: space.xl, gap: space.md, marginTop: space.lg },
  loadingAvatar: { width: 88, height: 88, borderRadius: 44 },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  levelRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  levelChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  levelText: { fontFamily: font.semibold, fontSize: 12 },
  speaker: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  practiceCard: { paddingVertical: space.lg, gap: space.md },
  practiceSentence: { fontFamily: font.englishBold, fontSize: 24, lineHeight: 34 },
  missedWord: { color: "#C2410C", textDecorationLine: "underline" },
  listenButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  feedbackAvatar: { width: 52, height: 52, borderRadius: 26 },
  feedbackCopy: { flex: 1, gap: 4 },
  feedbackTitle: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  doneContent: { alignItems: "stretch" },
  doneAvatar: { width: 120, height: 120, borderRadius: 60, alignSelf: "center", marginTop: space.md },
  doneTitle: { fontFamily: font.display, fontSize: 22, lineHeight: 30, textAlign: "center" },
  doneCard: { alignItems: "center" },
  bottomBar: { paddingHorizontal: space.md, paddingTop: 12, paddingBottom: space.md, borderTopWidth: 1, gap: space.sm },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    minHeight: 56,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  secondaryButton: { backgroundColor: color.primarySoft },
  dangerButton: { backgroundColor: color.danger },
  recording: { flexDirection: "row", alignItems: "center", gap: space.md, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 14 },
  recDotWrap: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  recRing: { position: "absolute", width: 22, height: 22, borderRadius: 11 },
  recDot: { width: 14, height: 14, borderRadius: 7 },
  recCopy: { flex: 1, gap: 2 },
  recTitle: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  recTime: { fontFamily: font.englishBold, fontSize: 17, fontVariant: ["tabular-nums"] },
  primaryText: { fontFamily: font.display, fontSize: 17, color: color.surface },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
});
