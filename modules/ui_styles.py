def get_common_css():
    return """
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap');

        /* ── CSS 변수 ── */
        :root {
            --primary: #4361EE;
            --primary-light: #7B8FF8;
            --primary-dark: #3451D1;
            --accent: #4CC9F0;
            --success: #10B981;
            --warning: #F59E0B;
            --danger: #EF4444;
            --text-primary: #0F172A;
            --text-secondary: #64748B;
            --text-tertiary: #94A3B8;
            --bg-base: #F1F5FF;
            --surface: #FFFFFF;
            --surface-subtle: #F8FAFF;
            --border: rgba(99, 120, 221, 0.13);
            --border-subtle: rgba(226, 232, 240, 0.8);
            --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.05);
            --shadow-sm: 0 2px 8px rgba(67, 97, 238, 0.07), 0 1px 3px rgba(15, 23, 42, 0.05);
            --shadow-md: 0 4px 20px rgba(67, 97, 238, 0.10), 0 2px 8px rgba(15, 23, 42, 0.06);
            --shadow-lg: 0 8px 32px rgba(67, 97, 238, 0.14), 0 4px 16px rgba(15, 23, 42, 0.08);
            --radius-sm: 8px;
            --radius-md: 14px;
            --radius-lg: 20px;
            --radius-xl: 28px;
        }

        /* ── Streamlit 기본 UI 정리 ── */
        header { visibility: hidden !important; height: 0px !important; }
        [data-testid="stToolbar"],
        [data-testid="stToolbarActions"],
        [data-testid="stDecoration"],
        [data-testid="stStatusWidget"],
        [data-testid="stActionButton"],
        .stDeployButton,
        #MainMenu,
        footer { display: none !important; }
        a[href^="https://github.com"] { display: none !important; }

        /* ── 모바일 햄버거 복원 ── */
        @media (max-width: 768px) {
            header {
                visibility: visible !important;
                height: auto !important;
                background: #0B1120 !important;
            }
            [data-testid="stToolbar"] { display: none !important; }
            .stDeployButton { display: none !important; }
            [data-testid="collapsedControl"] svg,
            button[data-testid="baseButton-headerNoPadding"] svg { fill: white !important; }
            .block-container {
                padding-left: 0.75rem !important;
                padding-right: 0.75rem !important;
                padding-top: 0.5rem !important;
            }
            [data-testid="stMetricValue"] { font-size: 1.1rem !important; }
            [data-testid="stMetricLabel"] { font-size: 0.72rem !important; }
        }

        /* ── 글로벌 폰트 & 배경 ── */
        html, body, .stApp {
            font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            background: var(--bg-base) !important;
            color: var(--text-primary) !important;
            -webkit-font-smoothing: antialiased;
        }

        /* ── 메인 컨텐츠 패딩 ── */
        .block-container {
            padding-top: 1.75rem !important;
            padding-bottom: 3rem !important;
            max-width: 860px;
        }

        /* ── 사이드바 ── */
        [data-testid="stSidebar"] {
            background: linear-gradient(180deg, #0B1120 0%, #0F1E38 60%, #111827 100%) !important;
            border-right: 1px solid rgba(255,255,255,0.05) !important;
        }
        [data-testid="stSidebarNav"],
        [data-testid="stSidebarNavItems"],
        section[data-testid="stSidebarNav"] { display: none !important; }

        [data-testid="stSidebar"] p,
        [data-testid="stSidebar"] span,
        [data-testid="stSidebar"] div,
        [data-testid="stSidebar"] label,
        [data-testid="stSidebar"] small,
        [data-testid="stSidebar"] .stMarkdown p,
        [data-testid="stSidebar"] .stMarkdown span { color: #CBD5E1 !important; }

        [data-testid="stSidebar"] button,
        [data-testid="stSidebar"] .stButton > button,
        [data-testid="stSidebarContent"] button {
            width: 100% !important;
            background: rgba(255, 255, 255, 0.06) !important;
            color: #CBD5E1 !important;
            border: 1px solid rgba(255, 255, 255, 0.09) !important;
            border-radius: var(--radius-sm) !important;
            font-size: 0.85rem !important;
            font-weight: 500 !important;
            padding: 0.5rem 0.9rem !important;
            transition: all 0.18s ease !important;
            margin-bottom: 4px !important;
            letter-spacing: 0.01em !important;
        }
        [data-testid="stSidebar"] button:hover,
        [data-testid="stSidebar"] .stButton > button:hover,
        [data-testid="stSidebarContent"] button:hover {
            background: rgba(67, 97, 238, 0.25) !important;
            border-color: rgba(67, 97, 238, 0.5) !important;
            color: #E2E8F0 !important;
            transform: translateX(2px) !important;
        }
        [data-testid="stSidebar"] [data-testid="stToggle"] label,
        [data-testid="stSidebar"] [data-testid="stToggle"] p { color: #94A3B8 !important; }
        [data-testid="stSidebar"] hr { border-color: rgba(255,255,255,0.07) !important; }

        /* ── 진행 바 ── */
        [data-testid="stProgressBar"] {
            border-radius: 99px !important;
            overflow: hidden !important;
        }
        [data-testid="stProgressBar"] > div {
            background: rgba(99, 120, 221, 0.12) !important;
            border-radius: 99px !important;
        }
        [data-testid="stProgressBar"] > div > div {
            background: linear-gradient(90deg, #4361EE 0%, #7B8FF8 60%, #4CC9F0 100%) !important;
            border-radius: 99px !important;
            transition: width 0.4s ease !important;
        }

        /* ── 메트릭 카드 ── */
        [data-testid="stMetric"] {
            background: var(--surface) !important;
            padding: 1.1rem 1.3rem !important;
            border-radius: var(--radius-md) !important;
            box-shadow: var(--shadow-sm) !important;
            border: 1px solid var(--border) !important;
            transition: box-shadow 0.2s ease, transform 0.2s ease !important;
        }
        [data-testid="stMetric"]:hover {
            box-shadow: var(--shadow-md) !important;
            transform: translateY(-1px) !important;
        }
        [data-testid="stMetricValue"] {
            color: var(--primary) !important;
            font-weight: 800 !important;
            font-size: 1.4rem !important;
            letter-spacing: -0.02em !important;
        }
        [data-testid="stMetricLabel"] {
            color: var(--text-secondary) !important;
            font-size: 0.78rem !important;
            font-weight: 600 !important;
            letter-spacing: 0.03em !important;
            text-transform: uppercase !important;
        }
        [data-testid="stMetricDelta"] { font-size: 0.78rem !important; }

        /* ── 채팅 메시지 ── */
        [data-testid="stChatMessage"] {
            border-radius: var(--radius-md) !important;
            margin-bottom: 8px !important;
            border: none !important;
            box-shadow: var(--shadow-xs) !important;
        }
        /* AI 메시지 */
        [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-assistant"]),
        [data-testid="stChatMessage"]:has(.stChatMessageContent-assistant) {
            background: var(--surface) !important;
            border: 1px solid var(--border) !important;
        }
        /* 유저 메시지 */
        [data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) {
            background: linear-gradient(135deg, #EEF2FF 0%, #E8F0FE 100%) !important;
        }

        /* ── Primary 버튼 ── */
        button[kind="primary"],
        [data-testid="baseButton-primary"] {
            background: linear-gradient(135deg, #4361EE 0%, #5A75F0 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: var(--radius-sm) !important;
            font-weight: 700 !important;
            font-size: 0.88rem !important;
            letter-spacing: 0.01em !important;
            padding: 0.55rem 1.2rem !important;
            transition: all 0.18s ease !important;
            box-shadow: 0 2px 12px rgba(67, 97, 238, 0.35) !important;
        }
        button[kind="primary"]:hover,
        [data-testid="baseButton-primary"]:hover {
            background: linear-gradient(135deg, #3451D1 0%, #4361EE 100%) !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 18px rgba(67, 97, 238, 0.45) !important;
        }
        button[kind="primary"]:active,
        [data-testid="baseButton-primary"]:active {
            transform: translateY(0) !important;
            box-shadow: 0 1px 6px rgba(67, 97, 238, 0.3) !important;
        }

        /* ── Secondary 버튼 ── */
        button[kind="secondary"],
        [data-testid="baseButton-secondary"] {
            background: var(--surface) !important;
            color: var(--text-primary) !important;
            border: 1.5px solid var(--border-subtle) !important;
            border-radius: var(--radius-sm) !important;
            font-weight: 600 !important;
            font-size: 0.88rem !important;
            transition: all 0.18s ease !important;
        }
        button[kind="secondary"]:hover,
        [data-testid="baseButton-secondary"]:hover {
            border-color: var(--primary-light) !important;
            color: var(--primary) !important;
            background: #F0F4FF !important;
        }

        /* ── 탭 ── */
        .stTabs [data-baseweb="tab-list"] {
            display: flex !important;
            width: 100% !important;
            background: rgba(241, 245, 255, 0.8);
            padding: 4px;
            border-radius: var(--radius-sm);
            gap: 3px;
            border: 1px solid var(--border) !important;
        }
        .stTabs [data-baseweb="tab"] {
            flex: 1 !important;
            text-align: center !important;
            justify-content: center !important;
            border-radius: 6px !important;
            font-weight: 600 !important;
            font-size: 0.875rem !important;
            color: var(--text-secondary) !important;
            border: none !important;
            background: transparent !important;
            padding: 8px 16px !important;
            transition: all 0.18s ease !important;
            letter-spacing: 0.01em !important;
        }
        .stTabs [aria-selected="true"] {
            background: var(--surface) !important;
            color: var(--primary) !important;
            box-shadow: 0 1px 6px rgba(67, 97, 238, 0.15) !important;
        }

        /* ── 알림 박스 ── */
        .stAlert {
            border-radius: var(--radius-md) !important;
            border-left-width: 3px !important;
            font-size: 0.875rem !important;
        }
        [data-testid="stAlertContentInfo"] { border-color: var(--primary) !important; }
        [data-testid="stAlertContentSuccess"] { border-color: var(--success) !important; }
        [data-testid="stAlertContentWarning"] { border-color: var(--warning) !important; }
        [data-testid="stAlertContentError"] { border-color: var(--danger) !important; }

        /* ── 텍스트 / 채팅 입력 ── */
        .stTextInput input,
        [data-testid="stChatInput"] textarea {
            border-radius: var(--radius-sm) !important;
            border: 1.5px solid var(--border-subtle) !important;
            font-size: 0.9rem !important;
            transition: border-color 0.18s ease, box-shadow 0.18s ease !important;
            background: var(--surface) !important;
        }
        .stTextInput input:focus,
        [data-testid="stChatInput"] textarea:focus {
            border-color: var(--primary) !important;
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.12) !important;
        }

        /* 채팅 입력 래퍼 */
        [data-testid="stChatInput"] {
            border-radius: var(--radius-md) !important;
            border: 1.5px solid var(--border-subtle) !important;
            background: var(--surface) !important;
            box-shadow: var(--shadow-sm) !important;
            transition: border-color 0.18s ease, box-shadow 0.18s ease !important;
        }
        [data-testid="stChatInput"]:focus-within {
            border-color: var(--primary) !important;
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.1), var(--shadow-sm) !important;
        }

        /* ── 구분선 ── */
        hr { border-color: var(--border-subtle) !important; margin: 1.2rem 0 !important; }

        /* ── 데이터프레임 ── */
        [data-testid="stDataFrame"] {
            border-radius: var(--radius-md) !important;
            overflow: hidden !important;
            box-shadow: var(--shadow-xs) !important;
            border: 1px solid var(--border) !important;
        }
        .dvn-scroller { border-radius: var(--radius-md) !important; }

        /* ── Expander ── */
        [data-testid="stExpander"] {
            border: 1px solid var(--border) !important;
            border-radius: var(--radius-md) !important;
            background: var(--surface) !important;
            box-shadow: var(--shadow-xs) !important;
            overflow: hidden !important;
            margin-bottom: 8px !important;
        }
        [data-testid="stExpander"] summary {
            font-weight: 600 !important;
            font-size: 0.88rem !important;
            padding: 0.75rem 1rem !important;
        }
        [data-testid="stExpander"] summary:hover { background: var(--surface-subtle) !important; }

        /* ── Spinner 텍스트 ── */
        [data-testid="stSpinner"] p { color: var(--text-secondary) !important; font-size: 0.85rem !important; }

        /* ── Toast ── */
        [data-testid="stToast"] {
            border-radius: var(--radius-md) !important;
            box-shadow: var(--shadow-lg) !important;
            font-size: 0.875rem !important;
            font-weight: 600 !important;
        }

        /* ── Form ── */
        [data-testid="stForm"] {
            border: 1px solid var(--border) !important;
            border-radius: var(--radius-lg) !important;
            padding: 0 !important;
            background: transparent !important;
        }

        /* ── 스크롤바 ── */
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99, 120, 221, 0.2); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(99, 120, 221, 0.4); }

        /* ── 음성 뱃지 ── */
        .voice-on-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: linear-gradient(135deg, #7B2FBE, #A855F7);
            color: white;
            padding: 3px 10px;
            border-radius: 99px;
            font-size: 0.7rem;
            font-weight: 700;
            letter-spacing: 0.03em;
        }
    </style>
    """


def sidebar_brand_html(subtitle="AI 코칭 시스템"):
    return f"""
    <div style="text-align:center; padding:1.4rem 0.5rem 1.1rem 0.5rem;
                border-bottom:1px solid rgba(255,255,255,0.06); margin-bottom:1rem;">
        <div style="width:44px; height:44px; margin:0 auto 10px auto;
                    background:linear-gradient(135deg,#4361EE,#4CC9F0);
                    border-radius:12px; display:flex; align-items:center;
                    justify-content:center; font-size:1.4rem; box-shadow:0 4px 14px rgba(67,97,238,0.4);">
            🎓
        </div>
        <div style="color:#F1F5F9; font-weight:800; font-size:1rem;
                    letter-spacing:-0.01em; margin-top:2px;">
            윤선생 AI 코치
        </div>
        <div style="color:#475569; font-size:0.7rem; margin-top:3px; font-weight:500;
                    letter-spacing:0.04em; text-transform:uppercase;">
            {subtitle}
        </div>
    </div>
    """


def sidebar_user_card_html(name, user_id, role="학생"):
    icon = "👦" if role == "학생" else "👩‍🏫"
    role_color = "#60A5FA" if role == "학생" else "#FB923C"
    role_bg = "rgba(96,165,250,0.12)" if role == "학생" else "rgba(251,146,60,0.12)"
    return f"""
    <div style="background:rgba(255,255,255,0.04); border-radius:12px;
                padding:0.8rem 0.9rem; margin-bottom:0.8rem;
                border:1px solid rgba(255,255,255,0.07);">
        <div style="font-size:0.65rem; color:#475569; margin-bottom:5px;
                    font-weight:600; letter-spacing:0.06em; text-transform:uppercase;">
            현재 세션
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-size:1.4rem; line-height:1;">{icon}</div>
            <div>
                <div style="font-size:0.95rem; color:#E2E8F0; font-weight:700;
                            letter-spacing:-0.01em;">{name}</div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                    <span style="font-size:0.68rem; color:#475569;">ID {user_id}</span>
                    <span style="font-size:0.65rem; color:{role_color};
                                 background:{role_bg}; padding:1px 6px;
                                 border-radius:99px; font-weight:700;">{role}</span>
                </div>
            </div>
        </div>
    </div>
    """
