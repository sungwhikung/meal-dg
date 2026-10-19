
import json
import os
import calendar
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

API_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo"

SCHOOL_NAME = "논산대건고등학교"
OFFICE_CODE = "N10"
SCHOOL_CODE = "8140085"

API_KEY = os.environ.get("NEIS_API_KEY", "").strip()

if not API_KEY:
    raise RuntimeError(
        "NEIS_API_KEY가 없습니다. "
        "GitHub 저장소의 Actions Secrets 설정을 확인하세요."
    )

# GitHub Actions 실행 환경의 시간대와 관계없이 한국 날짜 사용
today = datetime.now(ZoneInfo("Asia/Seoul")).date()


def month_start(year, month):
    return datetime(year, month, 1).date()


def shift_month(year, month, delta):
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


# 이전 달 1일부터 다음 달 말일까지 가져오기
start_year, start_month = shift_month(
    today.year, today.month, -1
)
end_year, end_month = shift_month(
    today.year, today.month, 1
)

start_date = month_start(start_year, start_month)
last_day = calendar.monthrange(end_year, end_month)[1]
end_date = datetime(end_year, end_month, last_day).date()

params = {
    "KEY": API_KEY,
    "Type": "json",
    "ATPT_OFCDC_SC_CODE": OFFICE_CODE,
    "SD_SCHUL_CODE": SCHOOL_CODE,
    "MLSV_FROM_YMD": start_date.strftime("%Y%m%d"),
    "MLSV_TO_YMD": end_date.strftime("%Y%m%d"),
    "pIndex": "1",
    "pSize": "1000",
}

url = API_URL + "?" + urlencode(params)

request = Request(
    url,
    headers={"User-Agent": "NonsanDaegunMealSite/1.0"}
)

with urlopen(request, timeout=30) as response:
    result_data = json.loads(
        response.read().decode("utf-8")
    )

rows = []

if "RESULT" in result_data:
    result = result_data["RESULT"]
    code = result.get("CODE", "")
    message = result.get("MESSAGE", "")

    # 해당 기간에 등록된 급식이 없는 경우
    if code == "INFO-200":
        rows = []
    else:
        raise RuntimeError(
            f"NEIS API 오류: {code} - {message}"
        )
else:
    sections = result_data.get("mealServiceDietInfo", [])

    if len(sections) >= 2:
        rows = sections[1].get("row", []) or []

# 날짜와 끼니 순으로 정렬
rows.sort(
    key=lambda row: (
        row.get("MLSV_YMD", ""),
        row.get("MMEAL_SC_CODE", "")
    )
)

output = {
    "school": SCHOOL_NAME,
    "officeCode": OFFICE_CODE,
    "schoolCode": SCHOOL_CODE,
    "updatedAt": datetime.now(
        ZoneInfo("Asia/Seoul")
    ).isoformat(timespec="seconds"),
    "meals": rows
}

output_path = Path("meals.json")
output_path.write_text(
    json.dumps(output, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"학교: {SCHOOL_NAME}")
print(f"조회 기간: {start_date} ~ {end_date}")
print(f"수집한 급식 건수: {len(rows)}")
print(f"저장 위치: {output_path}")
