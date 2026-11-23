import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { Directory, File, FileMode, Paths } from "expo-file-system";
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
// 서버 읽어 주기(베플리 목소리) 오디오 주소. 없으면 기기 음성으로 읽는다.
export type RemoteSpeechSource = (
  text: string,
  language: "en" | "ko",
) => { uri: string; headers: Record<string, string> } | null;

// 서버 오디오가 이 시간 안에 재생을 시작하지 못하면 기기 음성으로 바꾼다.
const REMOTE_START_TIMEOUT_MS = 8000;
// 기기에 받아 둔 파일은 바로 재생돼야 한다. 그 안에 시작하지 못하면 서버에서 다시 받아 읽는다.
const LOCAL_START_TIMEOUT_MS = 2500;
// 받는 중인 음성 파일을 이만큼만 기다린다. 인터넷이 느려 다운로드가 멈추면 끝없이 기다리다
// 인사말이 통째로 빠졌다. 그 전에 오지 않으면 기기 음성으로 바로 읽는다.
const PREFETCH_WAIT_MS = 4000;
let currentPlayer: AudioPlayer | null = null;
// speak/stopSpeaking마다 올린다. 미리 받기를 기다리던 읽기가 그새 취소됐는지 확인한다.
let speakGeneration = 0;

// Gemini 음성은 만드는 데 2~3초 걸린다. 통화 화면에 들어서기 전에 기기 캐시에 받아 두면
// 문항이 뜨자마자 읽는다(웹은 서버 캐시만 데워 둔다).
const prefetched = new Map<string, Promise<string | null>>();

// 베플리 목소리를 바꾸면 폴더 이름을 올린다. 예전 목소리로 받아 둔 파일이 섞여 나오지 않도록
// 옛 폴더는 앱을 켠 뒤 처음 받을 때 한 번 지운다. (v2: Azure 소년 목소리)
const TTS_CACHE_DIR = "tts-v2";
const LEGACY_TTS_CACHE_DIRS = ["tts"];
let legacyCacheCleared = false;

function ttsCacheDirectory(): Directory {
  if (!legacyCacheCleared) {
    legacyCacheCleared = true;
    for (const name of LEGACY_TTS_CACHE_DIRS) {
      try {
        const legacy = new Directory(Paths.cache, name);
        if (legacy.exists) legacy.delete();
      } catch {
        // 못 지워도 새 폴더만 쓰므로 괜찮다(기기 캐시라 시스템이 언젠가 비운다).
      }
    }
  }
  const directory = new Directory(Paths.cache, TTS_CACHE_DIR);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function cacheName(key: string): string {
  let hash = 5381;
  for (let index = 0; index < key.length; index += 1) hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  return `${hash.toString(36)}-${key.length}.wav`;
}

// 받다가 끊긴(앱 종료·인터넷 끊김) 빈 파일이 캐시에 남으면 그 문장은 매번 재생 오류가 났다.
// 머리(RIFF…WAVE)와 크기를 보고 재생할 수 있는 WAV인지 확인한다.
const WAV_HEADER_BYTES = 44;

function isPlayableWav(file: File): boolean {
  try {
    if (!file.exists || file.size <= WAV_HEADER_BYTES) return false;
    const handle = file.open(FileMode.ReadOnly);
    try {
      const head = handle.readBytes(12);
      return String.fromCharCode(...head.subarray(0, 4)) === "RIFF" && String.fromCharCode(...head.subarray(8, 12)) === "WAVE";
    } finally {
      handle.close();
    }
  } catch {
    return false;
  }
}

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // 못 지우면 다음에 다시 확인한다.
  }
}

// 재생에 실패한 받아 둔 파일은 지워서 다음엔 서버에서 새로 받게 한다.
function forgetCachedSpeech(key: string, uri: string) {
  prefetched.delete(key);
  deleteQuietly(new File(uri));
}

// 받아 두기가 끝나면(실패해도) 풀리는 약속을 돌려준다. 질문을 음성과 함께 띄우려고 기다릴 때 쓴다.
export function prefetchSpeech(text: string, language: SpeechLanguage, remote?: RemoteSpeechSource): Promise<void> {
  const lang = language === "en-US" ? "en" : "ko";
  const key = `${lang}:${text}`;
  const existing = prefetched.get(key);
  if (existing) return existing.then(() => undefined);
  const source = remote?.(text, lang);
  if (!source) return Promise.resolve();
  const task = (async () => {
    let partial: File | null = null;
    try {
      if (Platform.OS === "web") {
        await fetch(source.uri, { headers: source.headers });
        return null;
      }
      const directory = ttsCacheDirectory();
      const file = new File(directory, cacheName(key));
      if (isPlayableWav(file)) return file.uri;
      deleteQuietly(file);
      // 임시 파일로 받은 뒤 확인하고 옮긴다. 받다가 끊겨도 반쪽 파일이 캐시 이름으로 남지 않는다.
      partial = new File(directory, `${cacheName(key)}.part`);
      deleteQuietly(partial);
      const downloaded = await File.downloadFileAsync(source.uri, partial, { headers: source.headers, idempotent: true });
      // 서버가 오류(JSON)를 돌려줬으면 캐시에 남기지 않는다.
      if (!isPlayableWav(downloaded)) throw new Error("not audio");
      downloaded.moveSync(file, { overwrite: true });
      return file.uri;
    } catch {
      if (partial) deleteQuietly(partial);
      prefetched.delete(key);
      return null;
    }
  })();
  prefetched.set(key, task);
  return task.then(() => undefined);
}

function stopRemote() {
  currentPlayer?.remove();
  currentPlayer = null;
}

function speakWithDevice(text: string, language: SpeechLanguage, onStart?: () => void, onEnd?: () => void) {
  const generation = speakGeneration;
  void Speech.stop().finally(() => {
    // 기다리는 동안 다른 읽기가 시작됐거나 멈췄으면 읽지 않는다.
    if (generation !== speakGeneration) return;
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
  const key = `${lang}:${text}`;
  const pending = prefetched.get(key);
  if (pending) {
    let settled = false;
    const giveUp = setTimeout(() => {
      if (settled) return;
      settled = true;
      // 그새 다른 읽기로 바뀌었거나 멈췄으면 읽지 않는다.
      if (generation === speakGeneration) speakWithDevice(text, language, onStart, onEnd);
    }, PREFETCH_WAIT_MS);
    void pending.then((localUri) => {
      if (settled) return;
      settled = true;
      clearTimeout(giveUp);
      if (generation !== speakGeneration) return;
      if (!localUri) {
        playRemote(source, text, language, onStart, onEnd);
        return;
      }
      // 받아 둔 파일이 재생되지 않으면 지우고, 기기 음성 대신 서버에서 베플리 목소리를 다시 받아 읽는다.
      playRemote({ uri: localUri }, text, language, onStart, onEnd, {
        startTimeoutMs: LOCAL_START_TIMEOUT_MS,
        onFail: () => {
          forgetCachedSpeech(key, localUri);
          if (generation === speakGeneration) playRemote(source, text, language, onStart, onEnd);
        },
      });
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
  {
    startTimeoutMs = REMOTE_START_TIMEOUT_MS,
    onFail = () => speakWithDevice(text, language, onStart, onEnd),
  }: { startTimeoutMs?: number; onFail?: () => void } = {},
) {
  const player = createAudioPlayer(source);
  currentPlayer = player;
  let started = false;
  let finished = false;
  const cleanUp = () => {
    subscription.remove();
    clearTimeout(timer);
    if (currentPlayer === player) stopRemote();
  };
  // 재생을 시작하지 못하면(파일 오류·시간 초과) 다른 방법으로 읽는다.
  // 이미 멈췄거나(화면 이동) 다른 읽기로 바뀐 소리는 다시 읽지 않는다.
  const fail = () => {
    if (started || finished) return;
    finished = true;
    const stillCurrent = currentPlayer === player;
    cleanUp();
    if (stillCurrent) onFail();
  };
  const timer = setTimeout(fail, startTimeoutMs);
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    // 읽을 수 없는 파일이면 시간 초과(8초)를 기다리지 않고 바로 넘어간다.
    if (status.error) {
      if (!started) fail();
      else if (!finished) {
        finished = true;
        cleanUp();
        onEnd?.();
      }
      return;
    }
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
