import gspread
import pandas as pd
import os
import streamlit as st

# 로컬 인증 파일 경로
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_PATH = os.path.join(BASE_DIR, "config", "secrets.json")

def get_connection():
    """
    로컬(파일)과 배포(Secrets) 환경을 모두 지원하는 강력한 연결 함수
    """
    # 1. 배포 환경 (Streamlit Cloud Secrets) 우선 시도
    try:
        # st.secrets에 접근할 때 파일이 없으면 에러가 나므로 try-except로 감쌈
        if "gcp_service_account" in st.secrets:
            return gspread.service_account_from_dict(st.secrets["gcp_service_account"])
    except Exception:
        pass # 배포 환경이 아니면 조용히 넘어감

    # 2. 로컬 환경 (secrets.json 파일) 시도
    try:
        if os.path.exists(KEY_PATH):
            return gspread.service_account(filename=KEY_PATH)
        else:
            # 파일도 없고 Secrets도 없는 경우
            print(f"❌ 인증 파일을 찾을 수 없습니다. 경로 확인 필요: {KEY_PATH}")
            return None
    except Exception as e:
        print(f"❌ 로컬 인증 파일 로드 오류: {e}")
        return None

def get_student_name(sheet_url, member_id):
    """
    회원번호로 학생 이름을 찾아 반환 (모든 시트 검색)
    """
    gc = get_connection()
    if not gc: return None

    try:
        doc = gc.open_by_url(sheet_url)
        
        # 검색할 시트 목록 (순서대로 찾음)
        target_sheets = ["단어", "문장", "평가"]
        
        for sheet_name in target_sheets:
            try:
                ws = doc.worksheet(sheet_name)
                data = ws.get_all_records()
                df = pd.DataFrame(data)
                
                if df.empty: continue
                
                # 컬럼명 공백 제거
                df.columns = [c.replace(" ", "") for c in df.columns]
                
                # 필수 컬럼 확인
                if '회원번호' not in df.columns or '이름' not in df.columns:
                    continue

                # 검색
                df['회원번호'] = df['회원번호'].astype(str)
                member_row = df[df['회원번호'] == str(member_id)]
                
                if not member_row.empty:
                    found_name = member_row.iloc[0]['이름']
                    if found_name.strip():
                        return found_name
                        
            except gspread.WorksheetNotFound:
                continue
            except Exception as e:
                print(f"⚠️ {sheet_name} 시트 검색 중 오류: {e}")
                continue
                
        return None
            
    except Exception as e:
        print(f"❌ 이름 찾기 실패: {e}")
        return None

def fetch_wrong_answers(sheet_url, worksheet_name, member_id):
    gc = get_connection()
    if not gc: return pd.DataFrame()
    
    try:
        doc = gc.open_by_url(sheet_url)
        ws = doc.worksheet(worksheet_name)
        data = ws.get_all_records()
        df = pd.DataFrame(data)
        
        # 전처리
        df = df.fillna("").astype(str)
        
        target_col = ""
        if worksheet_name == "단어": target_col = "단어"
        elif worksheet_name == "문장": target_col = "문장"
        elif worksheet_name == "평가": target_col = "문제 내용"
        
        conditions = (
            (df['회원번호'] == str(member_id)) & 
            (df['정답 여부'] == 'X')
        )
        
        if target_col and target_col in df.columns:
            conditions = conditions & (df[target_col].str.strip() != "") & (df[target_col].str.lower() != "nan")
            filtered_df = df[conditions].copy()
            filtered_df['source_sheet'] = worksheet_name
            return filtered_df
        else:
            return pd.DataFrame()

    except Exception as e:
        print(f"❌ 데이터 가져오기 실패: {e}")
        return pd.DataFrame()