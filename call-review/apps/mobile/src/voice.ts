import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import {
  type AudioPlayer,
  createAudioPlayer,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Speech from "expo-speech";

export type VoiceCapture = {
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
};

export class MicUnavailableError extends Error {}

// 권한 창이 뜨지 않거나 응답이 없으면 학생이 멈춘 화면을 보게 되므로 시간을 제한한다.
const MIC_START_TIMEOUT_MS = 8000;

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new MicUnavailableError("timeout")), ms));
}

// 음성 인식(Azure Fast Transcription)이 받는 형식으로 녹음한다.
// Android는 AAC(ADTS), iOS는 16kHz WAV, 웹은 브라우저 기본(WebM/Opus).
const SPEECH_RECORDING: RecordingOptions = {
  extension: Platform.OS === "ios" ? ".wav" : ".aac",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { extension: ".aac", outputFormat: "aac_adts", audioEncoder: "aac", sampleRate: 16000 },
  ios: {
    extension: ".wav",
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/webm", bitsPerSecond: 64000 },
};

// 학생 답변 녹음. 권한이 없거나 녹음을 시작할 수 없으면 MicUnavailableError.
export function useVoiceCapture(): VoiceCapture {
  const recorder = useAudioRecorder(SPEECH_RECORDING);

  const start = useCallback(async () => {
    try {
      await Promise.race([
        (async () => {
          const permission = await requestRecordingPermissionsAsync();
          if (!permission.granted) throw new MicUnavailableError("permission");
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          recorder.record();
        })(),
        timeout(MIC_START_TIMEOUT_MS),
      ]);
    } catch (error) {
      throw error instanceof MicUnavailableError ? error : new MicUnavailableError("start");
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    // 녹음이 끝나면 재생(읽어주기)이 스피커로 나오도록 녹음 모드를 끈다.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    // Android에서는 stop 직후 recorder.uri가 비어 있을 수 있어 상태의 url도 본다.
    const uri = recorder.uri ?? recorder.getStatus().url ?? null;
    if (!uri) console.warn("[voice] 녹음 파일 경로를 찾지 못했어요.");
    return uri;
  }, [recorder]);

  return useMemo(() => ({ start, stop }), [start, stop]);
}

export type SpeechLanguage = "en-US" | "ko-KR";
// 서버 읽어 주기(Gemini TTS) 오디오 주소. 없으면 기기 음성으로 읽는다.
export type RemoteSpeechSource = (
  text: string,
  language: "en" | "ko",
) => { uri: string; headers: Record<string, string> } | null;

// 서버 오디오가 이 시간 안에 재생을 시작하지 못하면 기기 음성으로 바꾼다.
const REMOTE_START_TIMEOUT_MS = 8000;
let currentPlayer: AudioPlayer | null = null;
// speak/stopSpeaking마다 올린다. 미리 받기를 기다리던 읽기가 그새 취소됐는지 확인한다.
let speakGeneration = 0;

// Gemini 음성은 만드는 데 2~3초 걸린다. 통화 화면에 들어서기 전에 기기 캐시에 받아 두면
// 문항이 뜨자마자 읽는다(웹은 서버 캐시만 데워 둔다).
const prefetched = new Map<string, Promise<string | null>>();

function cacheName(key: string): string {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  return `${hash.toString(36)}-${key.length}.wav`;
}

export function prefetchSpeech(text: string, language: SpeechLanguage, remote?: RemoteSpeechSource) {
  const lang = language === "en-US" ? "en" : "ko";
  const key = `${lang}:${text}`;
  if (prefetched.has(key)) return;
  const source = remote?.(text, lang);
  if (!source) return;
  const task = (async () => {
    try {
      if (Platform.OS === "web") {
        await fetch(source.uri, { headers: source.headers });
        return null;
      }
      const directory = new Directory(Paths.cache, "tts");
      if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
      const file = new File(directory, cacheName(key));
      if (file.exists) return file.uri;
      const downloaded = await File.downloadFileAsync(source.uri, file, { headers: source.headers, idempotent: true });
      // 서버가 오류(JSON)를 돌려줬으면 캐시에 남기지 않는다.
      const head = (await downloaded.bytes()).subarray(0, 4);
      if (String.fromCharCode(...head) !== "RIFF") {
        downloaded.delete();
        throw new Error("not audio");
      }
      return downloaded.uri;
    } catch {
      prefetched.delete(key);
      return null;
    }
  })();
  prefetched.set(key, task);
}

function stopRemote() {
  currentPlayer?.remove();
  currentPlayer = null;
}

function speakWithDevice(text: string, language: SpeechLanguage, onStart?: () => void, onEnd?: () => void) {
  void Speech.stop().finally(() => {
    Speech.speak(text, {
      language,
      rate: language === "en-US" ? 0.9 : 1,
      onStart,
      onDone: onEnd,
      onStopped: onEnd,
      onError: () => onEnd?.(),
    });
  });
}

// 읽어 주기. 서버 음성(Gemini)을 먼저 쓰고, 안 되면 기기 음성. 끝나면(또는 중단 시) onEnd.
export function speak(
  text: string,
  language: SpeechLanguage,
  onStart?: () => void,
  onEnd?: () => void,
  remote?: RemoteSpeechSource,
) {
  stopRemote();
  void Speech.stop();
  const generation = ++speakGeneration;
  const lang = language === "en-US" ? "en" : "ko";
  const source = remote?.(text, lang);
  if (!source) {
    speakWithDevice(text, language, onStart, onEnd);
    return;
  }

  // 미리 받아 둔(또는 받는 중인) 파일이 있으면 그것으로 읽고, 없으면 서버에서 바로 받는다.
  const pending = prefetched.get(`${lang}:${text}`);
  if (pending) {
    void pending.then((localUri) => {
      if (generation === speakGeneration) playRemote(localUri ? { uri: localUri } : source, text, language, onStart, onEnd);
    });
    return;
  }
  playRemote(source, text, language, onStart, onEnd);
}

function playRemote(
  source: { uri: string; headers?: Record<string, string> },
  text: string,
  language: SpeechLanguage,
  onStart?: () => void,
  onEnd?: () => void,
) {
  const player = createAudioPlayer(source);
  currentPlayer = player;
  let started = false;
  let finished = false;
  const cleanUp = () => {
    subscription.remove();
    clearTimeout(fallback);
    if (currentPlayer === player) stopRemote();
  };
  const fallback = setTimeout(() => {
    if (started || finished) return;
    finished = true;
    cleanUp();
    speakWithDevice(text, language, onStart, onEnd);
  }, REMOTE_START_TIMEOUT_MS);
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (!started && status.playing) {
      started = true;
      onStart?.();
    }
    if (status.didJustFinish && !finished) {
      finished = true;
      cleanUp();
      onEnd?.();
    }
  });
  player.play();
}

export function stopSpeaking() {
  speakGeneration += 1;
  stopRemote();
  void Speech.stop();
}
