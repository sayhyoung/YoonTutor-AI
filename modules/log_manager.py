import pandas as pd
import os
from datetime import datetime
import json

LOG_FILE = "study_logs.csv"

def save_learning_log(member_id, student_name, total_questions, result_details):
    """
    학습 결과를 저장합니다.
    result_details: [{'question': 'dad', 'status': 'Perfect', 'type': '단어'}, ...]
    """
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # 1. 점수 계산 (Failed = 50점으로 수정)
    total_score = 0
    solved_count = 0
    
    for item in result_details:
        if item['status'] == 'Perfect':
            total_score += 100
            solved_count += 1
        elif item['status'] == 'Good':
            total_score += 75
            solved_count += 1
        else:
            total_score += 50 # Failed는 50점으로 완화
            # Failed는 해결한 개수(solved_count)에는 포함하지 않음 (선택 사항이나, 마스터리 기준으로는 미포함이 맞음)
            
    final_score = int(total_score / total_questions) if total_questions > 0 else 0
    
    # 2. 상세 내역 JSON 변환
    details_str = json.dumps(result_details, ensure_ascii=False)

    new_data = {
        "timestamp": [now],
        "member_id": [member_id],
        "name": [student_name],
        "total": [total_questions],
        "solved": [solved_count],
        "score": [final_score],
        "details": [details_str]
    }
    
    new_df = pd.DataFrame(new_data)

    if not os.path.exists(LOG_FILE):
        new_df.to_csv(LOG_FILE, index=False, encoding="utf-8-sig")
    else:
        # 헤더 없이 추가 모드
        new_df.to_csv(LOG_FILE, mode='a', header=False, index=False, encoding="utf-8-sig")

def get_all_logs():
    if not os.path.exists(LOG_FILE):
        return pd.DataFrame()
    
    try:
        df = pd.read_csv(LOG_FILE, encoding="utf-8-sig")
        df = df.sort_values(by="timestamp", ascending=False)
        return df
    except Exception as e:
        print(f"로그 파일 읽기 오류: {e}")
        return pd.DataFrame()