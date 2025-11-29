// marks.js
import { auth, db } from "./firebase.js";
import { ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getCurrentUser, waitForAuth } from "./script.js";


let chartInstance = null;

// DOM refs will be resolved at runtime
function $(id) { return document.getElementById(id); }

export function initMarksPage() {
  waitForAuth(() => {
    const teacherData = JSON.parse(localStorage.getItem("teacherData"));
    if (!teacherData) {
      // fallback: try to read teacher profile from /teachers/{uid}
      const u = auth.currentUser;
      if (!u) { window.location.href = "index.html"; return; }
      // If teacherData not in localStorage, assume teacherProfile stored under teachers/{uid}
      // We will read once (safest)
      // But for simplicity if localStorage missing redirect to dashboard to build profile
      // (You can change to auto-read)
      window.location.href = "dashboard.html";
      return;
    }

    const classId = teacherData.classAssigned;
    if (!classId) { alert('No classAssigned in teacherData'); return; }

    const studentSelect = $('marksStudentSelect');
    const form = $('marksForm');
    // load students list under classes/{classId}/students
    const studentsRef = ref(db, `classes/${classId}/students`);
    onValue(studentsRef, snap => {
      studentSelect.innerHTML = `<option value="">-- Select Student --</option>`;
      snap.forEach(st => {
        const d = st.val();
        studentSelect.innerHTML += `<option value="${st.key}">${d.name || 'Student'}</option>`;
      });
    });

    studentSelect.onchange = () => {
      const id = studentSelect.value;
      if (!id) return (form.style.display = "none");
      form.style.display = "block";
      loadStudentMarks(classId, id);
    };

    $('saveMarksBtn').onclick = saveMarks;
    $('predictBtn').onclick = recomputePrediction;
    $('clearMarksBtn').onclick = clearMarks;
    // study hours predict button is inline in HTML; we leave it calling predictStudyHourMarks()
  });
}

function getFields() {
  return {
    ut1Score: $('ut1Score'),
    ut1Max: $('ut1Max'),
    hyScore: $('hyScore'),
    hyMax: $('hyMax'),
    ut2Score: $('ut2Score'),
    ut2Max: $('ut2Max'),
    annualScore: $('annualScore'),
    annualMax: $('annualMax'),
    predictionSummary: $('predictionSummary'),
    marksStudentSelect: $('marksStudentSelect'),
    studyHourPrediction: $('studyHourPrediction')
  };
}

function loadStudentMarks(classId, studentId) {
  const studentRef = ref(db, `classes/${classId}/students/${studentId}`);
  const marksRef = ref(db, `classes/${classId}/students/${studentId}/marks`);

  // student name
  onValue(studentRef, snap => {
    const stu = snap.val() || {};
    $('marksStudentName').innerText = stu.name || '';
  });

  onValue(marksRef, snap => {
    const d = snap.val() || {};
    const f = getFields();
    f.ut1Score.value = d.ut1Score || "";
    f.ut1Max.value = d.ut1Max || "";
    f.hyScore.value = d.hyScore || "";
    f.hyMax.value = d.hyMax || "";
    f.ut2Score.value = d.ut2Score || "";
    f.ut2Max.value = d.ut2Max || "25";
    f.annualScore.value = d.annualScore || "";
    f.annualMax.value = d.annualMax || "100";
    drawPerformanceChart({
      ut1Score: Number(d.ut1Score || 0),
      hyScore: Number(d.hyScore || 0),
      ut2Score: Number(d.ut2Score || 0),
      annualScore: Number(d.annualScore || 0)
    });
  });
}

function saveMarks() {
  const f = getFields();
  const studentId = f.marksStudentSelect.value;
  const teacherData = JSON.parse(localStorage.getItem("teacherData"));
  if (!teacherData) { alert('Teacher data missing'); return; }
  const classId = teacherData.classAssigned;
  if (!studentId) return alert('Select a student.');
  const data = {
    ut1Score: f.ut1Score.value,
    ut1Max: f.ut1Max.value,
    hyScore: f.hyScore.value,
    hyMax: f.hyMax.value,
    ut2Score: f.ut2Score.value,
    ut2Max: f.ut2Max.value,
    annualScore: f.annualScore.value,
    annualMax: f.annualMax.value
  };
  update(ref(db, `classes/${classId}/students/${studentId}/marks`), data)
    .then(() => alert('Marks saved successfully'))
    .catch(e => { console.error(e); alert('Save failed'); });
}

function clearMarks() {
  const f = getFields();
  f.ut1Score.value = ""; f.ut1Max.value = "";
  f.hyScore.value = ""; f.hyMax.value = "";
  f.ut2Score.value = ""; f.ut2Max.value = "25";
  f.annualScore.value = ""; f.annualMax.value = "100";
  f.predictionSummary.innerText = "";
}

function recomputePrediction() {
  const f = getFields();
  const ut1 = Number(f.ut1Score.value);
  const hy = Number(f.hyScore.value);
  if (!ut1 || !hy) { f.predictionSummary.innerText = "Enter UT-1 & Half-Yearly to compute prediction."; return; }
  const predictedUT2 = Math.round(ut1 * 0.4 + hy * 0.6);
  const predictedAnnual = Math.round(hy * 0.5 + predictedUT2 * 0.5);
  f.ut2Score.value = predictedUT2;
  f.annualScore.value = predictedAnnual;
  f.predictionSummary.innerText = `Predicted UT-2: ${predictedUT2}\nPredicted Annual: ${predictedAnnual}`;
}

export function predictStudyHourMarks() {
  const hours = Number(document.getElementById("studyHours").value);
  const f = getFields();
  if (!hours) { f.studyHourPrediction.innerText = "Enter valid study hours."; return; }
  let predicted = Math.min(100, Math.round(hours * 7));
  let category = "Average";
  if (predicted > 85) category = "Topper";
  else if (predicted < 40) category = "Failer";
  f.studyHourPrediction.innerText = `Estimated Score: ${predicted}/100\nPerformance: ${category}`;
}

function drawPerformanceChart(marks) {
  const canvas = document.getElementById("performanceChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const labels = ["UT-1","Half-Yearly","UT-2","Annual"];
  const data = [Number(marks.ut1Score||0), Number(marks.hyScore||0), Number(marks.ut2Score||0), Number(marks.annualScore||0)];
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Performance", data, borderWidth:2, tension:0.4 }] }
  });
}