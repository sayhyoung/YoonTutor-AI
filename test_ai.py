from modules.db_manager import fetch_wrong_answers
from modules.ai_tutor import generate_remedial_quiz

# 🔴 고객님의 구글 시트 주소를 꼭 다시 확인해주세요!
SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"
TEST_MEMBER_ID = 1111
STUDENT_NAME = "홍길동"

def run_full_test():
    print("🚀 1. 구글 시트에서 오답 데이터 가져오는 중...")
    
    # 단어 시트 조회
    df = fetch_wrong_answers(SHEET_URL, "단어", TEST_MEMBER_ID)
    
    if df.empty:
        print("ℹ️ 오답 데이터가 없거나, 시트 연결에 실패했습니다.")
        return

    print(f"✅ 오답 {len(df)}개 발견! AI에게 전송합니다...")
    print("🤖 2. AI가 문제를 생성하고 있습니다 (잠시만 기다려주세요)...")
    
    # AI에게 요청
    quiz_content = generate_remedial_quiz(STUDENT_NAME, df)
    
    print("\n" + "="*50)
    print(quiz_content)
    print("="*50)

if __name__ == "__main__":
    run_full_test()