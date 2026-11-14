import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

# 학교 구글 캘린더의 "자감: 1학년/2학년/3학년" 일정에서 한 학년의 자습 감독만 뽑는다
CALENDAR_ID = "nonsandaegeon.cnehs.kr_classrooma4e248e6@group.calendar.google.com"
API_URL = (
    "https://www.googleapis.com/calendar/v3/calendars/"
    + quote(CALENDAR_ID, safe="")
    + "/events"
)
GRADE = 2
KEYWORD = "자감"

API_KEY = os.environ.get("SCHEDULE_API_KEY", "").strip()

if not API_KEY:
    raise RuntimeError(
        "SCHEDULE_API_KEY가 없습니다. "
        "GitHub 저장소의 Actions Secrets 설정을 확인하세요."
    )

today = datetime.now(ZoneInfo("Asia/Seoul")).date()

# 이번 달 1일부터 약 두 달 뒤까지
start_date = today.replace(day=1)
end_date = today + timedelta(days=62)


def fetch_events():
    events = []
    page_token = ""

    while True:
        params = {
            "key": API_KEY,
            "singleEvents": "true",
            "orderBy": "startTime",
            "timeZone": "Asia/Seoul",
            "timeMin": f"{start_date.isoformat()}T00:00:00+09:00",
            "timeMax": f"{end_date.isoformat()}T00:00:00+09:00",
            "maxResults": "2500",
        }
        if page_token:
            params["pageToken"] = page_token

        request = Request(
            API_URL + "?" + urlencode(params),
            headers={"User-Agent": "NonsanDaegunMealSite/1.0"}
        )

        try:
            with urlopen(request, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            # 키가 주소에 들어 있으므로 URL은 출력하지 않는다
            detail = error.read().decode("utf-8", "replace")[:500]
            raise RuntimeError(
                f"구글 캘린더 API 오류: HTTP {error.code} {detail}"
            ) from None

        events.extend(data.get("items", []))
        page_token = data.get("nextPageToken", "")

        if not page_token:
            return events


def event_days(event):
    start = event.get("start", {})
    end = event.get("end", {})
    first = date.fromisoformat((start.get("date") or start.get("dateTime", ""))[:10])

    if start.get("date"):
        # 종일 일정의 종료일은 다음 날로 들어온다
        last = date.fromisoformat(end.get("date", start["date"])) - timedelta(days=1)
    else:
        last = date.fromisoformat((end.get("dateTime") or start["dateTime"])[:10])

    day = first
    while day <= max(first, last):
        yield day.isoformat()
        day += timedelta(days=1)


def supervisor_of(summary):
    # "자감: 김OO/이OO/박OO" → 학년 순서대로 나뉜 이름 중 GRADE 번째
    text = re.sub(rf"^.*?{KEYWORD}\s*[:：]?\s*", "", summary, count=1)
    parts = [part.strip() for part in text.split("/")]

    if len(parts) < GRADE:
        return ""

    return parts[GRADE - 1].strip(" -")


events = fetch_events()
supervisors = {}
samples = 0

for event in events:
    summary = event.get("summary", "")

    if KEYWORD not in summary:
        continue

    name = supervisor_of(summary)
    samples += 1

    if not name:
        continue

    for day in event_days(event):
        supervisors[day] = name

output = {
    "grade": GRADE,
    "updatedAt": datetime.now(
        ZoneInfo("Asia/Seoul")
    ).isoformat(timespec="seconds"),
    "supervisors": dict(sorted(supervisors.items()))
}

output_path = Path("supervisors.json")
output_path.write_text(
    json.dumps(output, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print(f"조회 기간: {start_date} ~ {end_date}")
print(f"캘린더 일정 수: {len(events)}")
print(f"'{KEYWORD}' 일정 수: {samples}")
print(f"{GRADE}학년 자습 감독이 있는 날: {len(supervisors)}")
print(f"저장 위치: {output_path}")
