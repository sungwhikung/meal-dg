
import json
import os
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

API_URL = "https://open.neis.go.kr/hub/SchoolSchedule"

SCHOOL_NAME = "논산대건고등학교"
OFFICE_CODE = "N10"
SCHOOL_CODE = "8140085"

API_KEY = os.environ.get("NEIS_API_KEY", "").strip()

if not API_KEY:
    raise RuntimeError(
        "NEIS_API_KEY가 없습니다. GitHub Actions Secrets를 확인하세요."
    )

today = datetime.now(ZoneInfo("Asia/Seoul")).date()
start_date = date(today.year, 1, 1)
end_date = date(today.year + 1, 12, 31)

params = {
    "KEY": API_KEY,
    "Type": "json",
    "ATPT_OFCDC_SC_CODE": OFFICE_CODE,
    "SD_SCHUL_CODE": SCHOOL_CODE,
    "AA_FROM_YMD": start_date.strftime("%Y%m%d"),
    "AA_TO_YMD": end_date.strftime("%Y%m%d"),
    "pIndex": "1",
    "pSize": "1000",
}

url = API_URL + "?" + urlencode(params)

request = Request(
    url,
    headers={"User-Agent": "NonsanDaegunMealSite/1.0"}
)

with urlopen(request, timeout=30) as response:
    payload = json.loads(response.read().decode("utf-8"))

rows = []

if "RESULT" in payload:
    result = payload["RESULT"]
    code = result.get("CODE", "")
    message = result.get("MESSAGE", "")

    if code != "INFO-200":
        raise RuntimeError(f"NEIS 학사일정 API 오류: {code} - {message}")
else:
    sections = payload.get("SchoolSchedule", [])
    if len(sections) >= 2:
        rows = sections[1].get("row", []) or []

rows.sort(
    key=lambda row: (
        row.get("AA_YMD", ""),
        row.get("EVENT_NM", "")
    )
)

output = {
    "school": SCHOOL_NAME,
    "officeCode": OFFICE_CODE,
    "schoolCode": SCHOOL_CODE,
    "updatedAt": datetime.now(
        ZoneInfo("Asia/Seoul")
    ).isoformat(timespec="seconds"),
    "schedules": rows
}

output_path = Path("schedule.json")
output_path.write_text(
    json.dumps(output, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"학교: {SCHOOL_NAME}")
print(f"조회 기간: {start_date} ~ {end_date}")
print(f"수집한 학사일정 건수: {len(rows)}")
print(f"저장 위치: {output_path}")
