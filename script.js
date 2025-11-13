// ============================================================
//  School Attendance System - script.js
//  Description: Handles Firebase authentication, attendance
//               saving, viewing (day-wise), and teacher dashboard control.
//               Signup from UI is DISABLED — teacher accounts are
//               expected to be created by admin in Firebase.
//  Author: Rishu Jaswar
//  Notes:
//    - Requires: firebase.js exporting app
//    - Requires: students.js exporting studentsData
//    - Uses: flatpickr for date selection (optional)
// ============================================================

import { app } from "./firebase.js";
import { studentsData } from "./students.js";

import {
getAuth,
signInWithEmailAndPassword,
signOut,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
getDatabase,
ref,
get,
push
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Run when DOM ready
window.addEventListener("DOMContentLoaded", () => {
// init firebase services
const auth = getAuth(app);
const db = getDatabase(app);

// UI elements (must match your index.html)
const authLogin = document.getElementById("authLogin");
const authSignup = document.getElementById("authSignup"); // will be hidden
const showSignup = document.getElementById("showSignup"); // link to create account (will be hidden)
const showLogin = document.getElementById("showLogin");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const authMessage = document.getElementById("authMessage");

// Signup UI controls (we will disable/hide signup)
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

// Local state
let currentUser = null;      // firebase user object
let teacherProfile = null;   // record from /teachers/{uid}
let teacherSubject = null;   // subject the logged-in teacher is allowed to edit
let teacherUid = null;

// --------------------------
// Disable / hide signup UI
// --------------------------
if (authSignup) authSignup.style.display = "none";     // hide signup section
if (showSignup) showSignup.style.display = "none";     // hide "create one" link
if (signupBtn) signupBtn.disabled = true;              // disable signup button if present
if (signupMessage) signupMessage.textContent = "Account creation is disabled here. Admin will create teacher accounts.";

// Ensure initial UI state (dashboard must not be visible until auth confirms)
dashboard.style.display = "none";
if (authLogin) authLogin.style.display = "block";

// --------------------------
// Populate class & subject selects from studentsData
// --------------------------
function populateClassSubjectSelects() {
// populate classes
if (!classSelect) return;
classSelect.innerHTML = <option value="">Select Class</option>;
const classes = Object.keys(studentsData || {});
classes.forEach(c => {
const opt = document.createElement("option");
opt.value = c; opt.textContent = c;
classSelect.appendChild(opt);
});

// gather unique subjects across classes
if (!subjectSelect) return;
const subjSet = new Set();
classes.forEach(c => {
Object.keys(studentsData[c] || {}).forEach(s => subjSet.add(s));
});
subjectSelect.innerHTML = <option value="">Select Subject</option>;
Array.from(subjSet).sort().forEach(s => {
const opt = document.createElement("option");
opt.value = s; opt.textContent = s;
subjectSelect.appendChild(opt);
});

}
populateClassSubjectSelects();

// Initialize flatpickr if available
if (typeof flatpickr !== "undefined" && historyDateInput) {
flatpickr(historyDateInput, { dateFormat: "Y-m-d", defaultDate: new Date(), allowInput: false });
}

// --------------------------
// Helpers
// --------------------------
function escapeId(str){ return (str||"").replace(/\s+/g,'').replace(/[^A-Za-z0-9-]/g,''); }

// Disable save button visually when teacher cannot edit selected subject
function updateSaveButtonState() {
if (!saveAll) return;
if (!teacherSubject) {
saveAll.disabled = true;
saveAll.title = "Not authorized to save attendance";
saveAll.style.opacity = "0.6";
} else {
const selectedSubject = subjectSelect?.value || "";
if (selectedSubject && selectedSubject !== teacherSubject) {
saveAll.disabled = true;
saveAll.title = You can only save attendance for your subject: ${teacherSubject};
saveAll.style.opacity = "0.6";
} else if (!selectedSubject) {
saveAll.disabled = true;
saveAll.title = "Select a subject to enable saving";
saveAll.style.opacity = "0.6";
} else {
saveAll.disabled = false;
saveAll.title = "Save attendance for displayed students";
saveAll.style.opacity = "1";
}
}
}

// --------------------------
// Render students for selected class+subject
// --------------------------
function renderStudentsFor(className, subjectName) {
studentListContainer.innerHTML = "";
if (!className || !subjectName) {
studentListContainer.innerHTML = <p class="msg">Please select class and subject.</p>;
updateSaveButtonState();
return;
}

const list = (studentsData[className] && studentsData[className][subjectName]) ? [...studentsData[className][subjectName]] : [];
list.sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));

if (list.length === 0) {
studentListContainer.innerHTML = <p class="msg">No students configured for ${className} / ${subjectName}.</p>;
updateSaveButtonState();
return;
}

// For each student, create row with select. Disable selects if not teacher's subject
list.forEach(student => {
const div = document.createElement("div");
div.className = "student-row";
const selId = status-${escapeId(className)}-${escapeId(subjectName)}-${escapeId(student)};
const disabledAttr = (teacherSubject && subjectName !== teacherSubject) ? "disabled" : "";
div.innerHTML =        <span>${student}</span>       <div style="display:flex;gap:8px;align-items:center">       <select id="${selId}" ${disabledAttr}>       <option>Present</option>       <option>Absent</option>       </select>       </div>;
studentListContainer.appendChild(div);
});

updateSaveButtonState();

}

// wire select changes
classSelect?.addEventListener("change", () => renderStudentsFor(classSelect.value, subjectSelect.value));
subjectSelect?.addEventListener("change", () => {
renderStudentsFor(classSelect.value, subjectSelect.value);
updateSaveButtonState();
});

// --------------------------
// Save attendance for all shown students (only allowed for teacher's subject)
// --------------------------
saveAll?.addEventListener("click", async () => {
if (!currentUser) { alert("Please login."); return; }
const className = classSelect.value;
const subjectName = subjectSelect.value;
if (!className || !subjectName) { alert("Select class and subject."); return; }

// Enforce permission
if (!teacherSubject || subjectName !== teacherSubject) {
alert(You are not allowed to save attendance for "${subjectName}". You can save only for your subject: "${teacherSubject || 'N/A'}".);
return;
}

const rows = studentListContainer.querySelectorAll(".student-row");
if (rows.length === 0) { alert("No students to save."); return; }

const date = new Date().toISOString().split("T")[0];
const ts = new Date().toISOString();

try {
for (const row of rows) {
const name = row.querySelector("span").innerText;
const status = row.querySelector("select").value;
await push(ref(db, attendance/${date}/${className}/${subjectName}), {
student: name,
status,
teacher: currentUser.email,
teacherUid,
timestamp: ts
});
}
alert("✅ Attendance saved for " + date);
} catch (err) {
console.error("save error", err);
alert("Error saving attendance. See console for details.");
}

});

// --------------------------
// History loading (by date)
// --------------------------
async function loadHistoryForDate(dateStr) {
historyTableBody.innerHTML = "";
historyContainer.style.display = "none";

if (!dateStr) { alert("Pick a date first."); return; }

try {
const snap = await get(ref(db, attendance/${dateStr}));
if (!snap.exists()) { alert("No attendance records for " + dateStr); return; }
const all = snap.val();
const rows = [];

const className = classSelect.value;
const subjectName = subjectSelect.value;

if (className && subjectName) {
const group = all[className]?.[subjectName] || null;
if (!group) { alert("No records for that class & subject on " + dateStr); return; }
for (const id of Object.keys(group)) {
const rec = group[id];
rows.push({ date: dateStr, className, subjectName, ...rec });
}
} else {
for (const cls of Object.keys(all)) {
for (const subj of Object.keys(all[cls])) {
for (const id of Object.keys(all[cls][subj])) {
const rec = all[cls][subj][id];
rows.push({ date: dateStr, className: cls, subjectName: subj, ...rec });
}
}
}
if (rows.length === 0) { alert("No records for " + dateStr); return; }
}

rows.forEach(r => {
const tr = document.createElement("tr");
tr.innerHTML = <td>${r.date}</td><td>${r.className}</td><td>${r.subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher || r.teacherUid || ''}</td>;
historyTableBody.appendChild(tr);
});

historyContainer.style.display = "block";
historyContainer.scrollIntoView({ behavior: 'smooth' });
} catch (err) {
console.error("history load error", err);
alert("Failed to load history. See console for details.");
}

}

// button handlers
viewHistory?.addEventListener("click", async () => {
// default to today
const today = new Date().toISOString().split("T")[0];
await loadHistoryForDate(today);
});

loadDate?.addEventListener("click", async () => {
const dateStr = historyDateInput?.value;
if (!dateStr) { alert("Pick date from calendar"); return; }
await loadHistoryForDate(dateStr);
});

// --------------------------
// Login / Logout
// --------------------------
loginBtn?.addEventListener("click", async () => {
authMessage.textContent = "";
try {
await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
// onAuthStateChanged will handle UI update
} catch (err) {
console.error("login err", err);
authMessage.textContent = err.message || "Login failed";
}
});

logoutBtn?.addEventListener("click", async () => {
await signOut(auth);
});

// --------------------------
// Auth state monitoring (safe and strict)
// --------------------------
onAuthStateChanged(auth, async (user) => {
currentUser = user || null;

if (!user) {
// Not logged in -> ensure login UI visible, dashboard hidden
authLogin.style.display = "block";
dashboard.style.display = "none";
// clear sensitive UI
studentListContainer.innerHTML = "";
historyTableBody.innerHTML = "";
historyContainer.style.display = "none";
teacherProfile = null;
teacherSubject = null;
teacherUid = null;
updateSaveButtonState();
return;
}

// user logged in -> fetch teacher profile from DB
try {
const snap = await get(ref(db, teachers/${user.uid}));
teacherProfile = snap.exists() ? snap.val() : null;
} catch (e) {
console.warn("teacher profile read failed", e);
teacherProfile = null;
}

// If there is no teacher profile or no subject, deny access (admin must add teacher entry)
if (!teacherProfile || !teacherProfile.subject) {
alert("Access denied: your account is not registered as a teacher in the system. Please contact admin.");
await signOut(auth);
return;
}

teacherUid = user.uid;
teacherSubject = teacherProfile.subject || null;

// show dashboard and hide auth
authLogin.style.display = "none";
authSignup?.style.display = "none";
dashboard.style.display = "block";

// show header
welcome.textContent = Welcome, ${teacherProfile.name || user.email};
teacherMeta.textContent = ${teacherProfile.subject} • ${teacherProfile.class || ''};
if (teacherProfile.photoURL) teacherAvatar.src = teacherProfile.photoURL;

// ensure selects populated and auto-select teacher subject when available
populateClassSubjectSelects();
if (teacherSubject) {
const opt = Array.from(subjectSelect.options).find(o => o.value === teacherSubject);
if (opt) subjectSelect.value = teacherSubject;
}
// initial render
renderStudentsFor(classSelect.value, subjectSelect.value);
updateSaveButtonState();

});

// Ensure initial UI state
dashboard.style.display = "none";
authLogin.style.display = "block";
updateSaveButtonState();
}); // end DOMContentLoaded