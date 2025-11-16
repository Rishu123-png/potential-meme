// ============================================================  
//  School Attendance System - script.js (FINAL FIXED v2)  
//  Description: Handles Firebase authentication, attendance saving,  
//               viewing (day-wise), and teacher dashboard control.  
//               Signup is disabled — only Firebase-created teachers  
//               can log in.  
//  Author: Rishu Jaswar  
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
  const showLogin = document.getElementById("showLogin");  
  const loginEmail = document.getElementById("loginEmail");  
  const loginPassword = document.getElementById("loginPassword");  
  const loginBtn = document.getElementById("loginBtn");  
  const authMessage = document.getElementById("authMessage");  
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
  let currentUser = null;  
  let teacherProfile = null;  
  let teacherSubject = null;  
  let teacherUid = null;  

  // Hide signup & restrict creation  
  if (authSignup) authSignup.style.display = "none";  
  if (showSignup) showSignup.style.display = "none";  
  if (signupBtn) signupBtn.disabled = true;  
  if (signupMessage)  
    signupMessage.textContent =  
      "Account creation is disabled. Only admin-created teachers can log in.";  

  dashboard.style.display = "none";  
  if (authLogin) authLogin.style.display = "block";  

  // --- Populate dropdowns ---  
  function populateClassSubjectSelects() {  
    if (!classSelect) return;  
    classSelect.innerHTML = `<option value="">Select Class</option>`;  
    const classes = Object.keys(studentsData || {});  
    classes.forEach((c) => {  
      const opt = document.createElement("option");  
      opt.value = c;  
      opt.textContent = c;  
      classSelect.appendChild(opt);  
    });  

    if (!subjectSelect) return;  
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

  // --- Fancy Calendar ---  
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

  // --- Update save button ---  
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
        saveAll.title = `You can only save attendance for your subject: ${teacherSubject}`;  
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

  // --- Render student list ---  
  function renderStudentsFor(className, subjectName) {  
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
    list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));  

    if (list.length === 0) {  
      studentListContainer.innerHTML = `<p class="msg">No students found for ${className} / ${subjectName}.</p>`;  
      updateSaveButtonState();  
      return;  
    }  

    list.forEach((student) => {  
      const div = document.createElement("div");  
      div.className = "student-row";  
      const selId = `status-${escapeId(className)}-${escapeId(  
        subjectName  
      )}-${escapeId(student)}`;  
      const disabledAttr =  
        teacherSubject && subjectName !== teacherSubject ? "disabled" : "";  
      div.innerHTML = `  
        <span>${student}</span>  
        <div style="display:flex;gap:8px;align-items:center">  
          <select id="${selId}" ${disabledAttr}>  
            <option>Present</option>  
            <option>Absent</option>  
          </select>  
        </div>`;  
      studentListContainer.appendChild(div);  
    });  

    updateSaveButtonState();  
  }  

  classSelect?.addEventListener("change", () =>  
    renderStudentsFor(classSelect.value, subjectSelect.value)  
  );  
  subjectSelect?.addEventListener("change", () => {  
    renderStudentsFor(classSelect.value, subjectSelect.value);  
    updateSaveButtonState();  
  });  

  // --- Save Attendance ---  
  saveAll?.addEventListener("click", async () => {  
    if (!currentUser) {  
      alert("Please login first.");  
      return;  
    }  
    const className = classSelect.value;  
    const subjectName = subjectSelect.value;  
    if (!className || !subjectName) {  
      alert("Select class and subject first.");  
      return;  
    }  

    if (!teacherSubject || subjectName !== teacherSubject) {  
      alert(  
        `You are not allowed to save attendance for "${subjectName}". You can only save for "${teacherSubject}".`  
      );  
      return;  
    }  

    const rows = studentListContainer.querySelectorAll(".student-row");  
    if (rows.length === 0) {  
      alert("No students found to save.");  
      return;  
    }  

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
          timestamp: ts,  
        });  
      }  
      alert("✅ Attendance saved successfully for " + date);  
    } catch (err) {  
      console.error("Save error:", err);  
      alert("Error saving attendance. Check console for details.");  
    }  
  });  

  // --- View History ---  
  async function loadHistoryForDate(dateStr) {  
    historyTableBody.innerHTML = "";  
    historyContainer.style.display = "none";  
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

      rows.forEach((r) => {  
        const tr = document.createElement("tr");  
        tr.innerHTML = `<td>${r.date}</td><td>${r.className}</td><td>${r.subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher}</td>`;  
        historyTableBody.appendChild(tr);  
      });  

      historyContainer.style.display = "block";  
      historyContainer.scrollIntoView({ behavior: "smooth" });  
    } catch (err) {  
      console.error("History load error:", err);  
      alert("Failed to load history. See console for details.");  
    }  
  }  

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

  // --- Login + Logout ---  
  loginBtn?.addEventListener("click", async () => {  
    authMessage.textContent = "";  
    try {  
      await signInWithEmailAndPassword(  
        auth,  
        loginEmail.value,  
        loginPassword.value  
      );  
    } catch (err) {  
      console.error("Login error:", err);  
      authMessage.textContent = err.message || "Login failed.";  
    }  
  });  

  logoutBtn?.addEventListener("click", async () => {  
    await signOut(auth);  
  });  

  // --- Auth State ---  
  onAuthStateChanged(auth, async (user) => {  
    currentUser = user || null;  

    if (!user) {  
      authLogin.style.display = "block";  
      dashboard.style.display = "none";  
      teacherProfile = null;  
      teacherSubject = null;  
      teacherUid = null;  
      updateSaveButtonState();  
      return;  
    }  

    try {  
      // ✅ FIXED PART BELOW  
      const teacherRef = ref(db, "teachers/" + user.uid);  
      const snap = await get(teacherRef);  
      teacherProfile = snap.exists() ? snap.val() : null;  
    } catch (e) {  
      console.warn("Teacher profile read failed:", e);  
      teacherProfile = null;  
    }  

    if (!teacherProfile || !teacherProfile.subject) {  
      alert(  
        "Access denied: your account is not registered as a teacher in the system."  
      );  
      await signOut(auth);  
      return;  
    }  

    teacherUid = user.uid;  
    teacherSubject = teacherProfile.subject || null;  

    authLogin.style.display = "none";  
    dashboard.style.display = "block";  

    welcome.textContent = `Welcome, ${teacherProfile.name || user.email}`;  
    teacherMeta.textContent = `${teacherProfile.subject} • ${  
      teacherProfile.class || ""  
    }`;  
    if (teacherProfile.photoURL) teacherAvatar.src = teacherProfile.photoURL;  

    populateClassSubjectSelects();  
    if (teacherSubject) subjectSelect.value = teacherSubject;  
    renderStudentsFor(classSelect.value, subjectSelect.value);  
    updateSaveButtonState();  
  });