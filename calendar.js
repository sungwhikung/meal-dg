/* 대건밀 - 급식 / 학사일정 / 개인 메모 / 공지사항
   이 파일 전체를 기존 calendar.js와 교체하세요. */

const $ = (id) => document.getElementById(id);
const KST = "Asia/Seoul";
const MEAL_TYPES = [
  { name: "아침", code: "1" },
  { name: "점심", code: "2" },
  { name: "저녁", code: "3" }
];
const WEEK_DAYS = 7; // 기숙사 운영으로 주말에도 급식이 있어 월~일 모두 표시

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function parseISO(value) {
  const [y, m, d] = String(value || todayISO()).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}
function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDate(value, days) {
  const date = parseISO(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}
function formatDate(value, options = { year: "numeric", month: "long", day: "numeric", weekday: "long" }) {
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone: KST }).format(parseISO(value));
}
function dateOnly(raw) {
  const value = String(raw ?? "");
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return value.slice(0, 10);
}

let selectedDate = todayISO();
let weekOffset = 0;
let meals = [];
let schedules = [];
let publicMemos = [];
let calendarMonth = new Date(parseISO(todayISO()).getFullYear(), parseISO(todayISO()).getMonth(), 1, 12);
let selectedCalendarDate = todayISO();
let firebaseAuth = null;
let firestore = null;
let currentUser = null;
const ADMIN_UID = "mxrtFi3CiGca2DCafbRlalT1eHB3";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9dG8K4sTonjhEM9xrF1j8GtXJt1cGIkI",
  authDomain: "meal-dg.firebaseapp.com",
  projectId: "meal-dg",
  storageBucket: "meal-dg.firebasestorage.app",
  messagingSenderId: "236989701948",
  appId: "1:236989701948:web:91efb2a5946bfd77e00839",
  measurementId: "G-MYLEFMEGK8"
};

/* 페이지 이동: 다른 기능의 오류와 분리해 먼저 연결 */
function setupNavigation() {
  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.page;
      document.querySelectorAll(".nav-button").forEach(item => item.classList.toggle("active", item === button));
      document.querySelectorAll(".page-section").forEach(section => section.classList.toggle("active", section.id === `page-${target}`));
      if (target === "calendar") renderCalendar();
      if (target === "notices") loadPublicMemos();
    });
  });
}

/* 급식 데이터 */
function normalizeMeals(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.meals)) return json.meals;
  if (Array.isArray(json?.mealServiceDietInfo)) return json.mealServiceDietInfo.flatMap(x => x?.row || []);
  if (Array.isArray(json?.data)) return json.data;
  return [];
}
function mealType(item) {
  const code = String(item.MMEAL_SC_CODE ?? item.mealCode ?? "");
  const label = String(item.MMEAL_SC_NM ?? item.mealType ?? item.type ?? item.mealName ?? "").toLowerCase();
  if (code === "1" || /조식|아침|breakfast/.test(label)) return "아침";
  if (code === "2" || /중식|점심|lunch/.test(label)) return "점심";
  if (code === "3" || /석식|저녁|dinner/.test(label)) return "저녁";
  return "";
}
function parseMenu(raw) {
  if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean);
  return String(raw ?? "")
    .split(/<br\s*\/?\s*>|\r?\n/gi)
    .map(item => item.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function getMeal(date, type) {
  return meals.find(item => item._date === date && item._type === type);
}
function weekendClass(date) {
  const day = parseISO(date).getDay();
  return day === 0 ? "sun" : day === 6 ? "sat" : "";
}
function kcal(item) {
  const value = parseFloat(String(item?.CAL_INFO ?? ""));
  return Number.isFinite(value) ? `${Math.round(value)} kcal` : "";
}
function renderMeals() {
  const cards = $("mealCards");
  if (!cards) return;
  if ($("selectedDate")) {
    $("selectedDate").textContent = formatDate(selectedDate, { month: "long", day: "numeric", weekday: "short" });
    $("selectedDate").className = weekendClass(selectedDate);
  }
  if ($("dateLabel")) $("dateLabel").textContent = selectedDate === todayISO() ? "오늘" : "";

  const items = MEAL_TYPES.map(type => ({ type, item: getMeal(selectedDate, type.name) }));
  if (!items.some(entry => entry.item)) {
    cards.innerHTML = '<p class="placeholder">이 날은 등록된 급식이 없습니다.</p>';
    return;
  }
  cards.innerHTML = items.map(({ type, item }) => {
    const menu = item?._menu || [];
    const menuHTML = menu.length
      ? `<ul class="meal-menu">${menu.map(name => `<li>${escapeHTML(name)}</li>`).join("")}</ul>`
      : `<p class="meal-empty">없음</p>`;
    return `<article class="meal-card"><div class="meal-card-top"><h2 class="meal-name">${type.name}</h2><span class="meal-calories">${kcal(item)}</span></div>${menuHTML}</article>`;
  }).join("");
}
function mondayOf(date) {
  const result = new Date(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  result.setHours(12, 0, 0, 0);
  return result;
}
function renderWeek() {
  const head = $("weekHead");
  const body = $("weekTable");
  if (!head || !body) return;
  const monday = mondayOf(parseISO(todayISO()));
  monday.setDate(monday.getDate() + weekOffset * 7);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return isoDate(date);
  });
  const short = { month: "numeric", day: "numeric" };
  const cellClass = date => [weekendClass(date), date === todayISO() ? "day-current" : ""].filter(Boolean).join(" ");
  if ($("weekLabel")) $("weekLabel").textContent = `${formatDate(dates[0], short)} – ${formatDate(dates[dates.length - 1], short)}`;
  head.innerHTML = `<tr><th></th>${dates.map(date => `<th class="${cellClass(date)}"><strong>${formatDate(date, { weekday: "short" })}</strong>${formatDate(date, short)}</th>`).join("")}</tr>`;
  body.innerHTML = MEAL_TYPES.map(type => `<tr><th>${type.name}</th>${dates.map(date => {
    const menu = getMeal(date, type.name)?._menu?.join("\n") || "—";
    return `<td class="week-menu ${date === todayISO() ? "day-current" : ""}">${escapeHTML(menu)}</td>`;
  }).join("")}</tr>`).join("");
}
async function loadMeals() {
  const cards = $("mealCards");
  if (cards) cards.innerHTML = '<p class="placeholder">불러오는 중…</p>';
  try {
    const response = await fetch(`./meals.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`meals.json HTTP ${response.status}`);
    const json = await response.json();
    const rawRows = normalizeMeals(json);
    meals = rawRows.map(item => ({
      ...item,
      _date: dateOnly(item.MLSV_YMD ?? item.date ?? item.mealDate ?? item.ymd ?? item.YMD),
      _type: mealType(item),
      _menu: parseMenu(item.DDISH_NM ?? item.menu ?? item.dishes ?? item.meal ?? item.MENU)
    })).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item._date) && item._type);
    if (!meals.length) throw new Error("meals.json에 사용할 수 있는 급식 행이 없습니다.");
    if ($("updatedAt")) {
      const updated = json.updatedAt ? new Date(json.updatedAt) : new Date();
      $("updatedAt").textContent = Number.isNaN(updated.getTime())
        ? String(json.updatedAt || "데이터 확인됨")
        : updated.toLocaleString("ko-KR", { timeZone: KST, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    renderMeals();
    renderWeek();
    console.info(`[대건밀] 급식 데이터 ${meals.length}건 로드 완료`);
  } catch (error) {
    console.error("[대건밀] 급식 로딩 실패:", error);
    meals = [];
    if (cards) {
      cards.innerHTML = `<p class="placeholder">급식을 불러오지 못했습니다.<br><small>${escapeHTML(error.message || "데이터 파일을 확인해 주세요.")}</small></p>`;
    }
    if ($("updatedAt")) $("updatedAt").textContent = "데이터 연결 오류";
    renderWeek();
  }
}
function setupMealButtons() {
  // 날짜를 넘기면 주간 식단도 그 날짜가 속한 주로 따라간다
  const goTo = date => {
    selectedDate = date;
    const diff = Math.round((mondayOf(parseISO(date)) - mondayOf(parseISO(todayISO()))) / 864e5);
    weekOffset = Math.round(diff / 7);
    renderMeals();
    renderWeek();
  };
  $("prevDay")?.addEventListener("click", () => goTo(shiftDate(selectedDate, -1)));
  $("nextDay")?.addEventListener("click", () => goTo(shiftDate(selectedDate, 1)));
  $("todayBtn")?.addEventListener("click", () => goTo(todayISO()));
  $("prevWeek")?.addEventListener("click", () => { weekOffset--; renderWeek(); });
  $("nextWeek")?.addEventListener("click", () => { weekOffset++; renderWeek(); });
}

/* 학사일정 */
async function loadSchedules() {
  try {
    const response = await fetch(`./schedule.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`schedule.json HTTP ${response.status}`);
    const json = await response.json();
    const rows = Array.isArray(json) ? json : (json.schedules || json.schedule || json.data || []);
    schedules = rows.map(item => ({
      date: dateOnly(item.AA_YMD ?? item.date ?? item.startDate ?? item.SCHUL_DATE),
      title: item.EVENT_NM ?? item.title ?? item.event ?? item.SCHUL_NM ?? "학교 일정",
      content: item.EVENT_CNTNT ?? item.content ?? item.description ?? ""
    })).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  } catch (error) {
    console.warn("[대건밀] schedule.json을 불러오지 못했습니다. 일정 목록은 비어 있을 수 있습니다.", error);
    schedules = [];
  }
  renderCalendar();
}
function getPersonalMemos() {
  try { return JSON.parse(localStorage.getItem("daegeonPersonalMemos") || "{}"); }
  catch { return {}; }
}
function shortText(value, max = 18) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function renderCalendar() {
  const grid = $("calendarGrid");
  if (!grid) return;
  if ($("calendarMonth")) $("calendarMonth").textContent = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: KST }).format(calendarMonth);
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const memos = getPersonalMemos();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = isoDate(date);
    const inMonth = date.getMonth() === calendarMonth.getMonth();
    const daySchedules = schedules.filter(item => item.date === key);
    const dayNotices = publicMemos.filter(item => String(item.date || "").slice(0, 10) === key);
    const labels = [
      ...daySchedules.slice(0, 2).map(item => `<span class="calendar-event school-event" title="${escapeHTML(item.title)}">${escapeHTML(shortText(item.title, 16))}</span>`),
      ...dayNotices.slice(0, 2).map(item => `<span class="calendar-event notice-event" title="${escapeHTML(item.title || "공지")}">${escapeHTML(shortText(item.title || "공지", 13))}</span>`)
    ];
    const total = daySchedules.length + dayNotices.length;
    if (total > 4) labels.push(`<span class="calendar-more">+${total - 4}개 더</span>`);
    cells.push(`<button type="button" class="calendar-day ${inMonth ? "" : "outside"} ${key === todayISO() ? "today" : ""} ${key === selectedCalendarDate ? "selected" : ""} ${weekendClass(key)}" data-date="${key}"><span class="day-number">${date.getDate()}</span><span class="calendar-events">${labels.join("")}</span>${memos[key] ? '<span class="personal-indicator">메모</span>' : ""}</button>`);
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll("button[data-date]").forEach(button => button.addEventListener("click", () => {
    selectedCalendarDate = button.dataset.date;
    const date = parseISO(selectedCalendarDate);
    calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    if ($("personalMemoDate")) $("personalMemoDate").value = selectedCalendarDate;
    loadMemoIntoEditor();
    renderCalendar();
    renderSelectedSchedule();
  }));
  renderSelectedSchedule();
}
function renderSelectedSchedule() {
  if (!$ ("scheduleDetails")) return;
  if ($("selectedCalendarDate")) $("selectedCalendarDate").textContent = formatDate(selectedCalendarDate);
  const daySchedules = schedules.filter(item => item.date === selectedCalendarDate);
  const dayNotices = publicMemos.filter(item => String(item.date || "").slice(0, 10) === selectedCalendarDate);
  const scheduleHTML = daySchedules.map(item => `<div class="schedule-item"><span class="detail-kind school-kind">학사일정</span><strong>${escapeHTML(item.title)}</strong>${item.content ? `<p>${escapeHTML(item.content)}</p>` : ""}</div>`).join("");
  const noticeHTML = dayNotices.map(item => `<div class="schedule-item notice-schedule-item"><span class="detail-kind notice-kind">공지사항</span><strong>${escapeHTML(item.title || "제목 없음")}</strong>${item.content ? `<p>${escapeHTML(shortText(item.content, 150))}</p>` : ""}</div>`).join("");
  $("scheduleDetails").innerHTML = scheduleHTML + noticeHTML || '<p class="empty-state">이 날짜에 등록된 학사일정이나 공지사항이 없습니다.</p>';
}
function loadMemoIntoEditor() {
  const memos = getPersonalMemos();
  if ($("personalMemoText")) $("personalMemoText").value = memos[selectedCalendarDate] || "";
  if ($("personalMemoStatus")) $("personalMemoStatus").textContent = "";
}
function setupCalendarButtons() {
  $("calendarPrev")?.addEventListener("click", () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
  $("calendarNext")?.addEventListener("click", () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });
  $("calendarToday")?.addEventListener("click", () => {
    selectedCalendarDate = todayISO();
    const date = parseISO(selectedCalendarDate);
    calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    if ($("personalMemoDate")) $("personalMemoDate").value = selectedCalendarDate;
    loadMemoIntoEditor();
    renderCalendar();
  });
  if ($("personalMemoDate")) {
    $("personalMemoDate").value = selectedCalendarDate;
    $("personalMemoDate").addEventListener("change", () => {
      if (!$("personalMemoDate").value) return;
      selectedCalendarDate = $("personalMemoDate").value;
      const date = parseISO(selectedCalendarDate);
      calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1, 12);
      loadMemoIntoEditor(); renderCalendar();
    });
  }
  $("savePersonalMemo")?.addEventListener("click", () => {
    const date = $("personalMemoDate")?.value || selectedCalendarDate;
    const value = $("personalMemoText")?.value.trim() || "";
    const memos = getPersonalMemos();
    if (value) memos[date] = value; else delete memos[date];
    localStorage.setItem("daegeonPersonalMemos", JSON.stringify(memos));
    selectedCalendarDate = date;
    if ($("personalMemoStatus")) $("personalMemoStatus").textContent = "이 기기에 메모를 저장했어요.";
    renderCalendar();
  });
  $("deletePersonalMemo")?.addEventListener("click", () => {
    const date = $("personalMemoDate")?.value || selectedCalendarDate;
    const memos = getPersonalMemos(); delete memos[date];
    localStorage.setItem("daegeonPersonalMemos", JSON.stringify(memos));
    if ($("personalMemoText")) $("personalMemoText").value = "";
    if ($("personalMemoStatus")) $("personalMemoStatus").textContent = "메모를 삭제했어요.";
    renderCalendar();
  });
}

/* Firebase 공지사항: Firebase 연결 실패가 급식/달력 작동을 막지 않도록 분리 */
function authStatus(message) { if ($("authStatus")) $("authStatus").textContent = message || ""; }
function editorStatus(message) { if ($("publicMemoEditorStatus")) $("publicMemoEditorStatus").textContent = message || ""; }
function isAdmin() { return Boolean(currentUser && currentUser.uid === ADMIN_UID); }
function updateAuthUI() {
  const loggedIn = Boolean(currentUser);
  if ($("authLoggedOut")) $("authLoggedOut").hidden = loggedIn;
  if ($("authLoggedIn")) $("authLoggedIn").hidden = !loggedIn;
  if ($("adminMemoEditor")) $("adminMemoEditor").hidden = !isAdmin();
  if ($("loggedInEmail")) $("loggedInEmail").textContent = currentUser?.email || "—";
  if ($("adminRoleStatus")) $("adminRoleStatus").textContent = !loggedIn ? "로그아웃 상태" : isAdmin() ? "관리자 권한 확인됨" : "로그인했지만 공지 작성 권한이 없습니다.";
}
function resetEditor() {
  if ($("publicMemoId")) $("publicMemoId").value = "";
  if ($("publicMemoDate")) $("publicMemoDate").value = todayISO();
  if ($("publicMemoTitle")) $("publicMemoTitle").value = "";
  if ($("publicMemoContent")) $("publicMemoContent").value = "";
  if ($("memoEditorTitle")) $("memoEditorTitle").textContent = "공지 작성";
  editorStatus("");
}
async function initFirebase() {
  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js");
    const dbModule = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    const app = appModule.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = authModule.getAuth(app);
    firestore = dbModule.getFirestore(app);
    authModule.onAuthStateChanged(firebaseAuth, user => {
      currentUser = user;
      updateAuthUI();
      authStatus(user && !isAdmin() ? "이 계정은 공지 작성 관리자 계정이 아닙니다." : "");
      loadPublicMemos();
    });
    setupNoticeButtons(authModule, dbModule);
  } catch (error) {
    console.error("[대건밀] Firebase 초기화 오류:", error);
    authStatus("공지 기능에 연결하지 못했습니다. 급식과 학사일정은 별도로 사용할 수 있습니다.");
    if ($("publicMemoList")) $("publicMemoList").innerHTML = '<p class="placeholder">공지 기능을 연결하지 못했습니다.</p>';
  }
}
async function loadPublicMemos() {
  if (!firestore) {
    if ($("publicMemoList")) $("publicMemoList").innerHTML = '<p class="placeholder">불러오는 중…</p>';
    return;
  }
  try {
    const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    const result = await getDocs(query(collection(firestore, "publicMemos"), orderBy("date", "desc")));
    publicMemos = result.docs.map(item => ({ id: item.id, ...item.data() }));
    renderPublicMemos(); renderCalendar();
  } catch (error) {
    console.error("[대건밀] 공지 로딩 오류:", error);
    if ($("publicMemoList")) $("publicMemoList").innerHTML = '<p class="placeholder">공지를 불러오지 못했습니다.</p>';
  }
}
function renderPublicMemos() {
  const list = $("publicMemoList");
  if (!list) return;
  if (!publicMemos.length) { list.innerHTML = '<p class="placeholder">등록된 공지가 없습니다.</p>'; return; }
  list.innerHTML = publicMemos.map(item => `<article class="notice-card"><div class="notice-card-head"><h3>${escapeHTML(item.title || "제목 없음")}</h3><time class="notice-date">${escapeHTML(item.date || "")}</time></div><p class="notice-content">${escapeHTML(item.content || "")}</p>${isAdmin() ? `<div class="notice-actions"><button class="text-button" data-edit="${escapeHTML(item.id)}">수정</button><button class="text-button" data-delete="${escapeHTML(item.id)}">삭제</button></div>` : ""}</article>`).join("");
  list.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => editPublicMemo(button.dataset.edit)));
  list.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => removePublicMemo(button.dataset.delete)));
}
function editPublicMemo(id) {
  if (!isAdmin()) return;
  const item = publicMemos.find(entry => entry.id === id); if (!item) return;
  $("publicMemoId").value = item.id;
  $("publicMemoDate").value = item.date || todayISO();
  $("publicMemoTitle").value = item.title || "";
  $("publicMemoContent").value = item.content || "";
  $("memoEditorTitle").textContent = "공지 수정";
  editorStatus(""); $("adminMemoEditor").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function removePublicMemo(id) {
  if (!isAdmin() || !confirm("이 공지사항을 삭제할까요?")) return;
  try {
    const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js");
    await deleteDoc(doc(firestore, "publicMemos", id));
    authStatus("공지사항을 삭제했습니다."); await loadPublicMemos();
  } catch (error) { console.error(error); authStatus("삭제에 실패했습니다. Firestore 보안 규칙을 확인해 주세요."); }
}
function setupNoticeButtons(authModule, dbModule) {
  $("adminLogin")?.addEventListener("click", async () => {
    const email = $("adminEmail")?.value.trim(); const password = $("adminPassword")?.value;
    if (!email || !password) { authStatus("이메일과 비밀번호를 입력해 주세요."); return; }
    try { await authModule.signInWithEmailAndPassword(firebaseAuth, email, password); authStatus("로그인되었습니다."); }
    catch (error) { console.error(error); authStatus("로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요."); }
  });
  $("adminLogout")?.addEventListener("click", async () => {
    try { await authModule.signOut(firebaseAuth); authStatus("로그아웃되었습니다."); }
    catch (error) { console.error(error); authStatus("로그아웃 중 오류가 발생했습니다."); }
  });
  $("savePublicMemo")?.addEventListener("click", async () => {
    if (!isAdmin()) { editorStatus("관리자 계정으로 로그인해야 합니다."); return; }
    const date = $("publicMemoDate").value;
    const title = $("publicMemoTitle").value.trim();
    const content = $("publicMemoContent").value.trim();
    const id = $("publicMemoId").value;
    if (!date || !title || !content) { editorStatus("날짜, 제목, 내용을 모두 입력해 주세요."); return; }
    try {
      const { collection, addDoc, doc, updateDoc, serverTimestamp } = dbModule;
      const fields = { date, title, content, updatedAt: serverTimestamp(), updatedBy: currentUser.uid };
      if (id) await updateDoc(doc(firestore, "publicMemos", id), fields);
      else await addDoc(collection(firestore, "publicMemos"), { ...fields, createdAt: serverTimestamp(), createdBy: currentUser.uid });
      resetEditor(); editorStatus("저장되었습니다."); await loadPublicMemos();
    } catch (error) { console.error(error); editorStatus("저장에 실패했습니다. Firestore 보안 규칙을 확인해 주세요."); }
  });
  $("cancelPublicMemo")?.addEventListener("click", resetEditor);
  $("reloadPublicMemos")?.addEventListener("click", loadPublicMemos);
}

/* 시작: 한 기능이 실패해도 다른 기능은 계속 작동 */
function startApp() {
  setupNavigation();
  setupMealButtons();
  setupCalendarButtons();
  renderMeals();
  renderWeek();
  renderCalendar();
  loadMeals();
  loadSchedules();
  initFirebase();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
