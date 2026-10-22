import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

// Firebase 사용자 UID를 입력한다. 비밀번호를 입력하는 곳이 아니다.
const ADMIN_UID = "YOUR_ADMIN_UID";

const firebaseReady =
  firebaseConfig.apiKey !== "YOUR_FIREBASE_WEB_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let auth = null;
let db = null;
let currentUser = null;
let scheduleEvents = [];
let selectedDate = koreanToday();
let visibleMonth = new Date(
  Number(selectedDate.slice(0, 4)),
  Number(selectedDate.slice(5, 7)) - 1,
  1
);

if (firebaseReady) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

const $ = id => document.getElementById(id);

function koreanToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function dateString(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function displayDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function isAdmin() {
  return Boolean(
    currentUser &&
    ADMIN_UID !== "YOUR_ADMIN_UID" &&
    currentUser.uid === ADMIN_UID
  );
}

// 상단 메뉴를 이용한 화면 전환
document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    const target = button.dataset.view;

    document.querySelectorAll(".page-view").forEach(view => {
      const active = view.id === `page-${target}`;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });

    document.querySelectorAll("[data-view]").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-current", active ? "page" : "false");
    });

    if (target === "calendar") renderCalendar();
    if (target === "memos") {
      $("memoDate").value = selectedDate;
      loadPersonalMemo();
      loadPublicMemos();
    }
  });
});

// NEIS에서 자동 생성한 공개 JSON 읽기
async function loadSchedule() {
  try {
    const response = await fetch("./schedule.json", {
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    scheduleEvents = Array.isArray(data.events) ? data.events : [];
    renderCalendar();
    renderSelectedDate();
  } catch (error) {
    console.error("학사일정 로딩 실패:", error);
    $("schoolEvents").textContent =
      "학사일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.";
  }
}

function eventsForDate(value) {
  return scheduleEvents.filter(event => event.date === value);
}

function makeTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderCalendar() {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  $("calendarMonth").textContent = `${year}년 ${month + 1}월`;

  const grid = $("calendarGrid");
  grid.replaceChildren();

  ["일", "월", "화", "수", "목", "금", "토"].forEach(day => {
    grid.appendChild(makeTextElement("div", "calendar-weekday", day));
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(makeTextElement("div", "calendar-empty", ""));
  }

  for (let day = 1; day <= lastDay; day++) {
    const value = dateString(year, month + 1, day);
    const events = eventsForDate(value);
    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-cell";
    button.classList.toggle("selected", value === selectedDate);
    button.setAttribute("aria-label",
      `${displayDate(value)}${events.length ? `, 일정 ${events.length}개` : ""}`);

    button.appendChild(makeTextElement("span", "", String(day)));

    if (events.length) {
      button.appendChild(makeTextElement("span", "event-dot", ""));
    }

    button.addEventListener("click", () => selectDate(value));
    grid.appendChild(button);
  }
}

function selectDate(value) {
  selectedDate = value;
  visibleMonth = new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    1
  );

  $("memoDate").value = value;
  loadPersonalMemo();
  renderCalendar();
  renderSelectedDate();
  loadPublicMemos();
}

function renderSelectedDate() {
  $("calendarSelectedDate").textContent = displayDate(selectedDate);

  const container = $("schoolEvents");
  container.replaceChildren();

  const events = eventsForDate(selectedDate);

  if (!events.length) {
    container.appendChild(
      makeTextElement("p", "muted", "등록된 학교 학사일정이 없습니다.")
    );
    return;
  }

  events.forEach(event => {
    const card = document.createElement("article");
    card.className = "event-item";
    card.appendChild(makeTextElement("h3", "", event.title));

    if (event.content) {
      card.appendChild(makeTextElement("p", "", event.content));
    }

    container.appendChild(card);
  });
}

// 개인 메모는 서버에 보내지 않고 현재 브라우저에만 저장
function personalStorageKey() {
  return `daegeun-personal-memo:${selectedDate}`;
}

function loadPersonalMemo() {
  $("personalMemo").value =
    localStorage.getItem(personalStorageKey()) || "";
  $("personalMemoStatus").textContent = "";
}

$("memoDate").addEventListener("change", event => {
  if (event.target.value) selectDate(event.target.value);
});

$("savePersonalMemo").addEventListener("click", () => {
  try {
    localStorage.setItem(
      personalStorageKey(),
      $("personalMemo").value
    );
    $("personalMemoStatus").textContent = "이 브라우저에 저장했습니다.";
  } catch (error) {
    console.error(error);
    $("personalMemoStatus").textContent =
      "저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.";
  }
});

$("calendarPrev").addEventListener("click", () => {
  visibleMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() - 1,
    1
  );
  renderCalendar();
});

$("calendarNext").addEventListener("click", () => {
  visibleMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    1
  );
  renderCalendar();
});

// 모든 학생이 읽을 수 있는 관리자 공통 메모
async function loadPublicMemos() {
  const containers = [$("publicMemoList"), $("sharedMemoList")];
  containers.forEach(container => container.replaceChildren());

  if (!db) {
    containers.forEach(container => {
      container.appendChild(makeTextElement(
        "p", "muted",
        "공통 메모 기능을 사용하려면 Firebase 설정이 필요합니다."
      ));
    });
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, "publicMemos"));
    const memos = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.date === selectedDate)
      .sort((a, b) => (a.createdAt?.seconds || 0) -
                      (b.createdAt?.seconds || 0));

    containers.forEach(container => {
      if (!memos.length) {
        container.appendChild(makeTextElement(
          "p", "muted", "이 날짜에 등록된 공통 메모가 없습니다."
        ));
      }

      memos.forEach(memo => {
        const card = document.createElement("article");
        card.className = "shared-memo-item";
        card.appendChild(makeTextElement("h3", "", memo.title || "학교 공지"));
        card.appendChild(makeTextElement("p", "", memo.content || ""));

        if (isAdmin()) {
          const edit = makeTextElement("button", "", "수정");
          edit.type = "button";
          edit.addEventListener("click", () => editPublicMemo(memo));

          const remove = makeTextElement("button", "", "삭제");
          remove.type = "button";
          remove.addEventListener("click", () => deletePublicMemo(memo));

          card.append(edit, remove);
        }

        container.appendChild(card);
      });
    });
  } catch (error) {
    console.error("공통 메모 조회 실패:", error);
    containers.forEach(container => {
      container.appendChild(makeTextElement(
        "p", "muted", "공통 메모를 불러오지 못했습니다."
      ));
    });
  }
}

async function editPublicMemo(memo) {
  if (!isAdmin() || !db) return;

  const title = prompt("메모 제목", memo.title || "");
  if (title === null) return;

  const content = prompt("메모 내용", memo.content || "");
  if (content === null) return;

  try {
    await updateDoc(doc(db, "publicMemos", memo.id), {
      title: title.trim(),
      content: content.trim(),
      updatedAt: serverTimestamp()
    });
    await loadPublicMemos();
  } catch (error) {
    console.error(error);
    alert("수정하지 못했습니다. 관리자 권한을 확인해 주세요.");
  }
}

async function deletePublicMemo(memo) {
  if (!isAdmin() || !db) return;
  if (!confirm(`"${memo.title}" 메모를 삭제할까요?`)) return;

  try {
    await deleteDoc(doc(db, "publicMemos", memo.id));
    await loadPublicMemos();
  } catch (error) {
    console.error(error);
    alert("삭제하지 못했습니다. 관리자 권한을 확인해 주세요.");
  }
}

// 관리자 로그인
$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!auth) {
    $("adminStatus").textContent = "Firebase 설정을 먼저 완료해 주세요.";
    return;
  }

  try {
    await signInWithEmailAndPassword(
      auth,
      $("adminEmail").value.trim(),
      $("adminPassword").value
    );
    $("adminPassword").value = "";
  } catch (error) {
    console.error(error);
    $("adminStatus").textContent =
      "로그인에 실패했습니다. 이메일, 비밀번호, Firebase 설정을 확인해 주세요.";
  }
});

$("adminLogout").addEventListener("click", async () => {
  if (auth) await signOut(auth);
});

$("sharedMemoForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin() || !db) {
    $("adminStatus").textContent = "공통 메모 등록 권한이 없습니다.";
    return;
  }

  const title = $("sharedTitle").value.trim();
  const content = $("sharedContent").value.trim();

  if (!title || !content) return;

  try {
    await addDoc(collection(db, "publicMemos"), {
      date: selectedDate,
      title,
      content,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("sharedTitle").value = "";
    $("sharedContent").value = "";
    await loadPublicMemos();
    $("adminStatus").textContent = "공통 메모를 등록했습니다.";
  } catch (error) {
    console.error(error);
    $("adminStatus").textContent =
      "등록 실패. Firestore 보안 규칙과 관리자 UID를 확인해 주세요.";
  }
});

if (auth) {
  onAuthStateChanged(auth, user => {
    currentUser = user;

    const admin = isAdmin();
    $("adminStatus").textContent = admin
      ? "관리자 로그인 상태입니다."
      : "관리자 로그인이 필요합니다.";

    $("adminLoginForm").hidden = admin;
    $("adminLogout").hidden = !admin;
    $("sharedMemoForm").hidden = !admin;

    loadPublicMemos();
  });
} else {
  $("adminStatus").textContent =
    "Firebase 설정을 완료하면 관리자 기능을 사용할 수 있습니다.";
}

loadPersonalMemo();
loadSchedule();
renderCalendar();
renderSelectedDate();
loadPublicMemos();
