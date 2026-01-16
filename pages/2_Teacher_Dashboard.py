import streamlit as st
import pandas as pd
import json
import plotly.express as px
from modules.log_manager import get_all_logs

st.set_page_config(page_title="교사용 대시보드", page_icon="👩‍🏫", layout="wide")

st.title("👩‍🏫 윤선생 AI 학습 관리자")

password = st.sidebar.text_input("관리자 비밀번호", type="password")
if password != "1234":
    st.warning("비밀번호를 입력하세요.")
    st.stop()

if st.sidebar.button("새로고침 🔄"):
    st.rerun()

df = get_all_logs()

if df.empty:
    st.info("데이터가 없습니다.")
else:
    # 1. 상단 지표
    col1, col2, col3 = st.columns(3)
    col1.metric("총 학습 횟수", f"{len(df)}건")
    col2.metric("전체 평균 점수", f"{int(df['score'].mean())}점")
    col3.metric("최근 학습자", df.iloc[0]['name'])

    # 2. 성취도 추이 (그래프 축 고정 수정)
    st.markdown("---")
    st.subheader("📈 최근 성취도 추이 (개인별)")
    
    chart_df = df.sort_values(by="timestamp").copy()
    chart_df['Label'] = chart_df['name'] + " (" + chart_df['timestamp'].str[5:10] + ")"
    
    fig = px.line(chart_df, x="timestamp", y="score", color="name", markers=True,
                  title="학생별 성취도 변화", labels={"timestamp": "학습 일시", "score": "점수", "name": "학생 이름"})
    
    # [핵심 수정] Y축을 0~105로 고정 (100점이 잘 보이도록 약간 여유)
    fig.update_yaxes(range=[0, 105])
    
    st.plotly_chart(fig, use_container_width=True)

    # 3. 상세 분석
    st.markdown("---")
    st.subheader("📝 학생별 문항 상세 분석")
    
    for index, row in df.iterrows():
        label = f"[{row['timestamp']}] {row['name']} - {row['score']}점"
        with st.expander(label):
            details_raw = row.get('details', '[]')
            try:
                if isinstance(details_raw, list): details = details_raw
                else: details = json.loads(details_raw)
                
                if details:
                    detail_df = pd.DataFrame(details)
                    def highlight_status(val):
                        if val == 'Not mastered': return 'color: red; font-weight: bold'
                        elif val == 'Perfect': return 'color: green; font-weight: bold'
                        return ''
                    
                    cols_to_show = ['source_sheet', 'question', 'status'] if 'source_sheet' in detail_df.columns else ['question', 'status']
                    st.dataframe(detail_df[cols_to_show].style.map(highlight_status, subset=['status']), use_container_width=True)
                else:
                    st.write("상세 문항 데이터 없음")
            except Exception as e:
                st.error("데이터 형식 오류")