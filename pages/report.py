import streamlit as st
import pandas as pd
import json
import plotly.express as px
from modules.log_manager import get_all_logs

st.set_page_config(page_title="나만의 학습 리포트", page_icon="📊")

# 로그인 체크
if "user_role" not in st.session_state or st.session_state["user_role"] != "student":
    st.warning("로그인이 필요해! 메인 화면에서 로그인해줘.")
    st.switch_page("main.py")

user_id = st.session_state.get("user_id", "알수없음")
st.title(f"📊 {user_id}님의 학습 분석 리포트")

# 1. 학습 로그 데이터 가져오기 (DB에서 조회)
all_logs = get_all_logs()

# 내 기록만 필터링 (member_id는 숫자/문자 혼용될 수 있으니 문자열로 통일해서 비교)
my_logs = pd.DataFrame()
if not all_logs.empty:
    # 안전하게 문자열 변환 후 비교
    my_logs = all_logs[all_logs['member_id'].astype(str) == str(user_id)]

if my_logs.empty:
    st.info("아직 완료된 학습 기록이 없어. 'Student Room'에서 보강 학습을 완료해봐!")
else:
    # 2. 상단 요약 (누적 통계)
    st.header("🏆 나의 누적 학습 현황")
    col1, col2, col3 = st.columns(3)
    
    total_study_cnt = len(my_logs)
    avg_score = int(my_logs['score'].mean())
    last_study_date = my_logs.iloc[0]['timestamp'][:10] # 날짜만 자르기
    
    col1.metric("총 학습 횟수", f"{total_study_cnt}회")
    col2.metric("평균 성취도", f"{avg_score}점")
    col3.metric("최근 학습일", last_study_date)
    
    st.markdown("---")

    # 3. 상세 리포트 (최신순)
    st.header("📝 상세 학습 기록")
    
    # 기록 하나씩 카드 형태로 보여주기
    for index, row in my_logs.iterrows():
        # 각 학습 세션을 Expander로 만듦
        expander_title = f"📅 {row['timestamp']} 학습 결과 (점수: {row['score']}점)"
        
        # 점수에 따라 이모지 장식
        if row['score'] == 100: expander_title = "👑 " + expander_title
        elif row['score'] < 60: expander_title = "💪 " + expander_title
        else: expander_title = "✅ " + expander_title
            
        with st.expander(expander_title, expanded=(index == 0)): # 가장 최근 것만 펼쳐둠
            
            # 상세 JSON 데이터 파싱
            details_raw = row.get('details', '[]')
            try:
                if isinstance(details_raw, str):
                    details = json.loads(details_raw)
                else:
                    details = details_raw
                
                if details:
                    detail_df = pd.DataFrame(details)
                    
                    # 아이콘 매핑 함수
                    def get_icon(val):
                        if val == "Perfect": return "👑 Perfect (100)"
                        elif val == "Good": return "✅ Good (75)"
                        elif val == "Not mastered": return "⚠️ Not mastered (50)"
                        return val

                    # 보여줄 데이터 정리
                    display_df = detail_df.copy()
                    display_df['성취도'] = display_df['status'].apply(get_icon)
                    
                    # 컬럼 이름 깔끔하게 (source_sheet가 없을 수도 있음)
                    cols = ['question', '성취도']
                    if 'source_sheet' in display_df.columns:
                        cols.insert(0, 'source_sheet')
                    
                    st.dataframe(
                        display_df[cols],
                        column_config={
                            "source_sheet": "영역",
                            "question": "학습 내용",
                            "성취도": "결과"
                        },
                        use_container_width=True
                    )
                    
                    # 요약 차트 (Pie Chart)
                    if not detail_df.empty:
                        status_counts = detail_df['status'].value_counts().reset_index()
                        status_counts.columns = ['Status', 'Count']
                        
                        fig = px.pie(status_counts, values='Count', names='Status', 
                                     title='이 날의 성취도 비율',
                                     color='Status',
                                     color_discrete_map={
                                         'Perfect': '#4CAF50',
                                         'Good': '#2196F3', 
                                         'Not mastered': '#FF5252'
                                     })
                        fig.update_layout(height=300)
                        st.plotly_chart(fig, use_container_width=True)

            except Exception as e:
                st.error("상세 데이터를 불러오는 중 오류가 발생했어.")
                # st.write(e) # 디버깅용