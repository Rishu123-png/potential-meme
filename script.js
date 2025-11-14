// ============================================================    
//  School Attendance System - script.js (FINAL FIXED v3)    
//  Description: Firebase authentication + attendance system    
//               with teacher authorization from database.    
//  Signup disabled. Only admin-created teachers may login.    
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
  const auth = getAuth(app);
  const db = getDatabase(app);

  // UI elements
  const authLogin = document.getElementById("authLogin");
  const authSignup = document.getElementById("authSignup");
  const showSignup = document.getElementById("showSignup");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginBtn = document.getElementById("loginBtn");
  const authMessage = document.getElementById("authMessage");

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
  let currentUser = null;
  let teacherProfile = null;
  let teacherSubject = null;
  let teacherUid = null;

  // Disable signup UI
  if (authSignup) authSignup.style.display = "none";
  if (showSignup) showSignup.style.display = "none";

  dashboard.style.display = "none";
  authLogin.style.display = "block";

  // Populate class/subject dropdowns
  function populateClassSubjectSelects() {
    classSelect.innerHTML = `<option value="">Select Class</option>`;
    const classes = Object.keys(studentsData || {});
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      classSelect.appendChild(opt);
    });

    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    const subjects = new Set();
    classes.forEach(c => {
      Object.keys(studentsData[c] || {}).forEach(sub => subjects.add(sub));
    });

    subjects.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      subjectSelect.appendChild(opt);
    });
  }
  populateClassSubjectSelects();

  // Fancy Calendar
  if (typeof flatpickr !== "undefined" && historyDateInput) {
    flatpickr(historyDateInput, {
      dateFormat: "Y-m-d",
      defaultDate: new Date(),
      allowInput: false,
    });
  }

  function escapeId(str) {
    return (str || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "");
  }

  // Save button state
  function updateSaveButtonState() {
    if (!teacherSubject) {
      saveAll.disabled = true;
      return;
    }
    if (subjectSelect.value !== teacherSubject) {
      saveAll.disabled = true;
      return;
    }
    saveAll.disabled = false;
  }

  // Render students
  function renderStudentsFor(className, subjectName) {
    studentListContainer.innerHTML = "";

    if (!className || !subjectName) {
      studentListContainer.innerHTML = `<p class="msg">Select class & subject.</p>`;
      updateSaveButtonState();
      return;
    }

    const list =
      studentsData[className] && studentsData[className][subjectName]
        ? [...studentsData[className][subjectName]]
        : [];

    list.sort((a, b) => a.localeCompare(b));

    list.forEach(student => {
      const div = document.createElement("div");
      div.className = "student-row";

      const selId = `status-${escapeId(className)}-${escapeId(
        subjectName
      )}-${escapeId(student)}`;

      const disabled = subjectName !== teacherSubject ? "disabled" : "";

      div.innerHTML = `
        <span>${student}</span>
        <select id="${selId}" ${disabled}>
          <option>Present</option>
          <option>Absent</option>
        </select>
      `;

      studentListContainer.appendChild(div);
    });

    updateSaveButtonState();
  }

  classSelect.addEventListener("change", () =>
    renderStudentsFor(classSelect.value, subjectSelect.value)
  );
  subjectSelect.addEventListener("change", () => {
    renderStudentsFor(classSelect.value, subjectSelect.value);
    updateSaveButtonState();
  });

  // Save attendance
  saveAll.addEventListener("click", async () => {
    const cls = classSelect.value;
    const sub = subjectSelect.value;

    if (sub !== teacherSubject) {
      alert("You can save attendance only for your subject.");
      return;
    }

    const rows = document.querySelectorAll(".student-row");
    const date = new Date().toISOString().split("T")[0];
    const ts = new Date().toISOString();

    for (const row of rows) {
      const name = row.querySelector("span").innerText;
      const status = row.querySelector("select").value;

      await push(ref(db, `attendance/${date}/${cls}/${sub}`), {
        student: name,
        status,
        teacher: currentUser.email,
        teacherUid,
        timestamp: ts,
      });
    }

    alert("Attendance saved!");
  });

  // History
  async function loadHistoryForDate(dateStr) {
    historyTableBody.innerHTML = "";
    const snap = await get(ref(db, `attendance/${dateStr}`));

    if (!snap.exists()) {
      alert("No records.");
      return;
    }

    const data = snap.val();

    for (const c of Object.keys(data)) {
      for (const s of Object.keys(data[c])) {
        for (const id of Object.keys(data[c][s])) {
          const rec = data[c][s][id];

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${c}</td>
            <td>${s}</td>
            <td>${rec.student}</td>
            <td>${rec.status}</td>
            <td>${rec.teacher}</td>
          `;
          historyTableBody.appendChild(tr);
        }
      }
    }

    historyContainer.style.display = "block";
  }

  viewHistory.addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    loadHistoryForDate(today);
  });

  loadDate.addEventListener("click", () => {
    loadHistoryForDate(historyDateInput.value);
  });

  // Login
  loginBtn.addEventListener("click", async () => {
    authMessage.textContent = "";

    try {
      await signInWithEmailAndPassword(
        auth,
        loginEmail.value,
        loginPassword.value
      );
    } catch (err) {
      authMessage.textContent = err.message;
    }
  });

  logoutBtn.addEventListener("click", () => signOut(auth));

  // Auth state
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      dashboard.style.display = "none";
      authLogin.style.display = "block";
      return;
    }

    // IMPORTANT: READ FROM teachers/<uid>
    const teacherRef = ref(db, "teachers/" + user.uid);
    const snap = await get(teacherRef);

    if (!snap.exists()) {
      alert("Access denied: Your teacher profile does not exist.");
      await signOut(auth);
      return;
    }

    teacherProfile = snap.val();
    teacherUid = user.uid;
    teacherSubject = teacherProfile.subject;

    welcome.textContent = `Welcome, ${teacherProfile.name}`;
    teacherMeta.textContent = `${teacherProfile.subject} • ${teacherProfile.class}`;

    dashboard.style.display = "block";
    authLogin.style.display = "none";

    populateClassSubjectSelects();
    subjectSelect.value = teacherSubject;
    renderStudentsFor(classSelect.value, subjectSelect.value);
  });
});