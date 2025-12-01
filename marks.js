// marks.js
// Marks & Prediction page logic (standalone module)
//
// Usage: <script type="module" src="marks.js"></script>
// Requires:
//  - firebase.js exporting { auth, db } (your existing file)
//  - Chart.js included in the page (via CDN <script> tag)
//
// Features:
//  - Lists students that have `teacher === auth.currentUser.uid`
//  - Loads and displays marks saved at `students/<id>/marks`
//  - Save marks -> update students/<id>/marks
//  - Recompute predictions (UT-2 & Annual) from UT-1 & Half-Yearly
//  - Predict marks from study hours
//  - Draw performance chart (Chart.js)
//  - Graceful handling when user not logged in / no students / missing DOM

import { auth, db } from "./firebase.js";
import {
  ref,
  onValue,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* ----------------- Utilities ------------------ */
function $(id) { return document.getElementById(id); }

function safeText(el, text) {
  if (!el) return;
  el.innerText = text ?? "";
}

function tryGet(fn, fallback = null) {
  try { return fn(); } catch (e) { return fallback; }
}


/* ----------------- DOM refs (may be null if page missing elements) ----------------- */
const studentSelect = $("marksStudentSelect");
const marksForm = $("marksForm");
const marksStudentName = $("marksStudentName");

const ut1Score = $("ut1Score");
const ut1Max = $("ut1Max");
const hyScore = $("hyScore");
const hyMax = $("hyMax");
const ut2Score = $("ut2Score");
const ut2Max = $("ut2Max");
const annualScore = $("annualScore");
const annualMax = $("annualMax");

const saveMarksBtn = $("saveMarksBtn");
const predictBtn = $("predictBtn");
const clearMarksBtn = $("clearMarksBtn");
const studyHoursInput = $("studyHours");
const studyPredictBtn = null; // optional button in markup uses onclick inline

const predictionSummary = $("predictionSummary");
const studyHourPrediction = $("studyHourPrediction");
const performanceCanvas = $("performanceChart");

/* Chart instance */
let chartInstance = null;

/* ----------------- Auth helper ------------------ */
function waitForUserReady(cb, tries = 30) {
  if (auth && auth.currentUser) return cb();
  if (tries <= 0) return console.warn("User not available yet.");
  setTimeout(() => waitForUserReady(cb, tries - 1), 200);
}

/* ----------------- Main init (exported) ------------------ */
export function initMarksPage() {
  // If page DOM not present, do nothing
  if (!studentSelect) {
    console.warn("marks.js: marksStudentSelect not found — page likely not marks.html");
    return;
  }

  // wait for auth currentUser
  waitForUserReady(async () => {
    const user = auth.currentUser;
    if (!user) {
      // not logged in — redirect to login
      window.location.href = "index.html";
      return;
    }

    // Wire UI handlers
    studentSelect.innerHTML = `<option value="">-- Loading students --</option>`;
    studentSelect.onchange = handleStudentSelectChange;

    if (saveMarksBtn) saveMarksBtn.onclick = handleSaveMarks;
    if (predictBtn) predictBtn.onclick = recomputePrediction;
    if (clearMarksBtn) clearMarksBtn.onclick = clearMarks;
    // study hours inline button in HTML calls predictStudyHourMarks(); keep function global:
    window.predictStudyHourMarks = predictStudyHourMarks;

    // Load teacher's students and populate dropdown
    await loadTeacherStudents(user.uid);
  });
}

/* ----------------- Load students that belong to teacher ------------------ */
async function loadTeacherStudents(teacherUid) {
  try {
    const studentsRef = ref(db, "students");
    // We'll use onValue to keep it reactive (if you prefer one-shot use get())
    onValue(studentsRef, snap => {
      const data = snap.val() || {};
      const arr = [];
      for (const id in data) {
        const s = data[id];
        if (!s) continue;
        // Filter to teacher's students
        if (s.teacher && s.teacher === teacherUid) {
          arr.push({ id, name: s.name || "(no name)" });
        }
      }

      if (!studentSelect) return;
      studentSelect.innerHTML = `<option value="">-- Select student --</option>`;
      if (arr.length === 0) {
        studentSelect.innerHTML += `<option value="">(No students found)</option>`;
        // hide form
        if (marksForm) marksForm.style.display = "none";
        safeText(marksStudentName, "");
        return;
      }

      arr.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.innerText = s.name;
        studentSelect.appendChild(opt);
      });

      // If only one student, optionally select it:
      // (commented out to require teacher choose)
      // if (arr.length === 1) { studentSelect.value = arr[0].id; studentSelect.dispatchEvent(new Event('change')); }
    });
  } catch (err) {
    console.error("loadTeacherStudents error", err);
    alert("Failed to load students. Open console for details.");
  }
}

/* ----------------- Student select change ------------------ */
function handleStudentSelectChange(e) {
  const id = studentSelect.value;
  if (!id) {
    if (marksForm) marksForm.style.display = "none";
    return;
  }
  if (marksForm) marksForm.style.display = "block";
  loadStudentMarks(id);
}

/* ----------------- Load a student's marks + name ------------------ */
async function loadStudentMarks(studentId) {
  if (!studentId) return;
  try {
    const snap = await get(ref(db, `students/${studentId}`));
    if (!snap.exists()) {
      alert("Student not found in database.");
      return;
    }
    const stu = snap.val() || {};
    safeText(marksStudentName, stu.name || "(Student)");

    const marks = (stu.marks) ? stu.marks : (stu.marks === undefined ? {} : stu.marks);
    // support both `marks` under student and older code that put marks directly (defensive)
    const d = marks || {};

    // Fill inputs (if exist)
    if (ut1Score) ut1Score.value = tryGet(() => d.ut1Score ?? "", "");
    if (ut1Max) ut1Max.value = tryGet(() => d.ut1Max ?? "25", "25");
    if (hyScore) hyScore.value = tryGet(() => d.hyScore ?? "", "");
    if (hyMax) hyMax.value = tryGet(() => d.hyMax ?? "100", "100");
    if (ut2Score) ut2Score.value = tryGet(() => d.ut2Score ?? "", "");
    if (ut2Max) ut2Max.value = tryGet(() => (d.ut2Max ?? "25"), "25");
    if (annualScore) annualScore.value = tryGet(() => d.annualScore ?? "", "");
    if (annualMax) annualMax.value = tryGet(() => (d.annualMax ?? "100"), "100");

    // Update chart
    drawPerformanceChart({
      ut1Score: Number(d.ut1Score || 0),
      hyScore: Number(d.hyScore || 0),
      ut2Score: Number(d.ut2Score || 0),
      annualScore: Number(d.annualScore || 0)
    });
  } catch (err) {
    console.error("loadStudentMarks error", err);
    alert("Failed to load student marks.");
  }
}

/* ----------------- Save marks ------------------ */
async function handleSaveMarks() {
  const studentId = studentSelect.value;
  if (!studentId) return alert("Select a student first.");

  // read values safely
  const payload = {
    ut1Score: (ut1Score?.value || "").toString(),
    ut1Max: (ut1Max?.value || "25").toString(),
    hyScore: (hyScore?.value || "").toString(),
    hyMax: (hyMax?.value || "100").toString(),
    ut2Score: (ut2Score?.value || "").toString(),
    ut2Max: (ut2Max?.value || "25").toString(),
    annualScore: (annualScore?.value || "").toString(),
    annualMax: (annualMax?.value || "100").toString()
  };

  try {
    // write to students/<id>/marks
    await update(ref(db, `students/${studentId}/marks`), payload);
    alert("Marks saved successfully.");
  } catch (err) {
    console.error("saveMarks error", err);
    alert("Failed to save marks — check console.");
  }
}

/* ----------------- Clear inputs ------------------ */
function clearMarks() {
  if (ut1Score) ut1Score.value = "";
  if (ut1Max) ut1Max.value = "25";
  if (hyScore) hyScore.value = "";
  if (hyMax) hyMax.value = "100";
  if (ut2Score) ut2Score.value = "";
  if (ut2Max) ut2Max.value = "25";
  if (annualScore) annualScore.value = "";
  if (annualMax) annualMax.value = "100";
  if (predictionSummary) predictionSummary.innerText = "";
  if (studyHourPrediction) studyHourPrediction.innerText = "";
  drawPerformanceChart({ ut1Score:0, hyScore:0, ut2Score:0, annualScore:0 });
}

/* ----------------- Prediction logic ------------------ */
function recomputePrediction() {
  const ut1 = Number(ut1Score?.value || 0);
  const hy = Number(hyScore?.value || 0);

  if (!ut1 || !hy) {
    if (predictionSummary) predictionSummary.innerText = "Enter UT-1 & Half-Yearly first.";
    return;
  }

  const predictedUT2 = Math.round(ut1 * 0.4 + hy * 0.6);
  const predictedAnnual = Math.round(hy * 0.5 + predictedUT2 * 0.5);

  if (ut2Score) ut2Score.value = predictedUT2;
  if (annualScore) annualScore.value = predictedAnnual;

  if (predictionSummary) predictionSummary.innerText = `Predicted UT-2: ${predictedUT2}\nPredicted Annual: ${predictedAnnual}`;

  // update chart with predicted values
  drawPerformanceChart({
    ut1Score: ut1,
    hyScore: hy,
    ut2Score: predictedUT2,
    annualScore: predictedAnnual
  });
}

/* ----------------- Study hours -> estimate ------------------ */
function predictStudyHourMarks() {
  const hours = Number(studyHoursInput?.value || 0);
  if (!hours) {
    if (studyHourPrediction) studyHourPrediction.innerText = "Enter study hours.";
    return;
  }
  let predicted = Math.min(100, Math.round(hours * 7));
  let category = "Average";
  if (predicted > 85) category = "Topper";
  else if (predicted < 40) category = "Failer";
  if (studyHourPrediction) studyHourPrediction.innerText = `Estimated Score: ${predicted}/100\nStatus: ${category}`;
}

/* ----------------- Chart drawing ------------------ */
function drawPerformanceChart(marks) {
  // marks: { ut1Score, hyScore, ut2Score, annualScore }
  if (!performanceCanvas) return;
  const ctx = performanceCanvas.getContext("2d");
  const dataArr = [
    Number(marks.ut1Score || 0),
    Number(marks.hyScore || 0),
    Number(marks.ut2Score || 0),
    Number(marks.annualScore || 0)
  ];

  // destroy previous chart
  try { if (chartInstance) chartInstance.destroy(); } catch (e) {}

  // Chart.js must be present on the page
  if (typeof Chart === "undefined") {
    // fallback: no Chart.js; just return
    console.warn("Chart.js not loaded — skipping chart draw.");
    return;
  }

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["UT-1", "Half-Yearly", "UT-2", "Annual"],
      datasets: [{
        label: "Performance Trend",
        data: dataArr,
        fill: false,
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 4
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100
        }
      }
    }
  });
}

/* Expose initMarksPage globally so onload attr works if used */
window.initMarksPage = initMarksPage;

/* Also expose the study-hour function (in case HTML button uses onclick attr) */
window.predictStudyHourMarks = predictStudyHourMarks;