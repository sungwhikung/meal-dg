
"use strict";

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

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
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ==================================================
   1. Firebase 설정
   Firebase Console > 프로젝트 설정 > 내 앱에서 확인
   ================================================== */

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

/*
 * Firebase Authentication에서 만든 관리자 계정의 UID.
 * UID 자체는 비밀번호가 아니지만, Firestore 보안 규칙에도
 * 동일한 UID를 설정해야 실제 관리자 권한이 보호됩니다.
 */
const ADMIN_UID = "YOUR_ADMIN_UID";

const $ = (id) => document.getElementById(id);

const firebaseConfigured =
  firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID" &&
  ADMIN_UID !== "YOUR_ADMIN_UID";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let isAdmin = false;

if (firebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.error("Firebase 초기화 오류:", error);
  }
}

/* ==================================================
   2. 화면 전환
   ================================================== */

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    const pageName = button.dataset.page;

    document.querySelectorAll(".page-section").forEach(section => {
      section.classList.toggle(
        "active",
        section.id === `page-${pageName}`
      );
    });

    document.querySelectorAll("[data-page]").forEach(navButton => {
      navButton.classList.toggle("active", navButton === button);
    });

    if (pageName === "notices") {
      loadPublicMemos();
    }
  });
});

/* ==================================================
   3. 날짜 유틸리티
   ================================================== */

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftMonth(value, amount) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1 + amount, 1, 12);
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function formatKoreanDate(value) {
  if (!value) return "";
  return parseLocalDate(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

function escapeText(value) {
  return String(value ?? "");
}

function setStatus(id, message) {
  const element = $(id);
  if (element) element.textContent = message;
}

/* ==================================================
   4. NEIS 학사일정 데이터
   ================================================== */

let scheduleRows = [];
let selectedCalendarDate = localDateString();
let visibleMonth = `${selectedCalendarDate.slice(0, 7)}-01`;

async function loadScheduleData() {
  const details = $("scheduleDetails");
  details.replaceChildren();

  try {
    const response = await fetch("./schedule.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`schedule.json 요청 실패: ${response.status}`);
    }

    const data = await response.json();
    scheduleRows = Array.isArray(data.schedules) ? data.schedules : [];

    renderCalendar();
    renderScheduleDetails();
  } catch (error) {
    console.error(error);
    const message = document.createElement("p");
    message.className = "status";
    message.textContent =
      "학사일정을 불러오지 못했습니다. GitHub Actions 실행 기록과 schedule.json을 확인하세요.";
    details.replaceChildren(message);
    $("calendarGrid").replaceChildren();
  }
}

function schedulesForDate(dateValue) {
  const key = dateValue.replaceAll("-", "");
  return scheduleRows.filter(row => String(row.AA_YMD || "") === key);
}

function renderCalendar() {
  const [year, month] = visibleMonth.split("-").map(Number);
  $("calendarMonth").textContent = `${year}년 ${month}월`;

  const firstDay = new Date(year, month - 1, 1, 12);
  const daysInMonth = new Date(year, month, 0, 12).getDate();
  const offset = firstDay.getDay();
  const grid = $("calendarGrid");
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < offset; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-cell empty";
    blank.setAttribute("aria-hidden", "true");
    fragment.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateValue =
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-cell";
    button.classList.toggle("selected", dateValue === selectedCalendarDate);
    button.classList.toggle("today", dateValue === localDateString());

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day);
    button.appendChild(number);

    const events = schedulesForDate(dateValue);
    if (events.length > 0) {
      const marker = document.createElement("span");
      marker.className = "calendar-event-marker";
      marker.textContent = `일정 ${events.length}개`;
      button.appendChild(marker);
    }

    button.addEventListener("click", () => {
      selectedCalendarDate = dateValue;
      $("personalMemoDate").value = dateValue;
      renderCalendar();
      renderScheduleDetails();
      loadPersonalMemo();
    });

    fragment.appendChild(button);
  }

  grid.replaceChildren(fragment);
}

function renderScheduleDetails() {
  $("selectedCalendarDate").textContent =
    formatKoreanDate(selectedCalendarDate);

  const container = $("scheduleDetails");
  const events = schedulesForDate(selectedCalendarDate);
  const fragment = document.createDocumentFragment();

  if (events.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-message";
    p.textContent = "이 날짜에 등록된 학사일정이 없습니다.";
    fragment.appendChild(p);
  } else {
    events.forEach(event => {
      const card = document.createElement("article");
      card.className = "schedule-card";

      const title = document.createElement("h3");
      title.textContent = event.EVENT_NM || "학교 일정";

      const content = document.createElement("p");
      content.textContent = event.EVENT_CNTNT || "추가 설명이 없습니다.";

      card.append(title, content);
      fragment.appendChild(card);
    });
  }

  container.replaceChildren(fragment);
}

$("calendarPrev").addEventListener("click", () => {
  visibleMonth = shiftMonth(visibleMonth, -1);
  renderCalendar();
});

$("calendarNext").addEventListener("click", () => {
  visibleMonth = shiftMonth(visibleMonth, 1);
  renderCalendar();
});

$("calendarToday").addEventListener("click", () => {
  selectedCalendarDate = localDateString();
  visibleMonth = `${selectedCalendarDate.slice(0, 7)}-01`;
  $("personalMemoDate").value = selectedCalendarDate;
  renderCalendar();
  renderScheduleDetails();
  loadPersonalMemo();
});

$("personalMemoDate").value = selectedCalendarDate;

/* ==================================================
   5. 개인 메모 - 브라우저 localStorage
   ================================================== */

function personalMemoKey(dateValue) {
  return `daegun-meal-personal-memo-${dateValue}`;
}

function loadPersonalMemo() {
  const dateValue = $("personalMemoDate").value || selectedCalendarDate;
  let savedText = "";

  try {
    savedText = localStorage.getItem(personalMemoKey(dateValue)) || "";
  } catch (error) {
    console.error(error);
    setStatus("personalMemoStatus", "브라우저 저장소를 사용할 수 없습니다.");
    return;
  }

  $("personalMemoText").value = savedText;
  setStatus("personalMemoStatus", savedText ? "저장된 메모를 불러왔습니다." : "");
}

$("personalMemoDate").addEventListener("change", () => {
  if (!$("personalMemoDate").value) return;
  selectedCalendarDate = $("personalMemoDate").value;
  visibleMonth = `${selectedCalendarDate.slice(0, 7)}-01`;
  renderCalendar();
  renderScheduleDetails();
  loadPersonalMemo();
});

$("savePersonalMemo").addEventListener("click", () => {
  const dateValue = $("personalMemoDate").value;
  const memo = $("personalMemoText").value;

  if (!dateValue) {
    setStatus("personalMemoStatus", "메모 날짜를 선택하세요.");
    return;
  }

  try {
    if (memo.trim()) {
      localStorage.setItem(personalMemoKey(dateValue), memo);
    } else {
      localStorage.removeItem(personalMemoKey(dateValue));
    }

    setStatus("personalMemoStatus", "이 브라우저에 메모를 저장했습니다.");
  } catch (error) {
    console.error(error);
    setStatus("personalMemoStatus", "저장에 실패했습니다. 브라우저 설정을 확인하세요.");
  }
});

$("deletePersonalMemo").addEventListener("click", () => {
  const dateValue = $("personalMemoDate").value;
  if (!dateValue) return;

  try {
    localStorage.removeItem(personalMemoKey(dateValue));
    $("personalMemoText").value = "";
    setStatus("personalMemoStatus", "메모를 삭제했습니다.");
  } catch (error) {
    console.error(error);
    setStatus("personalMemoStatus", "메모 삭제에 실패했습니다.");
  }
});

loadPersonalMemo();

/* ==================================================
   6. Firebase 인증
   ================================================== */

function updateAuthUI() {
  $("authLoggedOut").hidden = Boolean(currentUser);
  $("authLoggedIn").hidden = !currentUser;
  $("adminMemoEditor").hidden = !isAdmin;

  $("loggedInEmail").textContent = currentUser?.email || "";
  $("adminRoleStatus").textContent = isAdmin
    ? "관리자 권한이 확인되었습니다."
    : "로그인되어 있지만 공유 메모 관리 권한은 없습니다.";
}

$("adminLogin").addEventListener("click", async () => {
  if (!auth) {
    setStatus(
      "authStatus",
      "Firebase 설정이 완료되지 않았습니다. calendar.js의 설정값을 확인하세요."
    );
    return;
  }

  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;

  if (!email || !password) {
    setStatus("authStatus", "이메일과 비밀번호를 입력하세요.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    $("adminPassword").value = "";
    setStatus("authStatus", "로그인 요청을 완료했습니다.");
  } catch (error) {
    console.error(error);
    setStatus("authStatus", "로그인에 실패했습니다. 계정과 Firebase 설정을 확인하세요.");
  }
});

$("adminLogout").addEventListener("click", async () => {
  if (!auth) return;

  try {
    await signOut(auth);
    setStatus("authStatus", "로그아웃했습니다.");
  } catch (error) {
    console.error(error);
    setStatus("authStatus", "로그아웃에 실패했습니다.");
  }
});

if (auth) {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    isAdmin = Boolean(user && user.uid === ADMIN_UID);

    updateAuthUI();

    if (user && !isAdmin) {
      setStatus(
        "authStatus",
        "로그인되었지만 이 계정에는 관리자 권한이 없습니다."
      );
    } else if (isAdmin) {
      setStatus("authStatus", "관리자로 로그인했습니다.");
    }

    await loadPublicMemos();
  });
} else {
  updateAuthUI();
  setStatus(
    "authStatus",
    "공유 메모를 사용하려면 Firebase 설정을 먼저 완료하세요."
  );
}

/* ==================================================
   7. 공유 메모 - Firestore
   ================================================== */

function resetPublicMemoForm() {
  $("publicMemoId").value = "";
  $("publicMemoDate").value = selectedCalendarDate;
  $("publicMemoTitle").value = "";
  $("publicMemoContent").value = "";
  $("memoEditorTitle").textContent = "공유 메모 작성";
  setStatus("publicMemoEditorStatus", "");
}

$("cancelPublicMemo").addEventListener("click", resetPublicMemoForm);

$("savePublicMemo").addEventListener("click", async () => {
  if (!db || !currentUser || !isAdmin) {
    setStatus("publicMemoEditorStatus", "관리자 로그인 후 이용할 수 있습니다.");
    return;
  }

  const dateValue = $("publicMemoDate").value;
  const title = $("publicMemoTitle").value.trim();
  const content = $("publicMemoContent").value.trim();
  const memoId = $("publicMemoId").value;

  if (!dateValue || !title || !content) {
    setStatus("publicMemoEditorStatus", "날짜, 제목, 내용을 모두 입력하세요.");
    return;
  }

  if (title.length > 100 || content.length > 5000) {
    setStatus("publicMemoEditorStatus", "제목 또는 내용이 너무 깁니다.");
    return;
  }

  const data = {
    date: dateValue,
    title,
    content,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  };

  try {
    if (memoId) {
      await updateDoc(doc(db, "publicMemos", memoId), data);
      setStatus("publicMemoEditorStatus", "공유 메모를 수정했습니다.");
    } else {
      await addDoc(collection(db, "publicMemos"), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      });
      setStatus("publicMemoEditorStatus", "공유 메모를 등록했습니다.");
    }

    resetPublicMemoForm();
    await loadPublicMemos();
  } catch (error) {
    console.error(error);
    setStatus(
      "publicMemoEditorStatus",
      "저장에 실패했습니다. Firestore 보안 규칙과 관리자 UID를 확인하세요."
    );
  }
});

$("reloadPublicMemos").addEventListener("click", loadPublicMemos);

async function loadPublicMemos() {
  const container = $("publicMemoList");

  if (!db) {
    const p = document.createElement("p");
    p.className = "status";
    p.textContent = "Firebase 설정 후 공유 메모를 표시할 수 있습니다.";
    container.replaceChildren(p);
    return;
  }

  const loading = document.createElement("p");
  loading.className = "status";
  loading.textContent = "공유 메모를 불러오는 중...";
  container.replaceChildren(loading);

  try {
    const memoQuery = query(
      collection(db, "publicMemos"),
      orderBy("date", "desc")
    );
    const snapshot = await getDocs(memoQuery);
    const fragment = document.createDocumentFragment();

    if (snapshot.empty) {
      const p = document.createElement("p");
      p.className = "empty-message";
      p.textContent = "등록된 공유 메모가 없습니다.";
      fragment.appendChild(p);
    } else {
      snapshot.forEach(item => {
        const memo = item.data();
        const card = document.createElement("article");
        card.className = "public-memo-card";

        const date = document.createElement("p");
        date.className = "memo-date";
        date.textContent = memo.date || "날짜 미지정";

        const title = document.createElement("h3");
        title.textContent = escapeText(memo.title);

        const content = document.createElement("p");
        content.className = "memo-content";
        content.textContent = escapeText(memo.content);

        card.append(date, title, content);

        if (isAdmin) {
          const actions = document.createElement("div");
          actions.className = "button-row";

          const editButton = document.createElement("button");
          editButton.className = "secondary-button";
          editButton.textContent = "수정";
          editButton.addEventListener("click", () => {
            $("publicMemoId").value = item.id;
            $("publicMemoDate").value = memo.date || "";
            $("publicMemoTitle").value = memo.title || "";
            $("publicMemoContent").value = memo.content || "";
            $("memoEditorTitle").textContent = "공유 메모 수정";
            $("adminMemoEditor").hidden = false;
            $("adminMemoEditor").scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
          });

          const deleteButton = document.createElement("button");
          deleteButton.className = "danger-button";
          deleteButton.textContent = "삭제";
          deleteButton.addEventListener("click", async () => {
            if (!isAdmin || !currentUser) return;
            if (!confirm("이 공유 메모를 삭제할까요?")) return;

            try {
              await deleteDoc(doc(db, "publicMemos", item.id));
              await loadPublicMemos();
            } catch (error) {
              console.error(error);
              alert("삭제에 실패했습니다. Firestore 보안 규칙을 확인하세요.");
            }
          });

          actions.append(editButton, deleteButton);
          card.appendChild(actions);
        }

        fragment.appendChild(card);
      });
    }

    container.replaceChildren(fragment);
  } catch (error) {
    console.error(error);
    const p = document.createElement("p");
    p.className = "status";
    p.textContent =
      "공유 메모를 불러오지 못했습니다. Firestore 데이터베이스와 보안 규칙을 확인하세요.";
    container.replaceChildren(p);
  }
}

/* ==================================================
   8. 최초 실행
   ================================================== */

loadScheduleData();
