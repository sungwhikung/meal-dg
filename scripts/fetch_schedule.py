import json
import os
import calendar
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
    raise RuntimeError("NEIS_API_KEY Secret이 없습니다.")

today = datetime.now(ZoneInfo("Asia/Seoul")).date()


def shift_month(year, month, delta):
    index = year * 12 + month - 1 + delta
    return index // 12, index % 12 + 1


start_year, start_month = shift_month(today.year, today.month, -1)
end_year, end_month = shift_month(today.year, today.month, 12)

start_date = date(start_year, start_month, 1)
end_date = date(
    end_year,
    end_month,
    calendar.monthrange(end_year, end_month)[1]
)

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
request = Request(url, headers={"User-Agent": "DaegunMealSite/1.0"})

with urlopen(request, timeout=30) as response:
    payload = json.loads(response.read().decode("utf-8"))

if "RESULT" in payload:
    result = payload["RESULT"]
    if result.get("CODE") == "INFO-200":
        rows = []
    else:
        raise RuntimeError(
            f"NEIS 학사일정 오류: "
            f"{result.get('CODE')} - {result.get('MESSAGE')}"
        )
else:
    sections = payload.get("SchoolSchedule", [])
    rows = sections[1].get("row", []) if len(sections) >= 2 else []

events = []
for row in rows:
    raw_date = row.get("AA_YMD", "")
    if len(raw_date) != 8:
        continue

    events.append({
        "date": (
            f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"
        ),
        "title": row.get("EVENT_NM") or "학교 일정",
        "content": row.get("EVENT_CNTNT") or "",
        "schoolDayType": row.get("SBTR_DD_SC_NM") or "",
        "grade1": row.get("ONE_GRADE_EVENT_YN") or "",
        "grade2": row.get("TW_GRADE_EVENT_YN") or "",
        "grade3": row.get("THREE_GRADE_EVENT_YN") or "",
    })

events.sort(key=lambda item: (item["date"], item["title"]))

output = {
    "school": SCHOOL_NAME,
    "updatedAt": datetime.now(
        ZoneInfo("Asia/Seoul")
    ).isoformat(timespec="seconds"),
    "events": events,
}

Path("schedule.json").write_text(
    json.dumps(output, ensure_ascii=False, indent=2),
    encoding="utf-8",
)

print(f"학교: {SCHOOL_NAME}")
print(f"조회 기간: {start_date} ~ {end_date}")
print(f"수집한 학사일정: {len(events)}건")
