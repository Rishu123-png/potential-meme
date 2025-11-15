// ============================================================
//  School Attendance System - script.js (FINAL HYBRID v1.0)
//  Merged & hardened version (keeps all features from old & new)
//  - Signup UI disabled (admin creates teacher accounts in Firebase)
//  - Teacher authorization: reads /teachers/<uid> in RTDB
//  - Teachers may view all subjects/classes but can only SAVE for their own subject
//  - Day-wise history (flatpickr supported)
//  - Defensive checks, helpful UI messages, and robust error handling
//  Author: merged by ChatGPT for Rishu Jaswar
// ============================================================

import { app } from "./firebase.js";
import { studentsData } from "./students.js";

import {
getAuth,
signInWithEmailAndPassword,
signOut,
onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
getDatabase,
ref,
get,
push,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

window.addEventListener("DOMContentLoaded", () => {
// --- Firebase services
const auth = getAuth(app);
const db = getDatabase(app);

// --- UI elements (must match index.html)
const authLogin = document.getElementById("authLogin");
const authSignup = document.getElementById("authSignup");
const showSignup = document.getElementById("showSignup");
const showLogin = document.getElementById("showLogin");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const authMessage = document.getElementById("authMessage");

const fullName = document.getElementById("fullName");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const signupClass = document.getElementById("signupClass");
const signupSubject = document.getElementById("signupSubject");
const avatarUpload = document.getElementById("avatarUpload");
const signupBtn = document.getElementById("signupBtn");
const signupMessage = document.getElementById("signupMessage");

const dashboard = document.getElementById("dashboard");
const welcome = document.getElementById("welcome");
const teacherMeta = document.getElementById("teacherMeta");
const teacherAvatar = document.getElementById("teacherAvatar");
const logoutBtn = document.getElementById("logoutBtn");

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const studentListContainer = document.getElementById("studentListContainer");
const saveAll = document.getElementById("saveAll");
const viewHistory = document.getElementById("viewHistory");

const historyContainer = document.getElementById("historyContainer");
const historyTableBody = document.getElementById("historyTableBody");
const historyDateInput = document.getElementById("historyDate");
const loadDate = document.getElementById("loadDate");

// --- Local state
let currentUser = null; // firebase auth user
let teacherProfile = null; // profile object read from /teachers/<uid>
let teacherSubject = null; // subject teacher is allowed to save for
let teacherUid = null;

// ------------------------------
// Disable / hide signup UI
// ------------------------------
try {
if (authSignup) authSignup.style.display = "none";
if (showSignup) showSignup.style.display = "none";
if (signupBtn) signupBtn.disabled = true;
if (signupMessage)
signupMessage.textContent =
"Account creation is disabled here. Admin will create teacher accounts.";
} catch (e) {
console.warn("signup UI hide error", e);
}

// Ensure initial UI state (dashboard hidden until auth confirmed)
if (dashboard) dashboard.style.display = "none";
if (authLogin) authLogin.style.display = "block";

// ------------------------------
// Populate class & subject selects (from students.js)
// ------------------------------
function populateClassSubjectSelects() {
if (!classSelect) return;
classSelect.innerHTML = <option value="">Select Class</option>;
const classes = Object.keys(studentsData || {});
classes.forEach((c) => {
const opt = document.createElement("option");
opt.value = c;
opt.textContent = c;
classSelect.appendChild(opt);
});

if (!subjectSelect) return;  
// gather all unique subjects across classes  
const subjSet = new Set();  
classes.forEach((c) => {  
  Object.keys(studentsData[c] || {}).forEach((s) => subjSet.add(s));  
});  
subjectSelect.innerHTML = `<option value="">Select Subject</option>`;  
Array.from(subjSet)  
  .sort()  
  .forEach((s) => {  
    const opt = document.createElement("option");  
    opt.value = s;  
    opt.textContent = s;  
    subjectSelect.appendChild(opt);  
  });

}
populateClassSubjectSelects();

// ------------------------------
// flatpickr (calendar) init if provided
// ------------------------------
if (typeof flatpickr !== "undefined" && historyDateInput) {
flatpickr(historyDateInput, {
dateFormat: "Y-m-d",
defaultDate: new Date(),
allowInput: false,
});
}

// ------------------------------
// Helpers
// ------------------------------
function escapeId(str) {
return (str || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "");
}

// Update saveAll button state & tooltip
function updateSaveButtonState() {
if (!saveAll) return;
// default disable
saveAll.disabled = true;
saveAll.style.opacity = "0.6";
saveAll.title = "Sign in and select a subject.";

// If teacher not authorized, remain disabled  
if (!teacherSubject) {  
  saveAll.title = "Not authorized to save attendance.";  
  return;  
}  

const selectedSubject = subjectSelect?.value || "";  
if (!selectedSubject) {  
  saveAll.title = "Select a subject to enable saving.";  
  return;  
}  

// Teacher may view other subjects, but can only save for their subject  
if (selectedSubject !== teacherSubject) {  
  saveAll.title = `You can only save attendance for your subject: ${teacherSubject}`;  
  return;  
}  

// enabled  
saveAll.disabled = false;  
saveAll.style.opacity = "1";  
saveAll.title = "Save attendance for displayed students";

}

// ------------------------------
// Render students for class+subject
// ------------------------------
function renderStudentsFor(className, subjectName) {
if (!studentListContainer) return;
studentListContainer.innerHTML = "";

if (!className || !subjectName) {  
  studentListContainer.innerHTML = `<p class="msg">Please select class and subject.</p>`;  
  updateSaveButtonState();  
  return;  
}  

const list =  
  studentsData[className] && studentsData[className][subjectName]  
    ? [...studentsData[className][subjectName]]  
    : [];  

list.sort((a, b) =>  
  a.localeCompare(b, undefined, { sensitivity: "base" })  
);  

if (!list.length) {  
  studentListContainer.innerHTML = `<p class="msg">No students configured for ${className} / ${subjectName}.</p>`;  
  updateSaveButtonState();  
  return;  
}  

list.forEach((student) => {  
  const div = document.createElement("div");  
  div.className = "student-row";  
  const id = `status-${escapeId(className)}-${escapeId(  
    subjectName  
  )}-${escapeId(student)}`;  

  // if teacher is not of this subject then disable selects (read-only)  
  const disabledAttr =  
    teacherSubject && subjectName !== teacherSubject ? "disabled" : "";  

  div.innerHTML = `  
    <span>${student}</span>  
    <div style="display:flex;gap:8px;align-items:center">  
      <select id="${id}" ${disabledAttr}>  
        <option>Present</option>  
        <option>Absent</option>  
      </select>  
    </div>  
  `;  
  studentListContainer.appendChild(div);  
});  

updateSaveButtonState();

}

// wire selects
classSelect?.addEventListener("change", () =>
renderStudentsFor(classSelect.value, subjectSelect.value)
);
subjectSelect?.addEventListener("change", () => {
renderStudentsFor(classSelect.value, subjectSelect.value);
updateSaveButtonState();
});

// ------------------------------
// Save attendance (teacher may save only for their subject)
// ------------------------------
saveAll?.addEventListener("click", async () => {
if (!currentUser) {
alert("Please login first.");
return;
}
const className = classSelect?.value;
const subjectName = subjectSelect?.value;
if (!className || !subjectName) {
alert("Select class and subject first.");
return;
}

// enforce permission  
if (!teacherSubject || subjectName !== teacherSubject) {  
  alert(  
    `You are not allowed to save attendance for "${subjectName}". You can only save for "${teacherSubject}".`  
  );  
  return;  
}  

const rows = studentListContainer.querySelectorAll(".student-row");  
if (!rows || rows.length === 0) {  
  alert("No students to save.");  
  return;  
}  

const date = new Date().toISOString().split("T")[0];  
const ts = new Date().toISOString();  

try {  
  for (const row of rows) {  
    const name = row.querySelector("span").innerText;  
    const status = row.querySelector("select").value;  
    // push to attendance/date/class/subject  
    await push(ref(db, `attendance/${date}/${className}/${subjectName}`), {  
      student: name,  
      status,  
      teacher: currentUser.email || "",  
      teacherUid: teacherUid || "",  
      timestamp: ts,  
    });  
  }  
  alert("✅ Attendance saved successfully for " + date);  
} catch (err) {  
  console.error("Error saving attendance:", err);  
  alert("Failed to save attendance. See console for details.");  
}

});

// ------------------------------
// History: load attendance for a given date
// ------------------------------
async function loadHistoryForDate(dateStr) {
if (!historyTableBody) return;
historyTableBody.innerHTML = "";
if (historyContainer) historyContainer.style.display = "none";

if (!dateStr) {  
  alert("Pick a date first.");  
  return;  
}  

try {  
  const snap = await get(ref(db, `attendance/${dateStr}`));  
  if (!snap.exists()) {  
    alert("No attendance records for " + dateStr);  
    return;  
  }  
  const all = snap.val();  
  const rows = [];  

  // iterate and collect  
  for (const cls of Object.keys(all)) {  
    for (const subj of Object.keys(all[cls])) {  
      for (const id of Object.keys(all[cls][subj])) {  
        const rec = all[cls][subj][id];  
        rows.push({  
          date: dateStr,  
          className: cls,  
          subjectName: subj,  
          ...rec,  
        });  
      }  
    }  
  }  

  // render  
  rows.forEach((r) => {  
    const tr = document.createElement("tr");  
    tr.innerHTML = `<td>${r.date}</td><td>${r.className}</td><td>${r.subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher || r.teacherUid || ""}</td>`;  
    historyTableBody.appendChild(tr);  
  });  

  if (historyContainer) {  
    historyContainer.style.display = "block";  
    historyContainer.scrollIntoView({ behavior: "smooth" });  
  }  
} catch (err) {  
  console.error("History load error:", err);  
  alert("Failed to load history. See console for details.");  
}

}

// view today's history
viewHistory?.addEventListener("click", async () => {
const today = new Date().toISOString().split("T")[0];
await loadHistoryForDate(today);
});

loadDate?.addEventListener("click", async () => {
const dateStr = historyDateInput?.value;
if (!dateStr) {
alert("Pick date from calendar");
return;
}
await loadHistoryForDate(dateStr);
});

// ------------------------------
// Login / Logout
// ------------------------------
loginBtn?.addEventListener("click", async () => {
if (authMessage) authMessage.textContent = "";
try {
await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
// onAuthStateChanged will update UI
} catch (err) {
console.error("Login error:", err);
if (authMessage) authMessage.textContent = err.message || "Login failed.";
}
});

logoutBtn?.addEventListener("click", async () => {
try {
await signOut(auth);
} catch (err) {
console.error("Sign out error", err);
}
});

// ------------------------------
// Auth state changed
// ------------------------------
onAuthStateChanged(auth, async (user) => {
currentUser = user || null;

if (!user) {  
  // Not logged in: show login, hide dashboard and clear sensitive UI  
  try {  
    if (authLogin) authLogin.style.display = "block";  
    if (dashboard) dashboard.style.display = "none";  
    if (studentListContainer) studentListContainer.innerHTML = "";  
    if (historyTableBody) historyTableBody.innerHTML = "";  
    if (historyContainer) historyContainer.style.display = "none";  
  } catch (e) {  
    console.warn("UI hide error", e);  
  }  
  teacherProfile = null;  
  teacherSubject = null;  
  teacherUid = null;  
  updateSaveButtonState();  
  return;  
}  

// user is logged in -> read teacher profile from RTDB under "teachers/<uid>"  
try {  
  const teacherRef = ref(db, "teachers/" + user.uid);  
  const snap = await get(teacherRef);  
  teacherProfile = snap.exists() ? snap.val() : null;  
} catch (e) {  
  console.warn("Teacher profile read failed:", e);  
  teacherProfile = null;  
}  

// If not registered as teacher in DB -> deny  
if (!teacherProfile || !teacherProfile.subject) {  
  alert(  
    "Access denied: your account is not registered as a teacher in the system. Please contact admin."  
  );  
  try {  
    await signOut(auth);  
  } catch (e) {  
    console.warn("Sign out after access denied failed", e);  
  }  
  return;  
}  

// success: set local info and show dashboard  
teacherUid = user.uid;  
teacherSubject = teacherProfile.subject || null;  

try {  
  if (authLogin) authLogin.style.display = "none";  
  if (dashboard) dashboard.style.display = "block";  
} catch (e) {  
  console.warn("UI show error", e);  
}  

// header info  
if (welcome) welcome.textContent = `Welcome, ${teacherProfile.name || user.email}`;  
if (teacherMeta) teacherMeta.textContent = `${teacherProfile.subject} • ${teacherProfile.class || ""}`;  
if (teacherProfile.photoURL && teacherAvatar) teacherAvatar.src = teacherProfile.photoURL;  

// refresh selects and student list  
populateClassSubjectSelects();  
// if teacherSubject exists, select it in subject dropdown (if present)  
if (teacherSubject && subjectSelect) {  
  const opt = Array.from(subjectSelect.options).find(o => o.value === teacherSubject);  
  if (opt) subjectSelect.value = teacherSubject;  
}  

// initial render (will show message until class is selected)  
renderStudentsFor(classSelect?.value, subjectSelect?.value);  
updateSaveButtonState();

});
}); // end DOMContentLoaded