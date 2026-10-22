
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* Firebase 설정 */
const firebaseConfig = {
  apiKey: "AIzaSyD9dG8K4sTonjhEM9xrF1j8GtXJt1cGIkI",
  authDomain: "meal-dg.firebaseapp.com",
  projectId: "meal-dg",
  storageBucket: "meal-dg.firebasestorage.app",
  messagingSenderId: "236989701948",
  appId: "1:236989701948:web:91efb2a5946bfd77e00839",
  measurementId: "G-MYLEFMEGK8"
};

const ADMIN_UID = "mxrtFi3CiGca2DCafbRlalT1eHB3";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const today = new Date();
today.setHours(0, 0, 0, 0);

let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = dateKey(today);
let schedules = [];
let publicMemos = [];
let currentUser = null;
let editingMemoId = null;

/* 날짜 처리 */
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function shortText(value = "", max = 32) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function formatDate(key) {
  const date = parseDateKey(key);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/* 페이지 메뉴 */
function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.page;

      document.querySelectorAll("[data-page]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      document.querySelectorAll(".page-section").forEach((section) => {
        section.classList.toggle("active", section.id === `page-${target}`);
      });

      if (target === "calendar") renderCalendar();
      if (target === "notices") renderPublicMemos();
    });
  });
}

/* 학사일정 데이터 읽기 */
async function loadSchedules() {
  try {
    const response = await fetch("./schedule.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error("schedule.json을 불러오지 못했습니다.");
    }

    const data = await response.json();
    schedules = Array.isArray(data) ? data : (data.schedules || []);
  } catch (error) {
    console.error("학사일정 로드 오류:", error);
    schedules = [];
  }

  renderCalendar();
}

/* 일정 날짜 및 제목 정리 */
function scheduleDate(item) {
  const raw = String(item.AA_YMD || item.date || "").replace(/\D/g, "");

  if (raw.length >= 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  return item.date || "";
}

function scheduleTitle(item) {
  return item.EVENT_NM || item.title || item.eventName || "학사일정";
}

function scheduleContent(item) {
  return item.EVENT_CNTNT || item.content || "";
}

function schedulesForDate(key) {
  return schedules.filter((item) => scheduleDate(item) === key);
}

function memosForDate(key) {
  return publicMemos.filter((memo) => memo.date === key);
}

/* 달력 렌더링 */
function renderCalendar() {
  const grid = $("calendarGrid");
  const monthLabel = $("calendarMonth");

  if (!grid || !monthLabel) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  monthLabel.textContent = `${year}년 ${month + 1}월`;
  grid.innerHTML = "";

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  weekdays.forEach((day) => {
    const heading = document.createElement("div");
    heading.className = "calendar-weekday";
    heading.textContent = day;
    grid.appendChild(heading);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const daySchedules = schedulesForDate(key);
    const dayMemos = memosForDate(key);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    if (key === dateKey(today)) cell.classList.add("today");
    if (key === selectedDate) cell.classList.add("selected");

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day);
    cell.appendChild(number);

    const items = document.createElement("div");
    items.className = "calendar-day-events";

    daySchedules.slice(0, 2).forEach((item) => {
      const event = document.createElement("span");
      event.className = "calendar-event schedule-event";
      event.textContent = shortText(scheduleTitle(item), 12);
      event.title = scheduleTitle(item);
      items.appendChild(event);
    });

    dayMemos.slice(0, 2).forEach((memo) => {
      const event = document.createElement("span");
      event.className = "calendar-event notice-event";
      event.textContent = shortText(`공지 ${memo.title}`, 12);
      event.title = memo.title || "공지사항";
      items.appendChild(event);
    });

    const total = daySchedules.length + dayMemos.length;
    if (total > 4) {
      const more = document.createElement("span");
      more.className = "calendar-event-more";
      more.textContent = `+${total - 4}`;
      items.appendChild(more);
    }

    cell.appendChild(items);
    cell.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();
      renderSelectedDate();
    });

    grid.appendChild(cell);
  }

  renderSelectedDate();
}

/* 선택한 날짜의 상세 정보 */
function renderSelectedDate() {
  const dateLabel = $("selectedCalendarDate");
  const details = $("scheduleDetails");

  if (dateLabel) dateLabel.textContent = formatDate(selectedDate);
  if (!details) return;

  const daySchedules = schedulesForDate(selectedDate);
  const dayMemos = memosForDate(selectedDate);

  let html = "";

  if (daySchedules.length) {
    html += `<div class="schedule-detail-group">
      <h3>📚 학사일정</h3>`;

    html += daySchedules.map((item) => `
      <article class="schedule-detail-item">
        <strong>${escapeHTML(scheduleTitle(item))}</strong>
        ${scheduleContent(item)
          ? `<p>${escapeHTML(shortText(scheduleContent(item), 120))}</p>`
          : ""}
      </article>
    `).join("");

    html += `</div>`;
  }

  if (dayMemos.length) {
    html += `<div class="schedule-detail-group">
      <h3>📢 공지사항</h3>`;

    html += dayMemos.map((memo) => `
      <article class="schedule-detail-item notice-detail-item">
        <strong>${escapeHTML(memo.title || "제목 없음")}</strong>
        <p>${escapeHTML(shortText(memo.content || "", 120))}</p>
      </article>
    `).join("");

    html += `</div>`;
  }

  if (!html) {
    html = `<p class="empty-message">이 날짜에는 등록된 학사일정이나 공지사항이 없습니다.</p>`;
  }

  details.innerHTML = html;

  const memoDate = $("personalMemoDate");
  if (memoDate) memoDate.value = selectedDate;
  loadPersonalMemo();
}

/* 달력 버튼 */
function setupCalendarButtons() {
  $("calendarPrev")?.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderCalendar();
  });

  $("calendarNext")?.addEventListener("click", () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderCalendar();
  });

  $("calendarToday")?.addEventListener("click", () => {
    calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDate = dateKey(today);
    renderCalendar();
  });
}

/* 개인 메모: 이 브라우저에 저장 */
function personalMemoKey(date) {
  return `daegeon-personal-memo-${date}`;
}

function loadPersonalMemo() {
  const textarea = $("personalMemoText");
  if (!textarea) return;

  textarea.value = localStorage.getItem(personalMemoKey(selectedDate)) || "";
}

function setupPersonalMemo() {
  $("savePersonalMemo")?.addEventListener("click", () => {
    const textarea = $("personalMemoText");
    const status = $("personalMemoStatus");
    if (!textarea) return;

    localStorage.setItem(personalMemoKey(selectedDate), textarea.value);

    if (status) status.textContent = "개인 메모를 이 기기에 저장했어요.";
  });

  $("deletePersonalMemo")?.addEventListener("click", () => {
    localStorage.removeItem(personalMemoKey(selectedDate));

    const textarea = $("personalMemoText");
    const status = $("personalMemoStatus");

    if (textarea) textarea.value = "";
    if (status) status.textContent = "개인 메모를 삭제했어요.";
  });
}

/* 로그인 상태 */
function setStatus(message) {
  const status = $("authStatus");
  if (status) status.textContent = message;
}

function updateAuthUI(user) {
  currentUser = user;

  const loggedOut = $("authLoggedOut");
  const loggedIn = $("authLoggedIn");
  const emailLabel = $("loggedInEmail");
  const roleStatus = $("adminRoleStatus");
  const editor = $("adminMemoEditor");

  const isAdmin = Boolean(user && user.uid === ADMIN_UID);

  if (loggedOut) loggedOut.hidden = Boolean(user);
  if (loggedIn) loggedIn.hidden = !user;
  if (emailLabel) emailLabel.textContent = user?.email || "";
  if (roleStatus) {
    roleStatus.textContent = isAdmin
      ? "관리자 권한이 확인되었습니다."
      : user
        ? "로그인했지만 관리자 권한은 없습니다."
        : "로그인 후 관리할 수 있습니다.";
  }
  if (editor) editor.hidden = !isAdmin;

  if (user) {
    setStatus(isAdmin ? "관리자로 로그인했습니다." : "일반 계정으로 로그인했습니다.");
  } else {
    setStatus("로그아웃 상태입니다.");
  }
}

function setupAuthentication() {
  $("adminLogin")?.addEventListener("click", async () => {
    const email = $("adminEmail")?.value.trim();
    const password = $("adminPassword")?.value;

    if (!email || !password) {
      setStatus("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if ($("adminPassword")) $("adminPassword").value = "";
    } catch (error) {
      console.error(error);
      setStatus("로그인 실패: 이메일과 비밀번호를 확인해 주세요.");
    }
  });

  $("adminLogout")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      setStatus("로그아웃에 실패했습니다.");
    }
  });

  onAuthStateChanged(auth, (user) => {
    updateAuthUI(user);
  });
}

/* 공지사항: Firestore */
async function loadPublicMemos() {
  try {
    const q = query(collection(db, "publicMemos"), orderBy("date", "desc"));
    const snapshot = await getDocs(q);

    publicMemos = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    renderPublicMemos();
    renderCalendar();
  } catch (error) {
    console.error("공지사항 불러오기 오류:", error);
    setStatus("공지사항을 불러오지 못했습니다. Firestore 규칙과 연결을 확인해 주세요.");
  }
}

function renderPublicMemos() {
  const list = $("publicMemoList");
  if (!list) return;

  if (!publicMemos.length) {
    list.innerHTML = `<p class="empty-message">등록된 공지사항이 없습니다.</p>`;
    return;
  }

  list.innerHTML = publicMemos.map((memo) => {
    const adminButtons = currentUser?.uid === ADMIN_UID
      ? `<div class="memo-actions">
          <button type="button" data-edit-memo="${escapeHTML(memo.id)}">수정</button>
          <button type="button" data-delete-memo="${escapeHTML(memo.id)}">삭제</button>
        </div>`
      : "";

    return `
      <article class="public-memo-card">
        <div class="memo-date">${escapeHTML(memo.date || "")}</div>
        <h3>${escapeHTML(memo.title || "제목 없음")}</h3>
        <p class="memo-content">${escapeHTML(memo.content || "")}</p>
        ${adminButtons}
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-edit-memo]").forEach((button) => {
    button.addEventListener("click", () => {
      editPublicMemo(button.dataset.editMemo);
    });
  });

  list.querySelectorAll("[data-delete-memo]").forEach((button) => {
    button.addEventListener("click", () => {
      deletePublicMemo(button.dataset.deleteMemo);
    });
  });
}

function resetMemoForm() {
  editingMemoId = null;

  if ($("publicMemoId")) $("publicMemoId").value = "";
  if ($("publicMemoDate")) $("publicMemoDate").value = selectedDate;
  if ($("publicMemoTitle")) $("publicMemoTitle").value = "";
  if ($("publicMemoContent")) $("publicMemoContent").value = "";
  if ($("memoEditorTitle")) $("memoEditorTitle").textContent = "공지사항 작성";
  if ($("publicMemoEditorStatus")) $("publicMemoEditorStatus").textContent = "";
}

function editPublicMemo(id) {
  if (currentUser?.uid !== ADMIN_UID) return;

  const memo = publicMemos.find((item) => item.id === id);
  if (!memo) return;

  editingMemoId = id;

  if ($("publicMemoId")) $("publicMemoId").value = id;
  if ($("publicMemoDate")) $("publicMemoDate").value = memo.date || "";
  if ($("publicMemoTitle")) $("publicMemoTitle").value = memo.title || "";
  if ($("publicMemoContent")) $("publicMemoContent").value = memo.content || "";
  if ($("memoEditorTitle")) $("memoEditorTitle").textContent = "공지사항 수정";
  if ($("publicMemoEditorStatus")) $("publicMemoEditorStatus").textContent = "수정 내용을 입력하세요.";

  $("adminMemoEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function savePublicMemo() {
  const status = $("publicMemoEditorStatus");

  if (currentUser?.uid !== ADMIN_UID) {
    if (status) status.textContent = "관리자 계정으로 로그인해야 합니다.";
    return;
  }

  const date = $("publicMemoDate")?.value;
  const title = $("publicMemoTitle")?.value.trim();
  const content = $("publicMemoContent")?.value.trim();

  if (!date || !title || !content) {
    if (status) status.textContent = "날짜, 제목, 내용을 모두 입력해 주세요.";
    return;
  }

  if (title.length > 100 || content.length > 5000) {
    if (status) status.textContent = "제목은 100자, 내용은 5000자 이내로 작성해 주세요.";
    return;
  }

  const payload = {
    date,
    title,
    content,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  };

  try {
    if (editingMemoId) {
      await updateDoc(doc(db, "publicMemos", editingMemoId), payload);
    } else {
      await addDoc(collection(db, "publicMemos"), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
    }

    if (status) status.textContent = "공지사항을 저장했습니다.";
    resetMemoForm();
    await loadPublicMemos();
  } catch (error) {
    console.error("공지 저장 오류:", error);
    if (status) status.textContent = "저장 실패: 관리자 UID와 Firestore 보안 규칙을 확인해 주세요.";
  }
}

async function deletePublicMemo(id) {
  if (currentUser?.uid !== ADMIN_UID) {
    setStatus("관리자 계정으로 로그인해야 합니다.");
    return;
  }

  if (!confirm("이 공지사항을 삭제할까요?")) return;

  try {
    await deleteDoc(doc(db, "publicMemos", id));
    await loadPublicMemos();
    setStatus("공지사항을 삭제했습니다.");
  } catch (error) {
    console.error("공지 삭제 오류:", error);
    setStatus("삭제 실패: Firestore 보안 규칙을 확인해 주세요.");
  }
}

function setupMemoEditor() {
  $("savePublicMemo")?.addEventListener("click", savePublicMemo);
  $("cancelPublicMemo")?.addEventListener("click", resetMemoForm);
  $("reloadPublicMemos")?.addEventListener("click", loadPublicMemos);
}

/* 초기 실행 */
function init() {
  setupNavigation();
  setupCalendarButtons();
  setupPersonalMemo();
  setupAuthentication();
  setupMemoEditor();

  if ($("personalMemoDate")) {
    $("personalMemoDate").addEventListener("change", (event) => {
      if (event.target.value) {
        selectedDate = event.target.value;
        calendarMonth = new Date(
          parseDateKey(selectedDate).getFullYear(),
          parseDateKey(selectedDate).getMonth(),
          1
        );
        renderCalendar();
      }
    });
  }

  loadSchedules();
  loadPublicMemos();
}

init();
