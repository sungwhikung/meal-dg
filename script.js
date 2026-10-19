
"use strict";

const $ = (id) => document.getElementById(id);

const MEALS = [
  { code: "1", name: "아침", emoji: "🌅", time: "BREAKFAST" },
  { code: "2", name: "점심", emoji: "🍚", time: "LUNCH" },
  { code: "3", name: "저녁", emoji: "🌙", time: "DINNER" }
];

let mealData = [];
let dataUpdatedAt = "";
let requestVersion = 0;

function getKoreanToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};
  parts.forEach(part => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDate(value) {
  const date = parseDate(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function formatShort(value) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function addDays(value, amount) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function mondayOf(value) {
  const date = parseDate(value);
  const weekday = date.getDay();
  const difference = weekday === 0 ? -6 : 1 - weekday;

  date.setDate(date.getDate() + difference);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateKey(value) {
  return value.replaceAll("-", "");
}

function getMealsForDate(value) {
  const key = dateKey(value);

  return mealData.filter(row =>
    row.MLSV_YMD === key
  );
}

function getMeal(code, value) {
  return getMealsForDate(value).find(row =>
    String(row.MMEAL_SC_CODE) === code
  );
}

function parseMenu(text = "") {
  return text
    .split(/<br\s*\/?>/i)
    .map(item => item.trim())
    .filter(Boolean);
}

function cleanMenu(text) {
  // 알레르기 번호를 보존하기 위해 괄호 내용은 삭제하지 않는다.
  return text.replace(/\s+/g, " ").trim();
}

function makeMenuList(items, className = "menu-list") {
  const list = document.createElement("ul");
  list.className = className;

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = cleanMenu(item);
    list.appendChild(li);
  });

  return list;
}

function showStatus(element, message) {
  element.replaceChildren();

  const p = document.createElement("p");
  p.className = "status";
  p.textContent = message;

  element.appendChild(p);
}

function makeMealCard(meal, row) {
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

  if (row) {
    card.appendChild(makeMenuList(parseMenu(row.DDISH_NM)));

    const calories = document.createElement("div");
    calories.className = "meal-calories";
    calories.textContent = row.CAL_INFO
      ? `총 열량 · ${row.CAL_INFO}`
      : "열량 정보가 제공되지 않습니다.";

    card.appendChild(calories);
  } else {
    const none = document.createElement("p");
    none.className = "day-none";
    none.textContent = "이 날짜에는 등록된 급식 정보가 없습니다.";
    card.appendChild(none);
  }

  return card;
}

function renderDaily() {
  const selected = $("selectedDate").value;
  if (!selected) return;

  $("dateLabel").textContent = formatDate(selected);

  const cards = MEALS.map(meal =>
    makeMealCard(meal, getMeal(meal.code, selected))
  );

  $("mealCards").replaceChildren(...cards);
}

function makeDayCard(value) {
  const card = document.createElement("article");
  card.className = "day-card";

  if (value === getKoreanToday()) {
    card.classList.add("today");
  }

  const header = document.createElement("div");
  header.className = "day-card-header";

  const date = parseDate(value);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "long"
  }).format(date);

  const dayName = document.createElement("h3");
  dayName.className = "day-name";
  dayName.textContent = weekday;

  const dayDate = document.createElement("div");
  dayDate.className = "day-date";
  dayDate.textContent = formatShort(value);

  header.append(dayName, dayDate);
  card.appendChild(header);

  MEALS.forEach(meal => {
    const section = document.createElement("div");
    section.className = "day-meal";

    const label = document.createElement("div");
    label.className = "day-meal-label";
    label.textContent = meal.name;
    section.appendChild(label);

    const row = getMeal(meal.code, value);

    if (row) {
      section.appendChild(
        makeMenuList(parseMenu(row.DDISH_NM), "day-menu")
      );
    } else {
      const none = document.createElement("div");
      none.className = "day-none";
      none.textContent = "등록된 식단 없음";
      section.appendChild(none);
    }

    card.appendChild(section);
  });

  return card;
}

function renderWeekly() {
  const selected = $("selectedDate").value;
  if (!selected) return;

  const monday = mondayOf(selected);
  const friday = addDays(monday, 4);

  $("weekLabel").textContent =
    `${formatShort(monday)} ~ ${formatShort(friday)}`;

  const cards = [];

  for (let i = 0; i < 5; i++) {
    cards.push(makeDayCard(addDays(monday, i)));
  }

  $("weekTable").replaceChildren(...cards);
}

function renderAll() {
  renderDaily();
  renderWeekly();
}

async function loadMealData() {
  const currentVersion = ++requestVersion;

  showStatus($("mealCards"), "급식 데이터를 불러오는 중...");
  showStatus($("weekTable"), "주간 식단을 불러오는 중...");

  try {
    const response = await fetch("./meals.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`데이터 파일 요청 실패 (${response.status})`);
    }

    const data = await response.json();

    if (currentVersion !== requestVersion) return;

    if (!Array.isArray(data.meals)) {
      throw new Error("급식 데이터 형식이 올바르지 않습니다.");
    }

    mealData = data.meals;
    dataUpdatedAt = data.updatedAt || "";

    $("updatedAt").textContent = dataUpdatedAt
      ? `데이터 기준일: ${dataUpdatedAt}`
      : "데이터 갱신 시각 정보 없음";

    renderAll();
  } catch (error) {
    if (currentVersion !== requestVersion) return;

    const message =
      "급식 데이터를 불러오지 못했습니다. " +
      "잠시 후 다시 시도하거나 GitHub Actions 실행 상태를 확인해 주세요.";

    showStatus($("mealCards"), message);
    showStatus($("weekTable"), message);
    $("updatedAt").textContent = "데이터 연결 오류";
    console.error(error);
  }
}

function selectDate(value) {
  $("selectedDate").value = value;
  renderAll();
}

$("selectedDate").value = getKoreanToday();

$("selectedDate").addEventListener("change", renderAll);

$("prevDay").addEventListener("click", () => {
  selectDate(addDays($("selectedDate").value, -1));
});

$("nextDay").addEventListener("click", () => {
  selectDate(addDays($("selectedDate").value, 1));
});

$("todayBtn").addEventListener("click", () => {
  selectDate(getKoreanToday());
});

$("prevWeek").addEventListener("click", () => {
  selectDate(addDays($("selectedDate").value, -7));
});

$("nextWeek").addEventListener("click", () => {
  selectDate(addDays($("selectedDate").value, 7));
});

loadMealData();
