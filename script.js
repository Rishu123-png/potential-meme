// script.js
import { app, auth, db } from "./firebase.js";
import { studentsData } from "./students.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { ref, get, push } from "firebase/database";

window.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
  const authLogin = document.getElementById("authLogin");
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

  // --- Local state ---
  let currentUser = null;
  let teacherProfile = null;
  let teacherSubject = null;
  let teacherUid = null;

  // --- UI Setup ---
  authLogin.style.display = "block";
  dashboard.style.display = "none";

  const escapeId = str => (str || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9-]/g, "");

  const populateClassSubjectSelects = () => {
    classSelect.innerHTML = `<option value="">Select Class</option>`;
    Object.keys(studentsData || {}).forEach(cls => {
      const opt = document.createElement("option");
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });

    const subjSet = new Set();
    Object.values(studentsData).forEach(clsObj => {
      Object.keys(clsObj).forEach(subj => subjSet.add(subj));
    });

    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    Array.from(subjSet).sort().forEach(subj => {
      const opt = document.createElement("option");
      opt.value = subj;
      opt.textContent = subj;
      subjectSelect.appendChild(opt);
    });
  };

  const updateSaveButtonState = () => {
    if (!saveAll) return;
    if (!teacherSubject) {
      saveAll.disabled = true;
      saveAll.style.opacity = "0.6";
      return;
    }
    const selectedSubject = subjectSelect.value || "";
    saveAll.disabled = selectedSubject !== teacherSubject;
    saveAll.title = saveAll.disabled
      ? `You can only save attendance for ${teacherSubject}`
      : "Save attendance for displayed students";
    saveAll.style.opacity = saveAll.disabled ? "0.6" : "1";
  };

  const renderStudentsFor = (className, subjectName) => {
    studentListContainer.innerHTML = "";
    if (!className || !subjectName) {
      studentListContainer.innerHTML = `<p class="msg">Please select class and subject.</p>`;
      updateSaveButtonState();
      return;
    }

    const list = studentsData[className]?.[subjectName] || [];
    if (!list.length) {
      studentListContainer.innerHTML = `<p class="msg">No students found for ${className} / ${subjectName}.</p>`;
      updateSaveButtonState();
      return;
    }

    list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    list.forEach(student => {
      const div = document.createElement("div");
      div.className = "student-row";
      const selId = `status-${escapeId(className)}-${escapeId(subjectName)}-${escapeId(student)}`;
      const disabledAttr = teacherSubject && subjectName !== teacherSubject ? "disabled" : "";
      div.innerHTML = `
        <span>${student}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="${selId}" ${disabledAttr}>
            <option>Present</option>
            <option>Absent</option>
          </select>
        </div>
      `;
      studentListContainer.appendChild(div);
    });

    updateSaveButtonState();
  };

  classSelect?.addEventListener("change", () => renderStudentsFor(classSelect.value, subjectSelect.value));
  subjectSelect?.addEventListener("change", () => { renderStudentsFor(classSelect.value, subjectSelect.value); updateSaveButtonState(); });

  // --- Save Attendance ---
  saveAll?.addEventListener("click", async () => {
    if (!currentUser) return alert("Please login first");
    const className = classSelect.value;
    const subjectName = subjectSelect.value;
    if (!className || !subjectName) return alert("Select class & subject first");
    if (subjectName !== teacherSubject) return alert(`You can only save for ${teacherSubject}`);

    const rows = studentListContainer.querySelectorAll(".student-row");
    if (!rows.length) return alert("No students to save");

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
      alert(`✅ Attendance saved successfully for ${date}`);
    } catch (err) {
      console.error(err);
      alert("Error saving attendance. See console");
    }
  });

  // --- Load History ---
  const loadHistoryForDate = async (dateStr) => {
    historyTableBody.innerHTML = "";
    historyContainer.style.display = "none";
    if (!dateStr) return alert("Pick a date first");

    try {
      const snap = await get(ref(db, `attendance/${dateStr}`));
      if (!snap.exists()) return alert("No attendance for " + dateStr);

      const all = snap.val();
      const rows = [];
      Object.keys(all).forEach(cls => {
        Object.keys(all[cls]).forEach(subj => {
          Object.keys(all[cls][subj]).forEach(id => {
            rows.push({ date: dateStr, className: cls, subjectName: subj, ...all[cls][subj][id] });
          });
        });
      });

      rows.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.date}</td><td>${r.className}</td><td>${r.subjectName}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher}</td>`;
        historyTableBody.appendChild(tr);
      });

      historyContainer.style.display = "block";
      historyContainer.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      console.error(err);
      alert("Failed to load history. See console");
    }
  };

  viewHistory?.addEventListener("click", async () => {
    const today = new Date().toISOString().split("T")[0];
    await loadHistoryForDate(today);
  });

  loadDate?.addEventListener("click", async () => {
    const dateStr = historyDateInput.value;
    if (!dateStr) return alert("Pick a date");
    await loadHistoryForDate(dateStr);
  });

  // --- Login / Logout ---
  loginBtn?.addEventListener("click", async () => {
    authMessage.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value.trim());
    } catch (err) {
      console.error(err);
      authMessage.textContent = err.message || "Login failed";
    }
  });

  logoutBtn?.addEventListener("click", async () => { await signOut(auth); });

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (!user) {
      authLogin.style.display = "block";
      dashboard.style.display = "none";
      teacherProfile = teacherSubject = teacherUid = null;
      updateSaveButtonState();
      return;
    }

    try {
      const snap = await get(ref(db, `teachers/${user.uid}`));
      teacherProfile = snap.exists() ? snap.val() : null;
      if (!teacherProfile || !teacherProfile.subject) {
        alert("Access denied. Contact admin.");
        await signOut(auth);
        return;
      }

      teacherUid = user.uid;
      teacherSubject = teacherProfile.subject;

      authLogin.style.display = "none";
      dashboard.style.display = "block";
      welcome.textContent = teacherProfile.name || user.email;
      teacherMeta.textContent = `${teacherProfile.subject} • ${teacherProfile.class || ""}`;
      if (teacherProfile.photoURL) teacherAvatar.src = teacherProfile.photoURL;

      populateClassSubjectSelects();
      subjectSelect.value = teacherSubject;
      renderStudentsFor(classSelect.value, subjectSelect.value);
      updateSaveButtonState();
    } catch (err) { console.error(err); }
  });

  // --- Flatpickr ---
  if (typeof flatpickr !== "undefined" && historyDateInput) {
    flatpickr(historyDateInput, { dateFormat:"Y-m-d", defaultDate:new Date(), allowInput:false });
  }

  populateClassSubjectSelects();
});