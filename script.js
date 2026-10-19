
/*
 * 학교 설정
 * ATPT_OFCDC_SC_CODE: 시도교육청 코드
 * SD_SCHUL_CODE: 학교 코드
 *
 * 공개 저장소에 실제 인증키를 직접 올리지 마세요.
 */
const SCHOOL = {
  name: "우리 학교",
  officeCode: "여기에_교육청_코드",
  schoolCode: "여기에_학교_코드"
};

const API_KEY = ""; // 로컬 테스트용. 공개 저장소에 실제 키를 넣지 마세요.

const API_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo";

const mealNames = {
  "1": "아침",
  "2": "점심",
  "3": "저녁"
};

const mealEmojis = {
  "1": "🌅",
  "2": "🍚",
  "3": "🌙"
};

const $ = (id) => document.getElementById(id);

function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(value, amount) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return localDate(date);
}

function mondayOf(value) {
  const date = parseDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return localDate(date);
}

function formatDate(value) {
  const date = parseDate(value);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatShort(value) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function showStatus(element, message) {
  element.replaceChildren();
  const p = document.createElement("p");
  p.className = "status";
  p.textContent = message;
  element.appendChild(p);
}

function splitMenus(text = "") {
  return text
    .split(/<br\s*\/?>/i)
    .map(item => item.trim())
    .filter(Boolean);
}

function cleanMenu(text) {
  return text
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeMenuList(items) {
  const ul = document.createElement("ul");
  ul.className = "menu-list";

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = "• " + cleanMenu(item);
    ul.appendChild(li);
  });

  return ul;
}

function makeMealCard(code, row) {
  const card = document.createElement("article");
  card.className = "meal-card";

  const emoji = document.createElement("div");
  emoji.className = "emoji";
  emoji.textContent = mealEmojis[code];

  const title = document.createElement("h3");
  title.textContent = mealNames[code];

  const desc = document.createElement("p");
  desc.className = "muted";
  desc.textContent = row ? "오늘의 식단" : "급식 정보 없음";

  card.append(emoji, title, desc);

  if (row) {
    const menus = splitMenus(row.DDISH_NM || "");
    card.appendChild(makeMenuList(menus));

    const calories = document.createElement("p");
    calories.className = "calories";
    calories.textContent = row.CAL_INFO
      ? `열량 ${row.CAL_INFO}`
      : "열량 정보 없음";
    card.appendChild(calories);
  } else {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = "이 날짜에 등록된 식단이 없습니다.";
    card.appendChild(message);
  }

  return card;
}

async function fetchMeals(from, to) {
  const params = {
    Type: "json",
    ATPT_OFCDC_SC_CODE: SCHOOL.officeCode,
    SD_SCHUL_CODE: SCHOOL.schoolCode,
    MLSV_FROM_YMD: from.replaceAll("-", ""),
    MLSV_TO_YMD: to.replaceAll("-", ""),
    pSize: "1000"
  };

  if (API_KEY.trim()) params.KEY = API_KEY.trim();

  const query = new URLSearchParams(params);
  const response = await fetch(`${API_URL}?${query}`);

  if (!response.ok) {
    throw new Error(`서버 응답 오류 (${response.status})`);
  }

  const data = await response.json();

  if (!data.mealServiceDietInfo) {
    const result = data.RESULT || {};

    if (result.CODE === "INFO-200") return [];

    throw new Error(
      result.MESSAGE || "급식 정보를 가져오지 못했습니다."
    );
  }

  return data.mealServiceDietInfo[1]?.row || [];
}

function groupByDate(rows) {
  const grouped = {};

  rows.forEach(row => {
    const date = row.MLSV_YMD;
    const code = row.MMEAL_SC_CODE;

    if (!grouped[date]) grouped[date] = {};
    grouped[date][code] = row;
  });

  return grouped;
}

async function renderMeals() {
  const selected = $("selectedDate").value;
  if (!selected) return;

  $("dateLabel").textContent = formatDate(selected);
  showStatus($("mealCards"), "급식 정보를 불러오는 중...");

  try {
    const rows = await fetchMeals(selected, selected);
    const meals = groupByDate(rows)[selected.replaceAll("-", "")] || {};

    $("mealCards").replaceChildren(
      ...["1", "2", "3"].map(code =>
        makeMealCard(code, meals[code])
      )
    );
  } catch (error) {
    showStatus(
      $("mealCards"),
      `급식을 불러오지 못했습니다: ${error.message}`
    );
  }
}

async function renderWeek() {
  const selected = $("selectedDate").value;
  if (!selected) return;

  const start = mondayOf(selected);
  const end = shiftDate(start, 4);

  $("weekLabel").textContent =
    `${formatDate(start)} ~ ${formatDate(end)}`;

  showStatus($("weekTable"), "주간 식단을 불러오는 중...");

  try {
    const rows = await fetchMeals(start, end);
    const grouped = groupByDate(rows);

    const cards = Array.from({ length: 5 }, (_, i) => {
      const date = shiftDate(start, i);
      const key = date.replaceAll("-", "");
      const meals = grouped[key] || {};

      const card = document.createElement("article");
      card.className = "day-card";

      const title = document.createElement("h3");
      const weekday = ["월", "화", "수", "목", "금"][i];
      title.textContent = `${weekday}요일`;

      const dateText = document.createElement("p");
      dateText.className = "day-date";
      dateText.textContent = formatShort(date);

      card.append(title, dateText);

      ["1", "2", "3"].forEach(code => {
        const label = document.createElement("p");
        label.className = "meal-name";
        label.textContent = mealNames[code];

        card.appendChild(label);

        const row = meals[code];
        if (row) {
          card.appendChild(makeMenuList(splitMenus(row.DDISH_NM)));
        } else {
          const none = document.createElement("p");
          none.className = "muted";
          none.textContent = "등록된 식단 없음";
          card.appendChild(none);
        }
      });

      return card;
    });

    $("weekTable").replaceChildren(...cards);
  } catch (error) {
    showStatus(
      $("weekTable"),
      `주간 식단을 불러오지 못했습니다: ${error.message}`
    );
  }
}

async function renderAll() {
  await Promise.all([renderMeals(), renderWeek()]);
}

$("selectedDate").value = localDate();

$("selectedDate").addEventListener("change", renderAll);

$("prevDay").addEventListener("click", () => {
  $("selectedDate").value = shiftDate($("selectedDate").value, -1);
  renderAll();
});

$("nextDay").addEventListener("click", () => {
  $("selectedDate").value = shiftDate($("selectedDate").value, 1);
  renderAll();
});

$("todayBtn").addEventListener("click", () => {
  $("selectedDate").value = localDate();
  renderAll();
});

$("prevWeek").addEventListener("click", () => {
  $("selectedDate").value = shiftDate($("selectedDate").value, -7);
  renderAll();
});

$("nextWeek").addEventListener("click", () => {
  $("selectedDate").value = shiftDate($("selectedDate").value, 7);
  renderAll();
});

renderAll();
