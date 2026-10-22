
/* ===== 급식 데이터 로딩 및 화면 표시 ===== */

function getTodayDateKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const part = (type) => parts.find(p => p.type === type).value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

let selectedMealDate = getTodayDateKey();
let mealData = [];

const MEAL_TYPES = [
  { code: "1", name: "아침", emoji: "🌅", time: "BREAKFAST" },
  { code: "2", name: "점심", emoji: "🍚", time: "LUNCH" },
  { code: "3", name: "저녁", emoji: "🌙", time: "DINNER" }
];

function mealDateKey(dateString) {
  return String(dateString || "").replaceAll("-", "");
}

function mealDateAdd(dateString, amount) {
  const date = parseDateKey(dateString);
  date.setDate(date.getDate() + amount);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function mealDateFormat(dateString) {
  const date = parseDateKey(dateString);

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function getMealRow(code, dateString) {
  const key = mealDateKey(dateString);

  return mealData.find((row) =>
    String(row.MLSV_YMD) === key &&
    String(row.MMEAL_SC_CODE) === code
  );
}

function createMealCard(meal, row) {
  const card = document.createElement("article");
  card.className = "meal-card";

  const top = document.createElement("div");
  top.className = "meal-card-top";

  const emoji = document.createElement("div");
  emoji.className = "meal-emoji";
  emoji.textContent = meal.emoji;

  const time = document.createElement("span");
  time.className = "meal-time";
  time.textContent = meal.time;

  top.append(emoji, time);

  const title = document.createElement("h3");
  title.textContent = meal.name;

  const subtitle = document.createElement("div");
  subtitle.className = "meal-subtitle";
  subtitle.textContent = row ? "오늘의 식단" : "등록된 식단 없음";

  card.append(top, title, subtitle);

  if (!row) {
    const none = document.createElement("p");
    none.className = "day-none";
    none.textContent = "이 날짜에는 등록된 급식 정보가 없습니다.";
    card.appendChild(none);
    return card;
  }

  const menu = document.createElement("ul");
  menu.className = "menu-list";

  String(row.DDISH_NM || "")
    .split(/<br\s*\/?>/i)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      menu.appendChild(li);
    });

  card.appendChild(menu);

  const calories = document.createElement("div");
  calories.className = "meal-calories";
  calories.textContent = row.CAL_INFO
    ? `총 열량 · ${row.CAL_INFO}`
    : "열량 정보 없음";

  card.appendChild(calories);

  return card;
}

function renderMealDay() {
  const cards = $("mealCards");
  if (!cards) return;

  const selectedDateElement = $("selectedDate");
  const dateLabel = $("dateLabel");

  if (selectedDateElement) {
    selectedDateElement.textContent = mealDateFormat(selectedMealDate);
  }

  if (dateLabel) {
    dateLabel.textContent = "선택한 날짜";
  }

  cards.replaceChildren(
    ...MEAL_TYPES.map((meal) =>
      createMealCard(meal, getMealRow(meal.code, selectedMealDate))
    )
  );

  renderMealWeek();
}

function renderMealWeek() {
  const head = $("weekHead");
  const body = $("weekTable");

  if (!head || !body) return;

  const date = parseDateKey(selectedMealDate);
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;

  date.setDate(date.getDate() + offset);

  const monday = dateKey(date);
  const friday = mealDateAdd(monday, 4);

  if ($("weekLabel")) {
    $("weekLabel").textContent =
      `${monday.slice(5).replace("-", "/")} ~ ${friday.slice(5).replace("-", "/")}`;
  }

  head.replaceChildren();
  body.replaceChildren();

  const headerRow = document.createElement("tr");

  ["날짜", "아침", "점심", "저녁"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });

  head.appendChild(headerRow);

  for (let i = 0; i < 5; i++) {
    const currentDate = mealDateAdd(monday, i);
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent =
      `${currentDate.slice(5).replace("-", "/")} (${["월", "화", "수", "목", "금"][i]})`;
    row.appendChild(dateCell);

    MEAL_TYPES.forEach((meal) => {
      const cell = document.createElement("td");
      const mealRow = getMealRow(meal.code, currentDate);

      if (mealRow) {
        cell.textContent = String(mealRow.DDISH_NM || "")
          .split(/<br\s*\/?>/i)
          .map((item) => item.trim())
          .filter(Boolean)
          .join(", ");
      } else {
        cell.textContent = "급식 없음";
      }

      row.appendChild(cell);
    });

    body.appendChild(row);
  }
}

async function loadMealData() {
  const cards = $("mealCards");

  try {
    if (cards) {
      cards.innerHTML =
        '<p class="status">급식 데이터를 불러오는 중...</p>';
    }

    const response = await fetch("./meals.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`meals.json 요청 실패: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.meals)) {
      throw new Error("meals.json에 meals 배열이 없습니다.");
    }

    mealData = data.meals;

    const updatedAt = $("updatedAt");
    if (updatedAt) {
      updatedAt.textContent = data.updatedAt
        ? data.updatedAt
        : "갱신 시각 정보 없음";
    }

    renderMealDay();
  } catch (error) {
    console.error("[대건밀 급식 로딩 오류]", error);

    if (cards) {
      const message = document.createElement("p");
      message.className = "status";
      message.textContent =
        "급식을 불러오지 못했습니다. 페이지를 새로고침하거나 데이터 파일을 확인해 주세요.";
      cards.replaceChildren(message);
    }

    const body = $("weekTable");
    if (body) {
      body.innerHTML =
        '<tr><td colspan="4">주간 급식 데이터를 불러오지 못했습니다.</td></tr>';
    }

    const updatedAt = $("updatedAt");
    if (updatedAt) updatedAt.textContent = "데이터 연결 오류";
  }
}

function setupMealNavigation() {
  $("prevDay")?.addEventListener("click", () => {
    selectedMealDate = mealDateAdd(selectedMealDate, -1);
    renderMealDay();
  });

  $("nextDay")?.addEventListener("click", () => {
    selectedMealDate = mealDateAdd(selectedMealDate, 1);
    renderMealDay();
  });

  $("todayBtn")?.addEventListener("click", () => {
    selectedMealDate = dateKey(new Date());
    renderMealDay();
  });

  $("prevWeek")?.addEventListener("click", () => {
    selectedMealDate = mealDateAdd(selectedMealDate, -7);
    renderMealDay();
  });

  $("nextWeek")?.addEventListener("click", () => {
    selectedMealDate = mealDateAdd(selectedMealDate, 7);
    renderMealDay();
  });
}

setupMealNavigation();
loadMealData();
