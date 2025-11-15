// ============================================================
//  School Attendance System - script.js (FINAL HYBRID v2.1)
//  Single-file app logic (uses firebase.js -> exports `app`)
//  - Reads students from RTDB at `students/<class>/<subject>`
//  - Teachers stored at `teachers/<uid>`
//  - Add / Delete students (respects teacher.class restriction if set)
//  - Save attendance, view history, monthly printable report
// ============================================================

import { app } from "./firebase.js";

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
  set,
  remove,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

window.addEventListener("DOMContentLoaded", () => {
  // Firebase services
  const auth = getAuth(app);
  const db = getDatabase(app);

  // UI elements (must match your HTML)
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

  // Manage-students inline controls (present in your HTML)
  const newStudentName = document.getElementById("newStudentName");
  const newStudentClass = document.getElementById("newStudentClass");
  const newStudentSubject = document.getElementById("newStudentSubject");
  const addStudentBtn = document.getElementById("addStudentBtn");

  const printReportBtn = document.getElementById("printReport");

  // Local state
  let currentUser = null;
  let teacherProfile = null;
  let teacherSubject = null;
  let teacherUid = null;

  // flatpickr init (if included)
  if (typeof flatpickr !== "undefined" && historyDateInput) {
    flatpickr(historyDateInput, {
      dateFormat: "Y-m-d",
      defaultDate: new Date(),
      allowInput: false,
    });
  }

  // Helpers
  function escapeId(str) {
    return (str || "").replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-]/g, "");
  }

  // Populate class & subject selects from RTDB `students/`
  async function populateClassSubjectSelects() {
    if (!classSelect || !subjectSelect) return;

    classSelect.innerHTML = `<option value="">Select Class</option>`;
    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;

    try {
      const snap = await get(ref(db, "students"));
      const data = snap.exists() ? snap.val() : null;

      if (data) {
        const classes = Object.keys(data).sort();
        classes.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          classSelect.appendChild(opt);
        });

        const subjSet = new Set();
        classes.forEach((c) => {
          Object.keys(data[c] || {}).forEach((s) => subjSet.add(s));
        });
        Array.from(subjSet)
          .sort()
          .forEach((s) => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            subjectSelect.appendChild(opt);
          });
        // populate manage-students selectors too
        populateManageStudentSelectors(data);
        return;
      }
    } catch (err) {
      console.warn("populateClassSubjectSelects read error:", err);
    }

    // fallback data (if no students node exists yet)
    const fallbackClasses = ["11A", "11B", "12A", "12B"];
    fallbackClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      classSelect.appendChild(opt);
    });
    const fallbackSubjects = [
      "Physics",
      "Chemistry",
      "Maths",
      "English",
      "Biology",
      "CS",
      "AI",
      "Data Science",
    ];
    fallbackSubjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      subjectSelect.appendChild(opt);
    });
    // populate manage-students selectors with fallback too
    populateManageStudentSelectors();
  }

  // Populate newStudentClass / newStudentSubject selects (manage-students area)
  // Accepts optional 'data' from DB to be more accurate
  function populateManageStudentSelectors(data = null) {
    if (!newStudentClass || !newStudentSubject) return;

    newStudentClass.innerHTML = `<option value="">Select Class</option>`;
    newStudentSubject.innerHTML = `<option value="">Select Subject</option>`;

    if (data) {
      const classes = Object.keys(data).sort();
      classes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        newStudentClass.appendChild(opt);
      });
      const subjSet = new Set();
      classes.forEach((c) => Object.keys(data[c] || {}).forEach(s => subjSet.add(s)));
      Array.from(subjSet).sort().forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        newStudentSubject.appendChild(opt);
      });
      return;
    }

    // fallback
    const fallbackClasses = ["11A", "11B", "12A", "12B"];
    fallbackClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      newStudentClass.appendChild(opt);
    });
    const fallbackSubjects = [
      "Physics",
      "Chemistry",
      "Maths",
      "English",
      "Biology",
      "CS",
      "AI",
      "Data Science",
    ];
    fallbackSubjects.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      newStudentSubject.appendChild(opt);
    });
  }

  // Load students for class+subject from DB
  async function loadStudentsFromDB(className, subjectName) {
    if (!className || !subjectName) return [];
    try {
      const snap = await get(ref(db, `students/${className}/${subjectName}`));
      if (!snap.exists()) return [];
      const raw = snap.val();
      const list = [];
      for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (v && typeof v === "object" && "name" in v) {
          list.push({ id: k, name: v.name });
        } else if (typeof v === "string") {
          list.push({ id: k, name: v });
        } else if (v === true) {
          list.push({ id: k, name: k });
        } else {
          list.push({ id: k, name: String(v) });
        }
      }
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      return list;
    } catch (err) {
      console.error("loadStudentsFromDB error:", err);
      return [];
    }
  }

  // Render students for selected class & subject (with delete buttons)
  async function renderStudentsFor(className, subjectName) {
    if (!studentListContainer) return;
    studentListContainer.innerHTML = "";

    if (!className || !subjectName) {
      studentListContainer.innerHTML = `<p class="msg">Please select class and subject.</p>`;
      updateSaveButtonState();
      return;
    }

    const students = await loadStudentsFromDB(className, subjectName);

    if (!students.length) {
      studentListContainer.innerHTML = `<p class="msg">No students configured for ${className} / ${subjectName}. Use Add Student to create.</p>`;
      updateSaveButtonState();
      return;
    }

    students.forEach((s) => {
      const row = document.createElement("div");
      row.className = "student-row";
      row.dataset.studentId = s.id;

      const canEditClass = !teacherProfile || !teacherProfile.class || teacherProfile.class === className;
      const disabledSelectAttr = teacherSubject && subjectName !== teacherSubject ? "disabled" : "";

      // build row: student name, attendance select, (optional) delete button
      row.innerHTML = `
        <span class="student-name">${s.name}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="att-status" ${disabledSelectAttr}>
            <option>Present</option>
            <option>Absent</option>
          </select>
          ${canEditClass ? `<button class="delete-student small-btn" title="Delete student">✖</button>` : ""}
        </div>
      `;

      // attach delete
      const delBtn = row.querySelector(".delete-student");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm(`Delete student "${s.name}" from ${className}/${subjectName}?`)) return;
          try {
            await remove(ref(db, `students/${className}/${subjectName}/${s.id}`));
            await renderStudentsFor(className, subjectName);
            await populateClassSubjectSelects();
          } catch (err) {
            console.error("delete student error:", err);
            alert("Failed to delete student. See console.");
          }
        });
      }

      studentListContainer.appendChild(row);
    });

    updateSaveButtonState();
  }

  // Wire class/subject selects change -> re-render
  classSelect?.addEventListener("change", () => renderStudentsFor(classSelect.value, subjectSelect.value));
  subjectSelect?.addEventListener("change", () => {
    renderStudentsFor(classSelect.value, subjectSelect.value);
    updateSaveButtonState();
  });

  // Update state & tooltip for Save button
  function updateSaveButtonState() {
    if (!saveAll) return;
    saveAll.disabled = true;
    saveAll.style.opacity = "0.6";
    saveAll.title = "Sign in and select a subject.";

    if (!teacherSubject) {
      saveAll.title = "Not authorized to save attendance.";
      return;
    }
    const selectedSubject = subjectSelect?.value || "";
    if (!selectedSubject) {
      saveAll.title = "Select a subject to enable saving.";
      return;
    }
    if (selectedSubject !== teacherSubject) {
      saveAll.title = `You can only save attendance for your subject: ${teacherSubject}`;
      return;
    }
    saveAll.disabled = false;
    saveAll.style.opacity = "1";
    saveAll.title = "Save attendance for displayed students";
  }

  // Save attendance: iterate visible student rows and push to DB
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

    // permission
    if (!teacherSubject || subjectName !== teacherSubject) {
      alert(`You are not allowed to save attendance for "${subjectName}". You can only save for "${teacherSubject}".`);
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
        const name = row.querySelector(".student-name").innerText;
        const status = row.querySelector(".att-status").value;
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

  // Load history for date
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

  // Add student via inline form (if present)
  if (addStudentBtn) {
    addStudentBtn.addEventListener("click", async () => {
      const name = newStudentName?.value && newStudentName.value.trim();
      const cls = newStudentClass?.value;
      const subj = newStudentSubject?.value;
      if (!name || !cls || !subj) {
        alert("Provide student name, class and subject.");
        return;
      }
      // teacher class restriction
      if (teacherProfile && teacherProfile.class && cls !== teacherProfile.class) {
        alert(`You can add students only for your class (${teacherProfile.class}).`);
        return;
      }
      try {
        const newRef = push(ref(db, `students/${cls}/${subj}`));
        await set(newRef, { name });
        alert(`Student "${name}" added to ${cls} / ${subj}.`);
        // refresh UI
        await populateClassSubjectSelects();
        classSelect.value = cls;
        subjectSelect.value = subj;
        await renderStudentsFor(cls, subj);
        // clear form
        if (newStudentName) newStudentName.value = "";
      } catch (err) {
        console.error("Add student error:", err);
        alert("Failed to add student. See console.");
      }
    });
  }

  // Print monthly report modal & generator
  async function generateAndPrintMonthlyReport(className, subjectName, month) {
    try {
      const snap = await get(ref(db, "attendance"));
      if (!snap.exists()) {
        alert("No attendance records found.");
        return;
      }
      const allDates = snap.val();

      const report = {};
      for (const dateKey of Object.keys(allDates)) {
        if (!dateKey.startsWith(month)) continue;
        const byClass = allDates[dateKey][className];
        if (!byClass) continue;
        const bySubject = byClass[subjectName];
        if (!bySubject) continue;
        for (const entryId of Object.keys(bySubject)) {
          const rec = bySubject[entryId];
          if (!rec || !rec.student) continue;
          const name = rec.student;
          if (!report[name]) report[name] = { present: 0, absent: 0, days: {} };
          const stat = (rec.status || "").toLowerCase();
          if (stat === "present") report[name].present++;
          else report[name].absent++;
          report[name].days[dateKey] = rec.status || "";
        }
      }

      const rows = Object.keys(report)
        .sort()
        .map((name) => {
          const r = report[name];
          return `<tr>
            <td>${name}</td>
            <td style="text-align:center">${r.present}</td>
            <td style="text-align:center">${r.absent}</td>
          </tr>`;
        })
        .join("");

      const html = `
        <html>
        <head>
          <title>Attendance Report - ${className} / ${subjectName} - ${month}</title>
          <style>
            body { font-family: Arial, sans-serif; padding:20px; color:#111 }
            h1,h2 { margin: 0 0 8px 0; }
            table { width:100%; border-collapse: collapse; margin-top:12px; }
            th, td { border:1px solid #ccc; padding:8px; }
            th { background:#f0f0f0; text-align:left }
          </style>
        </head>
        <body>
          <h1>Attendance Report</h1>
          <h2>${className} • ${subjectName} • ${month}</h2>
          <table>
            <thead>
              <tr><th>Student</th><th>Present</th><th>Absent</th></tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="3">No records for this month.</td></tr>`}
            </tbody>
          </table>
          <p style="margin-top:18px;">Generated: ${new Date().toLocaleString()}</p>
        </body>
        </html>
      `;

      const w = window.open("", "_blank");
      if (!w) {
        alert("Popup blocked — allow popups for this site to print the report.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      // Give the new window a moment to render
      setTimeout(() => {
        w.focus();
        w.print();
      }, 400);
    } catch (err) {
      console.error("Generate report error:", err);
      alert("Failed to generate report. See console.");
    }
  }

  // Print button present in header area
  if (printReportBtn) {
    printReportBtn.addEventListener("click", () => {
      // simple inline prompt for class/subject/month
      const cls = classSelect?.value;
      const subj = subjectSelect?.value;
      const month = prompt("Enter month to print (YYYY-MM)", new Date().toISOString().slice(0, 7));
      if (!cls || !subj || !month) {
        alert("Select class & subject and enter month (YYYY-MM).");
        return;
      }
      if (!/^\d{4}-\d{2}$/.test(month)) {
        alert("Month must be YYYY-MM");
        return;
      }
      generateAndPrintMonthlyReport(cls, subj, month);
    });
  }

  // Login button
  loginBtn?.addEventListener("click", async () => {
    if (authMessage) authMessage.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
      // auth state handler will update UI
    } catch (err) {
      console.error("Login error:", err);
      if (authMessage) authMessage.textContent = err.message || "Login failed.";
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error", err);
    }
  });

  // Auth state changed -> load teacher p