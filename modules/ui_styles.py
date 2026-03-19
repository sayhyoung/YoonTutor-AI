def get_common_css():
    return """
    <style>
        /* ── Streamlit 기본 UI 요소 숨기기 ── */
        header { visibility: hidden !important; height: 0px !important; }
        [data-testid="stToolbar"] { visibility: hidden !important; display: none !important; }
        a[href^="https://github.com"] { display: none !important; }
        footer { visibility: hidden !important; display: none !important; }
        .stDeployButton { display: none !important; }
        [data-testid="stDecoration"] { display: none !important; }

        /* ── 전역 스타일 ── */
        .stApp {
            background: #F0F4FF;
            font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* ── 메인 컨텐츠 패딩 ── */
        .block-container {
            padding-top: 1.5rem !important;
            padding-bottom: 2rem !important;
        }

        /* ── 사이드바 ── */
        [data-testid="stSidebar"] {
            background: linear-gradient(180deg, #0F172A 0%, #1E293B 100%) !important;
        }
        [data-testid="stSidebar"] .stMarkdown p,
        [data-testid="stSidebar"] .stMarkdown span,
        [data-testid="stSidebar"] label {
            color: #CBD5E1 !important;
        }
        [data-testid="stSidebarContent"] .stButton button {
            width: 100%;
            background: rgba(255, 255, 255, 0.07) !important;
            color: #E2E8F0 !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-radius: 10px !important;
            font-size: 0.875rem !important;
            padding: 0.5rem 0.75rem !important;
            transition: all 0.2s ease !important;
            margin-bottom: 4px;
        }
        [data-testid="stSidebarContent"] .stButton button:hover {
            background: rgba(67, 97, 238, 0.35) !important;
            border-color: #4361EE !important;
            color: white !important;
        }
        /* 사이드바 토글 */
        [data-testid="stSidebar"] [data-testid="stToggle"] label {
            color: #CBD5E1 !important;
        }

        /* ── 진행 바 ── */
        [data-testid="stProgressBar"] > div > div {
            background: linear-gradient(90deg, #4361EE, #4CC9F0) !important;
            border-radius: 99px !important;
        }

        /* ── 메트릭 카드 ── */
        [data-testid="stMetric"] {
            background: white !important;
            padding: 1.2rem 1.5rem !important;
            border-radius: 16px !important;
            box-shadow: 0 2px 12px rgba(67, 97, 238, 0.08) !important;
            border: 1px solid #E8EDFF !important;
        }
        [data-testid="stMetricValue"] {
            color: #4361EE !important;
            font-weight: 700 !important;
        }
        [data-testid="stMetricLabel"] {
            color: #64748B !important;
            font-size: 0.85rem !important;
        }

        /* ── 채팅 ── */
        [data-testid="stChatMessage"] {
            border-radius: 16px !important;
            margin-bottom: 10px !important;
            padding: 0.75rem 1rem !important;
        }

        /* ── Primary 버튼 ── */
        button[kind="primary"],
        [data-testid="baseButton-primary"] {
            background: linear-gradient(135deg, #4361EE 0%, #7B8FF8 100%) !important;
            color: white !important;
            border: none !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            transition: all 0.2s ease !important;
            box-shadow: 0 4px 12px rgba(67, 97, 238, 0.3) !important;
        }
        button[kind="primary"]:hover {
            transform: translateY(-1px) !important;
            box-shadow: 0 6px 16px rgba(67, 97, 238, 0.4) !important;
        }

        /* ── 탭 ── */
        .stTabs [data-baseweb="tab-list"] {
            background: #EEF2FF;
            padding: 4px;
            border-radius: 12px;
            gap: 4px;
        }
        .stTabs [data-baseweb="tab"] {
            border-radius: 8px !important;
            font-weight: 600 !important;
            color: #64748B !important;
            border: none !important;
            background: transparent !important;
            padding: 8px 20px !important;
        }
        .stTabs [aria-selected="true"] {
            background: white !important;
            color: #4361EE !important;
            box-shadow: 0 2px 8px rgba(67, 97, 238, 0.15) !important;
        }

        /* ── 알림 박스 ── */
        .stAlert {
            border-radius: 12px !important;
        }

        /* ── 텍스트 입력 ── */
        .stTextInput input {
            border-radius: 10px !important;
            border: 1.5px solid #E2E8F0 !important;
            padding: 0.6rem 1rem !important;
        }
        .stTextInput input:focus {
            border-color: #4361EE !important;
            box-shadow: 0 0 0 3px rgba(67, 97, 238, 0.15) !important;
        }

        /* ── 구분선 ── */
        hr { border-color: #E2E8F0 !important; margin: 1rem 0 !important; }

        /* ── 데이터프레임 ── */
        [data-testid="stDataFrame"] {
            border-radius: 12px !important;
            overflow: hidden !important;
        }

        /* ── 음성 뱃지 ── */
        .voice-on-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: linear-gradient(135deg, #7B2FBE, #A855F7);
            color: white;
            padding: 3px 10px;
            border-radius: 99px;
            font-size: 0.72rem;
            font-weight: 700;
        }
    </style>
    """


def sidebar_brand_html(subtitle="AI 코칭 시스템"):
    return f"""
    <div style="text-align:center; padding:1.2rem 0.5rem 1rem 0.5rem;
                border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:1rem;">
        <div style="font-size:2rem; line-height:1;">🎓</div>
        <div style="color:#F1F5F9; font-weight:800; font-size:1.05rem; margin-top:4px;">
            윤선생 AI 코치
        </div>
        <div style="color:#64748B; font-size:0.72rem; margin-top:2px;">{subtitle}</div>
    </div>
    """


def sidebar_user_card_html(name, user_id, role="학생"):
    icon = "👦" if role == "학생" else "👩‍🏫"
    role_color = "#38BDF8" if role == "학생" else "#FB923C"
    return f"""
    <div style="background:rgba(255,255,255,0.05); border-radius:12px; padding:0.75rem 0.9rem;
                margin-bottom:0.8rem; border:1px solid rgba(255,255,255,0.08);">
        <div style="font-size:0.68rem; color:#64748B; margin-bottom:3px; letter-spacing:0.05em;">
            현재 로그인
        </div>
        <div style="font-size:0.95rem; color:#E2E8F0; font-weight:700;">{icon} {name}</div>
        <div style="display:flex; justify-content:space-between; margin-top:3px;">
            <span style="font-size:0.72rem; color:#94A3B8;">ID: {user_id}</span>
            <span style="font-size:0.68rem; color:{role_color}; font-weight:600;">{role}</span>
        </div>
    </div>
    """
