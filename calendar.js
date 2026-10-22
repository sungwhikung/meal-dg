import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Firebase 웹 앱 설정. Firebase 콘솔의 프로젝트 설정과 동일하게 유지하세요.
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
const $ = (id) => document.getElementById(id);
const KST = "Asia/Seoul";
const mealEmojis = { 아침: "🌤️", 점심: "🍱", 저녁: "🌙" };
const mealTimes = { 아침: "BREAKFAST", 점심: "LUNCH", 저녁: "DINNER" };
const mealTypes = ["아침", "점심", "저녁"];
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: KST, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const parseISO = (s) => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); return new Date(y, (m||1)-1, d||1, 12); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const shiftDays = (s,n) => { const d=parseISO(s); d.setDate(d.getDate()+n); return iso(d); };
const fmt = (s, options={ month:"long", day:"numeric", weekday:"short" }) => new Intl.DateTimeFormat("ko-KR", options).format(parseISO(s));
const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let selectedDate = todayISO();
let weekOffset = 0;
let calendarMonth = new Date(parseISO(todayISO()).getFullYear(), parseISO(todayISO()).getMonth(), 1, 12);
let selectedCalendarDate = todayISO();
let meals = [];
let schedules = [];
let publicMemos = [];
let auth = null, db = null, currentUser = null;

// Navigation
for (const button of document.querySelectorAll(".nav-button")) button.addEventListener("click", () => {
  document.querySelectorAll(".nav-button").forEach(b => b.classList.toggle("active", b === button));
  document.querySelectorAll(".page-section").forEach(s => s.classList.toggle("active", s.id === `page-${button.dataset.page}`));
  if (button.dataset.page === "calendar") renderCalendar();
  if (button.dataset.page === "notices") loadPublicMemos();
});

function normalizeMealData(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.meals)) return data.meals;
  if (Array.isArray(data?.mealServiceDietInfo)) {
    const rows = data.mealServiceDietInfo.flatMap(x => x?.row || []);
    return rows;
  }
  if (Array.isArray(data?.mealServiceDietInfo?.[1]?.row)) return data.mealServiceDietInfo[1].row;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
function getMealDate(item) {
  const raw = item.MLSV_YMD ?? item.date ?? item.mealDate ?? item.ymd ?? item.YMD ?? "";
  const s = String(raw).replace(/\D/g, "");
  return s.length === 8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : String(raw).slice(0,10);
}
function getMealType(item) {
  const raw = String(item.MMEAL_SC_NM ?? item.mealType ?? item.type ?? item.mealName ?? "");
  if (/조식|아침|breakfast|1/.test(raw.toLowerCase())) return "아침";
  if (/중식|점심|lunch|2/.test(raw.toLowerCase())) return "점심";
  if (/석식|저녁|dinner|3/.test(raw.toLowerCase())) return "저녁";
  return raw;
}
function getMealMenu(item) {
  const raw = item.DDISH_NM ?? item.menu ?? item.dishes ?? item.meal ?? item.MENU ?? "";
  if (Array.isArray(raw)) return raw.map(x => String(x).replace(/<br\s*\/?\s*>/gi," ").replace(/\s*\([^)]*\)/g,"").trim()).filter(Boolean);
  return String(raw).split(/<br\s*\/?\s*>|\n|\r/gi).map(x => x.replace(/\s*\([^)]*\)/g,"").replace(/\s+/g," ").trim()).filter(Boolean);
}
async function loadMeals() {
  try {
    const res = await fetch(`./meals.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`meals.json HTTP ${res.status}`);
    meals = normalizeMealData(await res.json()).map(item => ({...item, _date:getMealDate(item), _type:getMealType(item), _menu:getMealMenu(item)})).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x._date));
    meals.sort((a,b)=>a._date.localeCompare(b._date));
    const stamp = new Date().toLocaleString("ko-KR", { timeZone: KST, month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" });
    $("updatedAt").textContent = stamp;
  } catch (err) {
    console.error(err); meals=[];
    $("mealCards").innerHTML = `<div class="loading-card">급식 데이터를 읽지 못했어요.<br><small>저장소에 meals.json 파일이 있는지 확인해 주세요.</small></div>`;
    $("updatedAt").textContent = "데이터 파일 확인 필요";
  }
  renderMeals(); renderWeek();
}
function mealFor(date, type) { return meals.find(x => x._date === date && x._type === type); }
function renderMeals() {
  $("selectedDate").textContent = fmt(selectedDate, { year:"numeric", month:"long", day:"numeric", weekday:"long" });
  $("dateLabel").textContent = selectedDate === todayISO() ? "TODAY · 오늘" : "선택한 날짜";
  $("mealCards").innerHTML = mealTypes.map(type => {
    const item = mealFor(selectedDate, type);
    const menu = item?._menu || [];
    return `<article class="meal-card"><div class="meal-card-top"><div class="meal-name"><span class="meal-emoji">${mealEmojis[type]}</span>${type}</div><span class="meal-time">${mealTimes[type]}</span></div>${menu.length ? `<ul class="meal-menu">${menu.map(x=>`<li>${escapeHTML(x)}</li>`).join("")}</ul>` : `<p class="meal-empty">등록된 메뉴가 없습니다.</p>`}</article>`;
  }).join("");
}
function mondayOf(d) { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(12,0,0,0); return x; }
function renderWeek() {
  const base=mondayOf(parseISO(todayISO())); base.setDate(base.getDate()+weekOffset*7);
  const dates=Array.from({length:5},(_,i)=>{const d=new Date(base);d.setDate(base.getDate()+i);return iso(d);});
  $("weekLabel").textContent = `${fmt(dates[0],{month:"numeric",day:"numeric"})} – ${fmt(dates[4],{month:"numeric",day:"numeric"})}`;
  $("weekHead").innerHTML=`<tr><th>구분</th>${dates.map(d=>`<th class="${d===todayISO()?"day-current":""}">${fmt(d,{weekday:"short"})}<br>${fmt(d,{month:"numeric",day:"numeric"})}</th>`).join("")}</tr>`;
  $("weekTable").innerHTML=mealTypes.map(type=>`<tr><th>${type}</th>${dates.map(d=>{const m=mealFor(d,type);return `<td class="week-menu ${d===todayISO()?"day-current":""}">${m?escapeHTML((m._menu||[]).join("\n")) : "—"}</td>`}).join("")}</tr>`).join("");
}
$("prevDay").addEventListener("click",()=>{selectedDate=shiftDays(selectedDate,-1);renderMeals()});
$("nextDay").addEventListener("click",()=>{selectedDate=shiftDays(selectedDate,1);renderMeals()});
$("todayBtn").addEventListener("click",()=>{selectedDate=todayISO();renderMeals()});
$("prevWeek").addEventListener("click",()=>{weekOffset--;renderWeek()});
$("nextWeek").addEventListener("click",()=>{weekOffset++;renderWeek()});

async function loadSchedules() {
  try {
    const res=await fetch(`./schedule.json?v=${Date.now()}`,{cache:"no-store"});
    if(!res.ok) throw new Error(`schedule.json HTTP ${res.status}`);
    const data=await res.json();
    const raw=Array.isArray(data)?data:(data.schedules||data.schedule||data.data||[]);
    schedules=raw.map(item=>{
      let d=String(item.AA_YMD??item.date??item.startDate??item.SCHUL_DATE??"").replace(/\D/g,"");
      if(d.length===8)d=`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
      return {date:d,title:item.EVENT_NM??item.title??item.event??item.SCHUL_NM??"학교 일정",content:item.EVENT_CNTNT??item.content??item.description??""};
    }).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date));
  } catch(err) { console.warn("학사일정 파일을 읽지 못했습니다.",err); schedules=[]; }
  renderCalendar();
}
function readPersonalMemos(){try{return JSON.parse(localStorage.getItem("daegeonPersonalMemos")||"{}")}catch{return {}}}
function renderCalendar() {
  $("calendarMonth").textContent=new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long"}).format(calendarMonth);
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1,12); const start=new Date(first); start.setDate(first.getDate()-first.getDay());
  const memos=readPersonalMemos(); const html=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=iso(d);const inMonth=d.getMonth()===calendarMonth.getMonth();
    const hasSchool=schedules.some(s=>s.date===key);const hasPersonal=Boolean(memos[key]?.trim());
    html.push(`<button type="button" class="calendar-day ${inMonth?"":"outside"} ${key===todayISO()?"today":""} ${key===selectedCalendarDate?"selected":""}" data-date="${key}" aria-label="${key}"><span class="day-number">${d.getDate()}</span><span class="day-dots">${hasSchool?'<i class="day-dot"></i>':''}${hasPersonal?'<i class="day-dot personal"></i>':''}</span></button>`);
  }
  $("calendarGrid").innerHTML=html.join("");
  for(const b of $("calendarGrid").querySelectorAll("button")) b.addEventListener("click",()=>{selectedCalendarDate=b.dataset.date;calendarMonth=new Date(parseISO(selectedCalendarDate).getFullYear(),parseISO(selectedCalendarDate).getMonth(),1,12);$("personalMemoDate").value=selectedCalendarDate;loadMemoIntoEditor();renderCalendar();renderSelectedSchedule()});
  renderSelectedSchedule();
}
function renderSelectedSchedule(){
  $("selectedCalendarDate").textContent=fmt(selectedCalendarDate,{year:"numeric",month:"long",day:"numeric",weekday:"long"});
  const list=schedules.filter(s=>s.date===selectedCalendarDate);
  $("scheduleDetails").innerHTML=list.length?list.map(s=>`<div class="schedule-item"><strong>${escapeHTML(s.title)}</strong>${s.content?`<p>${escapeHTML(s.content)}</p>`:""}</div>`).join(""):`<p class="empty-state">등록된 학교 일정이 없습니다.</p>`;
}
$("calendarPrev").addEventListener("click",()=>{calendarMonth.setMonth(calendarMonth.getMonth()-1);renderCalendar()});
$("calendarNext").addEventListener("click",()=>{calendarMonth.setMonth(calendarMonth.getMonth()+1);renderCalendar()});
$("calendarToday").addEventListener("click",()=>{selectedCalendarDate=todayISO();calendarMonth=new Date(parseISO(selectedCalendarDate).getFullYear(),parseISO(selectedCalendarDate).getMonth(),1,12);$("personalMemoDate").value=selectedCalendarDate;loadMemoIntoEditor();renderCalendar()});
function loadMemoIntoEditor(){const memos=readPersonalMemos();$("personalMemoText").value=memos[selectedCalendarDate]||"";$("personalMemoStatus").textContent=""}
$("personalMemoDate").value=todayISO();$("personalMemoDate").addEventListener("change",()=>{if(!$("personalMemoDate").value)return;selectedCalendarDate=$("personalMemoDate").value;const d=parseISO(selectedCalendarDate);calendarMonth=new Date(d.getFullYear(),d.getMonth(),1,12);loadMemoIntoEditor();renderCalendar()});
$("savePersonalMemo").addEventListener("click",()=>{const date=$("personalMemoDate").value||selectedCalendarDate;const value=$("personalMemoText").value.trim();const memos=readPersonalMemos();if(value)memos[date]=value;else delete memos[date];localStorage.setItem("daegeonPersonalMemos",JSON.stringify(memos));selectedCalendarDate=date;$("personalMemoStatus").textContent="이 기기에 메모를 저장했어요.";renderCalendar()});
$("deletePersonalMemo").addEventListener("click",()=>{const date=$("personalMemoDate").value||selectedCalendarDate;const memos=readPersonalMemos();delete memos[date];localStorage.setItem("daegeonPersonalMemos",JSON.stringify(memos));$("personalMemoText").value="";$("personalMemoStatus").textContent="메모를 삭제했어요.";renderCalendar()});

function setAuthStatus(msg){$("authStatus").textContent=msg||""}
function setEditorStatus(msg){$("publicMemoEditorStatus").textContent=msg||""}
function resetEditor(){ $("publicMemoId").value="";$("publicMemoDate").value=todayISO();$("publicMemoTitle").value="";$("publicMemoContent").value="";$("memoEditorTitle").textContent="공지 작성";setEditorStatus(""); }
function isAdmin(){return Boolean(currentUser&&currentUser.uid===ADMIN_UID)}
function updateAuthUI(){
  const logged=Boolean(currentUser);$("authLoggedOut").hidden=logged;$("authLoggedIn").hidden=!logged;$("adminMemoEditor").hidden=!isAdmin();
  if(logged){$("loggedInEmail").textContent=currentUser.email||"로그인 계정";$("adminRoleStatus").textContent=isAdmin()?"관리자 권한 확인됨":"로그인했지만 공지 작성 권한이 없습니다.";}
  if(!logged){$("loggedInEmail").textContent="—";$("adminRoleStatus").textContent="로그아웃 상태";}
}
async function initFirebase(){
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    onAuthStateChanged(auth,user=>{currentUser=user;updateAuthUI();if(user&&!isAdmin())setAuthStatus("이 계정은 공지 작성 관리자 계정이 아닙니다.");else setAuthStatus("");loadPublicMemos()});
  }catch(err){console.error(err);setAuthStatus("Firebase 초기화에 실패했습니다. 설정을 확인해 주세요.");$("publicMemoList").innerHTML='<div class="loading-card">공지 기능을 초기화하지 못했습니다.</div>'}
}
$("adminLogin").addEventListener("click",async()=>{
  const email=$("adminEmail").value.trim(),password=$("adminPassword").value;
  if(!email||!password){setAuthStatus("이메일과 비밀번호를 입력해 주세요.");return}
  try{await signInWithEmailAndPassword(auth,email,password);setAuthStatus("로그인되었습니다.")}catch(err){console.error(err);setAuthStatus("로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.")}
});
$("adminLogout").addEventListener("click",async()=>{try{await signOut(auth);setAuthStatus("로그아웃되었습니다.")}catch(err){setAuthStatus("로그아웃 중 오류가 발생했습니다.")}});
async function loadPublicMemos(){
  if(!db){$("publicMemoList").innerHTML='<div class="loading-card">공지 기능을 연결하는 중이에요…</div>';return}
  try{
    const q=query(collection(db,"publicMemos"),orderBy("date","desc"));const snap=await getDocs(q);
    publicMemos=snap.docs.map(d=>({id:d.id,...d.data()}));renderPublicMemos();
  }catch(err){console.error(err);$("publicMemoList").innerHTML='<div class="loading-card">공지를 불러오지 못했습니다. Firestore 데이터베이스와 보안 규칙을 확인해 주세요.</div>'}
}
function renderPublicMemos(){
  if(!publicMemos.length){$("publicMemoList").innerHTML='<div class="loading-card">아직 등록된 공지사항이 없습니다.</div>';return}
  $("publicMemoList").innerHTML=publicMemos.map(m=>`<article class="notice-card"><div class="notice-card-head"><h3>${escapeHTML(m.title||"제목 없음")}</h3><time class="notice-date">${escapeHTML(m.date||"")}</time></div><p class="notice-content">${escapeHTML(m.content||"")}</p>${isAdmin()?`<div class="notice-actions"><button class="text-button" data-edit="${escapeHTML(m.id)}">수정</button><button class="text-button" data-delete="${escapeHTML(m.id)}">삭제</button></div>`:""}</article>`).join("");
  for(const b of $("publicMemoList").querySelectorAll("[data-edit]"))b.addEventListener("click",()=>editPublicMemo(b.dataset.edit));
  for(const b of $("publicMemoList").querySelectorAll("[data-delete]"))b.addEventListener("click",()=>removePublicMemo(b.dataset.delete));
}
function editPublicMemo(id){if(!isAdmin())return;const m=publicMemos.find(x=>x.id===id);if(!m)return;$("publicMemoId").value=m.id;$("publicMemoDate").value=m.date||todayISO();$("publicMemoTitle").value=m.title||"";$("publicMemoContent").value=m.content||"";$("memoEditorTitle").textContent="공지 수정";setEditorStatus("");$("adminMemoEditor").scrollIntoView({behavior:"smooth",block:"center"})}
async function removePublicMemo(id){if(!isAdmin())return;if(!confirm("이 공지사항을 삭제할까요?"))return;try{await deleteDoc(doc(db,"publicMemos",id));setAuthStatus("공지사항을 삭제했습니다.");await loadPublicMemos()}catch(err){console.error(err);setAuthStatus("삭제에 실패했습니다. Firestore 규칙을 확인해 주세요.")}}
$("savePublicMemo").addEventListener("click",async()=>{
  if(!isAdmin()){setEditorStatus("관리자 계정으로 로그인해야 합니다.");return}
  const date=$("publicMemoDate").value,title=$("publicMemoTitle").value.trim(),content=$("publicMemoContent").value.trim(),id=$("publicMemoId").value;
  if(!date||!title||!content){setEditorStatus("날짜, 제목, 내용을 모두 입력해 주세요.");return}
  if(title.length>100||content.length>5000){setEditorStatus("제목은 100자, 내용은 5000자 이내로 입력해 주세요.");return}
  try{
    if(id){await updateDoc(doc(db,"publicMemos",id),{date,title,content,updatedAt:serverTimestamp(),updatedBy:currentUser.uid})}
    else{await addDoc(collection(db,"publicMemos"),{date,title,content,createdAt:serverTimestamp(),createdBy:currentUser.uid,updatedAt:serverTimestamp(),updatedBy:currentUser.uid})}
    resetEditor();setEditorStatus("저장되었습니다.");await loadPublicMemos();
  }catch(err){console.error(err);setEditorStatus("저장에 실패했습니다. Firestore 보안 규칙과 관리자 UID를 확인해 주세요.")}
});
$("cancelPublicMemo").addEventListener("click",resetEditor);
$("reloadPublicMemos").addEventListener("click",loadPublicMemos);

$("todayPretty").textContent=new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long",timeZone:KST}).format(new Date());
loadMeals();loadSchedules();initFirebase();
