// script.js (module)
// Requires: firebase.js exporting `app`, students.js exporting `studentsData`
// Uses: flatpickr loaded in index.html

import { app } from "./firebase.js";
import { studentsData } from "./students.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  push,
  child
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import {
  getStorage,
  ref as sRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// Run when DOM ready
window.addEventListener("DOMContentLoaded", () => {
  // init firebase services
  const auth = getAuth(app);
  const db = getDatabase(app);
  const storage = getStorage(app);

  // UI elements
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

  // local state
  let currentTeacher = null; // profile object from DB (name, email, class, subject, photoURL)
  let currentUser = null; // firebase auth user
  let teacherSubject = null; // teacher's subject string
  let teacherUid = null;

  // Toggle login/signup
  showSignup?.addEventListener("click", (e) => {
    e.preventDefault();
    authLogin.style.display = "none";
    authSignup.style.display = "block";
    authMessage.textContent = "";
  });
  showLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    authSignup.style.display = "none";
    authLogin.style.display = "block";
    signupMessage.textContent = "";
  });

  // Populate class & subject selects from studentsData
  function populateClassSubjectSelects() {
    classSelect.innerHTML = `<option value="">Select Class</option>`;
    const classes = Object.keys(studentsData || {});
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      classSelect.appendChild(opt);
    });

    // gather unique subjects across classes
    const subjSet = new Set();
    classes.forEach(c => {
      Object.keys(studentsData[c] || {}).forEach(s => subjSet.add(s));
    });
    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    Array.from(subjSet).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      subjectSelect.appendChild(opt);
    });
  }
  populateClassSubjectSelects();

  // initialize flatpickr
  let fp = null;
  if (typeof flatpickr !== "undefined" && historyDateInput) {
    fp = flatpickr(historyDateInput, {
      dateFormat: "Y-m-d",
      defaultDate: new Date(),
      allowInput: false
    });
  }

  // helper: escape id
  function escapeId(str){ return str.replace(/\s+/g,'_').replace(/[^A-Za-z0-9_\-]/g,''); }

  // render students for selected class+subject
  function renderStudentsFor(className, subjectName) {
    studentListContainer.innerHTML = "";
    if (!className || !subjectName) {
      studentListContainer.innerHTML = `<p class="msg">Please select class and subject.</p>`;
      return;
    }

    const list = (studentsData[className] && studentsData[className][subjectName]) ? [...studentsData[className][subjectName]] : [];
    list.sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));

    if (list.length === 0) {
      studentListContainer.innerHTML = `<p class="msg">No students configured for ${className} / ${subjectName}.</p>`;
      return;
    }

    // For each student, create row with select. If current teacher does not teach this subject => read-only.
    list.forEach(student => {
      const div = document.createElement("div");
      div.className = "student-row";
      const id = `status-${escapeId(className)}-${escapeId(subjectName)}-${escapeId(student)}`;
      const disabled = (teacherSubject && subjectName !== teacherSubject) ? "disabled" : "";
      div.innerHTML = `
        <span>${student}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="${id}" ${disabled}>
            <option>Present</option>
            <option>Absent</option>
          </select>
        </div>`;
      studentListContainer.appendChild(div);
    });
  }

  classSelect.addEventListener("change", () => renderStudentsFor(classSelect.value, subjectSelect.value));
  subjectSelect.addEventListener("change", () => renderStudentsFor(classSelect.value, subjectSelect.value));

  // SAVE attendance for all displayed students (teacher can only save for their own subject)
  saveAll.addEventListener("click", async () => {
    if (!currentUser) { alert("Please login."); return; }
    const className = classSelect.value;
    const subjectName = subjectSelect.value;
    if (!className || !subjectName) { alert("Select class and subject."); return; }

    // If teacher tries to save for a subject that's not their own, block saving
    if (teacherSubject && subjectName !== teacherSubject) {
      alert("You can only save attendance for your own subject (" + teacherSubject + ").");
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
        await push(ref(db, `attendance/${date}/${className}/${subjectName}`), {
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
      alert("Error saving attendance.");
    }
  });

  // VIEW history for selected date (today by default when clicking viewHistory)
  async function loadHistoryForDate(dateStr) {
    historyTableBody.innerHTML = "";
    historyContainer.style.display = "none";

    if (!dateStr) { alert("Pick a date first."); return; }

    const className = classSelect.value;
    const subjectName = subjectSelect.value;
    // fetch attendance/date node
    try {
      const snap = await get(ref(db, `attendance/${dateStr}`));
      if (!snap.exists()) { alert("No attendance records for " + dateStr); return; }
      const all = snap.val();
      const rows = [];
      // if class and subject selected, show those only; otherwise show all matching entries
      if (className && subjectName) {
        const group = all[className]?.[subjectName] || null;
        if (!group) { alert("No records for that class & subject on " + dateStr); return; }
        for (const id of Object.keys(group)) {
          const rec = group[id];
          rows.push({ date: dateStr, className, subjectName, ...rec });
        }
      } else {
        // iterate whole date (be careful if huge)
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

      // render table
      rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.date}</td><td>${r.className}</td><td>${r.subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher || r.teacherUid || ''}</td>`;
        historyTableBody.appendChild(tr);
      });
      historyContainer.style.display = "block";
      historyContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error("history load error", err);
      alert("Failed to load history.");
    }
  }

  // button handlers
  viewHistory.addEventListener("click", async () => {
    // default to today
    const today = new Date().toISOString().split("T")[0];
    await loadHistoryForDate(today);
  });

  loadDate?.addEventListener("click", async () => {
    const dateStr = historyDateInput.value;
    if (!dateStr) { alert("Pick date from calendar"); return; }
    await loadHistoryForDate(dateStr);
  });

  // Signup: create user, upload avatar, save teacher profile
  signupBtn.addEventListener("click", async () => {
    const name = fullName.value?.trim();
    const email = signupEmail.value?.trim();
    const password = signupPassword.value || "";
    const cls = signupClass.value?.trim();
    const subj = signupSubject.value?.trim();
    const file = avatarUpload?.files?.[0];

    signupMessage.textContent = "";
    if (!name || !email || password.length < 6 || !cls || !subj) {
      signupMessage.textContent = "Please fill all fields (password min 6 chars).";
      return;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      let photoURL = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
      if (file) {
        const fileRef = sRef(storage, `avatars/${uid}/${file.name}`);
        await uploadBytes(fileRef, file);
        photoURL = await getDownloadURL(fileRef);
      }

      // save teacher profile to DB
      await set(ref(db, `teachers/${uid}`), {
        name, email, class: cls, subject: subj, photoURL, createdAt: new Date().toISOString()
      });

      // update auth profile for convenience
      try { await updateProfile(userCred.user, { displayName: name, photoURL }); } catch(e){ /*ignore*/ }

      signupMessage.textContent = "Account created! You can now log in.";
      authSignup.style.display = "none";
      authLogin.style.display = "block";
      loginEmail.value = email;
      loginPassword.value = "";
    } catch (err) {
      console.error("signup err", err);
      signupMessage.textContent = "Error: " + (err.message || "Sign up failed");
    }
  });

  // Login
  loginBtn.addEventListener("click", async () => {
    authMessage.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
      // UI update occurs in onAuthStateChanged
    } catch (err) {
      console.error("login err", err);
      authMessage.textContent = err.message || "Login failed";
    }
  });

  // Logout
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });

  // Auth state monitoring - show dashboard only after verifying auth
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      // fetch teacher profile from DB
      try {
        const snap = await get(child(ref(db), `teachers/${user.uid}`));
        currentTeacher = snap.exists() ? snap.val() : null;
      } catch (e) {
        console.warn("teacher profile read failed", e);
        currentTeacher = null;
      }

      // set local teacher info
      teacherUid = user.uid;
      teacherSubject = currentTeacher?.subject || null;
      // show dashboard
      authLogin.style.display = "none";
      authSignup.style.display = "none";
      dashboard.style.display = "block";

      // set teacher header info
      welcome.textContent = `Welcome, ${currentTeacher?.name || user.email}`;
      teacherMeta.textContent = currentTeacher ? `${currentTeacher.subject} • ${currentTeacher.class}` : user.email;
      teacherAvatar.src = currentTeacher?.photoURL || teacherAvatar.src;

      // ensure selects are populated (in case students.js changed)
      populateClassSubjectSelects();

      // auto-select the subject in the dropdown to teacher subject if present
      if (teacherSubject) {
        // try to set the subjectSelect value if that option exists
        const opt = Array.from(subjectSelect.options).find(o => o.value === teacherSubject);
        if (opt) subjectSelect.value = teacherSubject;
      }

      // render students for selected values (if both selected)
      renderStudentsFor(classSelect.value, subjectSelect.value);

    } else {
      // not logged in
      dashboard.style.display = "none";
      authLogin.style.display = "block";
      // clear UI sensitive areas
      studentListContainer.innerHTML = "";
      historyTableBody.innerHTML = "";
      historyContainer.style.display = "none";
      authMessage.textContent = "";
    }
  }, err => {
    console.error("onAuthStateChanged error", err);
  });

  // safety: populate selects again if studentsData updated
  function populateClassSubjectSelects() {
    classSelect.innerHTML = `<option value="">Select Class</option>`;
    const classes = Object.keys(studentsData || {});
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      classSelect.appendChild(opt);
    });

    // gather unique subjects
    const subjSet = new Set();
    classes.forEach(c => {
      Object.keys(studentsData[c] || {}).forEach(s => subjSet.add(s));
    });
    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    Array.from(subjSet).sort().forEach(s => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      subjectSelect.appendChild(opt);
    });
  }

  // helper: child reference in DB
  function child(nodeRef, path) {
    // helper to create child ref from db root
    return ref(db, path);
  }

  // Initial UI state: hide dashboard
  dashboard.style.display = "none";
  authLogin.style.display = "block";
});
