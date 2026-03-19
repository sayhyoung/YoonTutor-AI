"""
음성 기능 유틸리티 모듈
- TTS (Text-to-Speech): 브라우저 Web Speech API 사용
- STT (Speech-to-Text): audio-recorder-streamlit + OpenAI Whisper API 사용
"""
import streamlit as st
import streamlit.components.v1 as components


def tts_speak(text: str, lang: str = "ko-KR"):
    """
    브라우저의 Web Speech API를 사용해 텍스트를 음성으로 읽어줍니다.
    st.components.v1.html()로 JavaScript를 실행합니다.
    """
    # 특수 태그 제거
    clean = (
        text.replace("[PERFECT]", "").replace("[GOOD]", "")
            .replace("[FAILED]", "").replace("[DONE]", "").strip()
    )
    if not clean:
        return

    # JavaScript 문자열 이스케이프
    escaped = (
        clean
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("'", "\\'")
        .replace("\n", " ")
        .replace("\r", "")
    )

    components.html(
        f"""<!DOCTYPE html>
<html><body>
<script>
(function() {{
    var text = "{escaped}";
    var lang = "{lang}";
    try {{
        if ('speechSynthesis' in window) {{
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            u.lang = lang;
            u.rate = 0.88;
            u.pitch = 1.05;
            u.volume = 1.0;
            // 음성 로드 후 재생
            if (window.speechSynthesis.getVoices().length === 0) {{
                window.speechSynthesis.addEventListener('voiceschanged', function() {{
                    window.speechSynthesis.speak(u);
                }}, {{ once: true }});
            }} else {{
                window.speechSynthesis.speak(u);
            }}
        }}
    }} catch(e) {{
        console.warn('TTS error:', e);
    }}
}})();
</script>
</body></html>""",
        height=1,
        scrolling=False,
    )


def render_voice_settings_in_sidebar():
    """
    사이드바 내에서 음성 설정 토글을 렌더링합니다.
    (반드시 `with st.sidebar:` 블록 안에서 호출)
    Returns: (tts_enabled: bool, stt_enabled: bool)
    """
    if "voice_tts_enabled" not in st.session_state:
        st.session_state.voice_tts_enabled = False
    if "voice_stt_enabled" not in st.session_state:
        st.session_state.voice_stt_enabled = False

    st.markdown(
        '<div style="font-size:0.72rem; color:#64748B; font-weight:700; '
        'letter-spacing:0.06em; margin-bottom:6px;">🎙️ 음성 기능 설정</div>',
        unsafe_allow_html=True,
    )

    tts_on = st.toggle(
        "🔊 AI 음성 읽기 (TTS)",
        value=st.session_state.voice_tts_enabled,
        help="AI 선생님의 메시지를 자동으로 음성으로 읽어드려요",
        key="_voice_tts_toggle",
    )
    st.session_state.voice_tts_enabled = tts_on

    stt_on = st.toggle(
        "🎤 음성으로 답하기 (STT)",
        value=st.session_state.voice_stt_enabled,
        help="마이크로 영어 답을 말하면 자동 입력됩니다 (audio-recorder-streamlit 필요)",
        key="_voice_stt_toggle",
    )
    st.session_state.voice_stt_enabled = stt_on

    if tts_on or stt_on:
        st.markdown(
            '<span class="voice-on-badge">🎙️ 음성 모드 ON</span>',
            unsafe_allow_html=True,
        )

    return tts_on, stt_on


def stt_recorder_widget() -> str | None:
    """
    마이크 녹음 위젯을 렌더링하고, 녹음된 음성을 OpenAI Whisper로 변환합니다.
    audio-recorder-streamlit 패키지가 없으면 안내 메시지를 출력합니다.
    Returns: 변환된 텍스트 또는 None
    """
    try:
        from audio_recorder_streamlit import audio_recorder
    except ImportError:
        st.warning(
            "음성 입력을 사용하려면 패키지 설치가 필요해요.\n"
            "`pip install audio-recorder-streamlit`"
        )
        return None

    import hashlib, io, os
    import openai

    col_mic, col_hint = st.columns([1, 4])
    with col_mic:
        audio_bytes = audio_recorder(
            text="",
            recording_color="#EF4444",
            neutral_color="#4361EE",
            icon_name="microphone",
            icon_size="2x",
            pause_threshold=2.0,
            key="_stt_recorder",
        )
    with col_hint:
        st.caption("마이크를 눌러 영어로 답하세요.\n녹음이 끝나면 자동으로 인식됩니다.")

    if not audio_bytes:
        return None

    # 동일 오디오 재처리 방지
    audio_hash = hashlib.md5(audio_bytes).hexdigest()
    if audio_hash == st.session_state.get("_last_stt_hash", ""):
        return None
    st.session_state._last_stt_hash = audio_hash

    with st.spinner("🎧 음성 인식 중..."):
        try:
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "recording.wav"
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="en",
            )
            return result.text.strip() if result.text else None
        except Exception as e:
            st.error(f"음성 인식 오류: {e}")
            return None
