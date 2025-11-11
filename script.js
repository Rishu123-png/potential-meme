// script.js (module)
import { app } from "./firebase.js";
import { studentsData } from "./students.js"; // must exist and export studentsData

// Firebase imports
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  push,
  set,
  get,
  child
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";

// init
const auth = getAuth(app);
const db = getDatabase(app);

// --- UI elements
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
const signupBtn = document.getElementById("signupBtn");
const signupMessage = document.getElementById("signupMessage");

const dashboard = document.getElementById("dashboard");
const welcome = document.getElementById("welcome");
const teacherMeta = document.getElementById("teacherMeta");
const logoutBtn = document.getElementById("logoutBtn");

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const studentListContainer = document.getElementById("studentListContainer");
const saveAll = document.getElementById("saveAll");
const viewHistory = document.getElementById("viewHistory");
const historyContainer = document.getElementById("historyContainer");
const historyTableBody = document.querySelector("#historyTable tbody");

// --- Toggle forms
showSignup.addEventListener("click", () => {
  authLogin.style.display = "none";
  authSignup.style.display = "block";
  authMessage.textContent = "";
});
showLogin.addEventListener("click", () => {
  authSignup.style.display = "none";
  authLogin.style.display = "block";
  signupMessage.textContent = "";
});

// --- Signup (create user + save teacher info)
signupBtn.addEventListener("click", async () => {
  const name = fullName.value.trim();
  const email = signupEmail.value.trim();
  const password = signupPassword.value;
  const cls = signupClass.value;
  const subj = signupSubject.value;

  signupMessage.textContent = "";
  if (!name || !email || password.length < 6 || !cls || !subj) {
    signupMessage.textContent = "Please fill all fields (password min 6 chars).";
    return;
  }

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;

    // save teacher profile to Realtime DB
    await set(ref(db, `teachers/${uid}`), {
      name, email, class: cls, subject: subj, createdAt: new Date().toISOString()
    });

    signupMessage.textContent = "Account created! You can now log in.";
    // switch to login form, prefill email
    authSignup.style.display = "none";
    authLogin.style.display = "block";
    loginEmail.value = email;
    loginPassword.value = "";
  } catch (err) {
    console.error(err);
    signupMessage.textContent = "Error: " + (err.message || "Sign up failed");
  }
});

// --- Login
loginBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  authMessage.textContent = "";

  if (!email || password.length < 6) {
    authMessage.textContent = "Enter valid email and password.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle UI update
  } catch (err) {
    console.error(err);
    authMessage.textContent = "Login failed: " + (err.message || "");
  }
});

// --- Auth state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // show dashboard
    dashboard.style.display = "block";
    authLogin.style.display = "none";
    authSignup.style.display = "none";
    // fetch teacher info from DB and show
    try {
      const snapshot = await get(child(ref(db), `teachers/${user.uid}`));
      const profile = snapshot.exists() ? snapshot.val() : null;
      welcome.innerText = `Welcome, ${profile?.name || user.email}`;
      teacherMeta.innerText = profile ? `${profile.subject} • ${profile.class}` : user.email;
    } catch (e) {
      console.warn("No teacher profile", e);
      welcome.innerText = `Welcome, ${user.email}`;
      teacherMeta.innerText = "";
    }
  } else {
    dashboard.style.display = "none";
    authLogin.style.display = "block";
  }
});

// --- Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// --- Auto show students when class+subject selected
function renderStudentsFor(className, subjectName) {
  studentListContainer.innerHTML = "";
  if (!className || !subjectName) return;

  const list = (studentsData[className] && studentsData[className][subjectName]) ? [...studentsData[className][subjectName]] : [];
  list.sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));

  if (list.length === 0) {
    studentListContainer.innerHTML = `<p class="small">No students configured for ${className} / ${subjectName}.</p>`;
    return;
  }

  list.forEach(student => {
    const div = document.createElement("div");
    div.className = "student-row";
    div.innerHTML = `<span>${student}</span>
      <div style="display:flex;gap:8px">
        <select id="status-${escapeId(student)}">
          <option>Present</option>
          <option>Absent</option>
        </select>
      </div>`;
    studentListContainer.appendChild(div);
  });
}

function escapeId(str){ return str.replace(/\s+/g,'_').replace(/[^A-Za-z0-9_\-]/g,''); }

classSelect.addEventListener("change", ()=> renderStudentsFor(classSelect.value, subjectSelect.value));
subjectSelect.addEventListener("change", ()=> renderStudentsFor(classSelect.value, subjectSelect.value));

// --- Save attendance for all shown students
saveAll.addEventListener("click", async () => {
  const className = classSelect.value;
  const subjectName = subjectSelect.value;
  const user = auth.currentUser;
  if (!user) { alert("Please login."); return; }
  if (!className || !subjectName) { alert("Select class and subject."); return; }

  // gather students displayed
  const rows = studentListContainer.querySelectorAll(".student-row");
  if (rows.length === 0) { alert("No students to save."); return; }

  const date = new Date().toISOString().split("T")[0];
  const ts = new Date().toISOString();

  try {
    for (const row of rows) {
      const name = row.querySelector("span").innerText;
      const statusEl = row.querySelector("select");
      const status = statusEl.value;
      // push attendance entry
      await push(ref(db, `attendance/${date}/${className}/${subjectName}`), {
        student: name,
        status,
        teacher: user.email,
        timestamp: ts
      });
    }
    alert("✅ Attendance saved for all listed students.");
  } catch (err) {
    console.error(err);
    alert("Error saving attendance.");
  }
});

// --- View history for selected class+subject (loads last 30 entries)
viewHistory.addEventListener("click", async () => {
  historyContainer.style.display = "none";
  historyTableBody.innerHTML = "";

  const className = classSelect.value;
  const subjectName = subjectSelect.value;
  if (!className || !subjectName) { alert("Select class and subject to view history."); return; }

  try {
    const snapshot = await get(child(ref(db), `attendance`));
    if (!snapshot.exists()) { alert("No attendance records."); return; }
    const all = snapshot.val(); // structure: date -> class -> subject -> pushId -> {student,status,...}

    // collect rows
    const rows = [];
    for (const dateKey of Object.keys(all).sort().reverse()) {
      const byClass = all[dateKey];
      if (!byClass[className] || !byClass[className][subjectName]) continue;
      const group = byClass[className][subjectName];
      for (const pushId of Object.keys(group)) {
        const rec = group[pushId];
        rows.push({ date: dateKey, student: rec.student, status: rec.status, teacher: rec.teacher, time: rec.timestamp });
      }
    }

    if (rows.length === 0) { alert("No records for this class & subject."); return; }

    // append to table
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.date}</td><td>${className}</td><td>${subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher}</td>`;
      historyTableBody.appendChild(tr);
    });
    historyContainer.style.display = "block";
    // scroll to history
    historyContainer.scrollIntoView({behavior:'smooth'});
  } catch (err) {
    console.error(err);
    alert("Failed to load history.");
  }
});
