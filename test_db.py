from modules.db_manager import fetch_wrong_answers

# 여기에 고객님의 구글 시트 주소를 복사해서 넣으세요
SHEET_URL = "https://docs.google.com/spreadsheets/d/18CTkxyG79jZRzniWxM1Xde8TngSi-eAUqOBF98Aash0/edit"

# 테스트할 회원 번호 (시트에 실제로 적혀 있는 번호여야 합니다)
TEST_MEMBER_ID = 1111 

def run_test():
    print("🚀 데이터 연결 테스트 시작...")
    
    # 1. 단어 시트 테스트
    print("\n[단어 시트 오답 검색 중...]")
    vocab_df = fetch_wrong_answers(SHEET_URL, "단어", TEST_MEMBER_ID)
    
    if not vocab_df.empty:
        print(f"✅ 발견된 오답: {len(vocab_df)}개")
        print(vocab_df[['단어', '정답 여부']].to_string(index=False))
    else:
        print("ℹ️ 오답이 없거나 데이터를 못 가져왔습니다.")

    # 2. 문장 시트 테스트
    print("\n[문장 시트 오답 검색 중...]")
    sent_df = fetch_wrong_answers(SHEET_URL, "문장", TEST_MEMBER_ID)
    
    if not sent_df.empty:
        print(f"✅ 발견된 오답: {len(sent_df)}개")
        print(sent_df[['문장']].to_string(index=False))
    else:
        print("ℹ️ 오답이 없거나 데이터를 못 가져왔습니다.")

if __name__ == "__main__":
    run_test()