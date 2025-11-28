// script.js
// Master script for all pages: login, dashboard, add-student, mark-attendance, analytics, top-bunkers, marks
// Uses firebase.js (auth & db) and firebase CDN database/auth methods (v10.12.5)
//
// NOTE: keep firebase.js filled with your Firebase config for this to work.

console.log("SCRIPT JS LOADED (merged)");

import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref, onValue, get, set, push
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* ======================================================
   GLOBAL STATE (used across many pages)
   - currentTeacherUser: firebase auth user
   - teacherProfile: teacher meta from DB
   - allStudents: cache of students from RTDB
   - selectedStudentId: when marking a student
   - currentClassFilter: filter on dashboard
   ====================================================== */
let currentTeacherUser = null;
let teacherProfile = null;
let allStudents = {};
let selectedStudentId = null;
let currentClassFilter = "";

/* ------------------------------------------------------
   Keep auth state in sync
   ------------------------------------------------------ */
onAuthStateChanged(auth, (user) => {
  currentTeacherUser = user;
});

/* ======================================================
   LOGIN / LOGOUT (page: index.html)
   ====================================================== */
window.login = async function () {
  const email = (document.getElementById('email')?.value || '').trim();
  const password = document.getElementById('password')?.value || '';
  if (!email || !password) { alert('Enter email and password'); return; }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    currentTeacherUser = cred.user;
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('Login failed', err);
    alert(err.message || 'Login failed');
  }
};

window.logout = async function () {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Sign out error', err);
  } finally {
    window.location.href = 'index.html';
  }
};

/* ======================================================
   TEACHER PROFILE + CLASS LIST (used in dashboard & add-student)
   - loadTeacherProfile populates teacherName, subject and class lists
   ====================================================== */
export async function loadTeacherProfile() {
  if (!auth.currentUser) {
    setTimeout(loadTeacherProfile, 200);
    return;
  }

  const uid = auth.currentUser.uid;
  const teacherRef = ref(db, `teachers/${uid}`);

  onValue(teacherRef, snapshot => {
    const data = snapshot.val() || {};
    teacherProfile = data;

    const nameEl = document.getElementById('teacherName');
    const subjectEl = document.getElementById('teacherSubject');
    const subjectAddEl = document.getElementById('teacherSubjectAdd');

    if (nameEl) nameEl.innerText = data.name || '';
    if (subjectEl) subjectEl.innerText = data.subject || '';
    if (subjectAddEl) subjectAddEl.innerText = data.subject || '';

    const classes = data.classes || {};
    const ids = Array.isArray(classes) ? classes : (Object.keys(classes).length ? Object.values(classes) : []);

    function fill(selectId) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select class --</option>';
      ids.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        sel.appendChild(opt);
      });
    }

    fill('classSelect');
    fill('classSelectAdd');
    fill('analyticsClassSelect');
  });
}

/* ======================================================
   DASHBOARD: Students list (page: dashboard.html)
   - initDashboardPage sets change handlers and calls loadStudents
   - loadStudents subscribes to 'students' node and caches allStudents
   - renderStudentsTable generates rows with action buttons
   ====================================================== */

window.initDashboardPage = function () {
  if (!auth.currentUser) {
    setTimeout(window.initDashboardPage, 300);
    return;
  }

  loadTeacherProfile();

  const classSel = document.getElementById('classSelect');
  if (classSel) {
    classSel.onchange = () => {
      currentClassFilter = classSel.value || '';
      loadStudents(currentClassFilter);
    };
  }

  loadStudents();
};

export function loadStudents(selectedClass = '') {
  currentClassFilter = selectedClass || currentClassFilter || '';

  const studentsRef = ref(db, 'students');
  onValue(studentsRef, snap => {
    allStudents = snap.val() || {};
    renderStudentsTable();
  });
}

function renderStudentsTable() {
  const table = document.getElementById('studentsTable');
  if (!table) return;

  table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Absences</th><th>Actions</th></tr>`;

  if (!allStudents) return;

  for (const id in allStudents) {
    const s = allStudents[id];
    if (!s) continue;

    if (currentClassFilter && s.class !== currentClassFilter) continue;

    if (s.teacher && auth.currentUser && s.teacher !== auth.currentUser.uid) continue;

    const row = table.insertRow();
    row.insertCell(0).innerText = s.name || '';
    row.insertCell(1).innerText = s.class || '';

    const absences = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    row.insertCell(2).innerText = absences;

    const actionCell = row.insertCell(3);

    if (!s.teacher) {
      const claimBtn = document.createElement('button');
      claimBtn.innerText = 'Claim';
      claimBtn.onclick = () => claimStudent(id);
      actionCell.appendChild(claimBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.innerText = 'Edit';
    editBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    editBtn.onclick = async () => {
      const newName = prompt('Edit student name', s.name || '');
      if (!newName) return;
      try {
        await set(ref(db, `students/${id}/name`), newName);
      } catch (err) { alert('Failed to edit name'); console.error(err); }
    };
    actionCell.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.innerText = 'Delete';
    delBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    delBtn.onclick = async () => {
      if (!confirm('Delete this student?')) return;
      try {
        await set(ref(db, `students/${id}`), null);
      } catch (err) { alert('Delete failed'); console.error(err); }
    };
    actionCell.appendChild(delBtn);

    const markBtn = document.createElement('button');
    markBtn.innerText = 'Mark Attendance';
    markBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    markBtn.onclick = () => {
      localStorage.removeItem('selectedClass');
      localStorage.setItem('selectedStudentId', id);
      if (document.getElementById('attendanceModal')) {
        openAttendanceModal(id);
      } else {
        window.location.href = 'mark-attendance.html';
      }
    };
    actionCell.appendChild(markBtn);
  }
}

/* ======================================================
   ADD STUDENT (page: add-student.html)
   - initAddStudentsPage loads teacher class list
   - addStudent pushes a new student to RTDB
   ====================================================== */
window.initAddStudentsPage = function () {
  if (!auth.currentUser) { setTimeout(window.initAddStudentsPage, 300); return; }
  loadTeacherProfile();
};

window.addStudent = async function () {
  if (!auth.currentUser) { alert('Please login'); window.location.href = 'index.html'; return; }

  const name = (document.getElementById('studentName')?.value || '').trim();
  const cls = (document.getElementById('classSelectAdd')?.value || '').trim();
  if (!name || !cls) { alert('Enter student name and class'); return; }

  const subj = teacherProfile?.subject || '';
  try {
    const newRef = push(ref(db, 'students'));
    await set(newRef, { name, class: cls, subject: subj, teacher: auth.currentUser.uid, attendance: {} });
    alert('Student added');
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('Add student failed', err);
    alert('Failed to add student');
  }
};

/* ======================================================
   CLAIM STUDENT
   ====================================================== */
window.claimStudent = async function (studentId) {
  if (!auth.currentUser) { alert('Login required'); return; }
  if (!confirm('Claim this student and assign to your account?')) return;
  try {
    await set(ref(db, `students/${studentId}/teacher`), auth.currentUser.uid);
    alert('Student claimed');
    loadStudents(currentClassFilter);
  } catch (err) {
    console.error('Claim failed', err);
    alert('Failed to claim student');
  }
};

/* ======================================================
   UTILITY: fixTeacherIds (console helper)
   - use from browser console: fixTeacherIds()
   ====================================================== */
window.fixTeacherIds = async function () {
  if (!auth.currentUser) { alert('Login first'); return; }
  if (!confirm('This will set ALL students that have NO teacher to your account. Proceed?')) return;
  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (!s.teacher) {
        await set(ref(db, `students/${id}/teacher`), auth.currentUser.uid);
      }
    }
    alert('Done. Refreshing students list.');
    loadStudents(currentClassFilter);
  } catch (err) {
    console.error('fixTeacherIds error', err);
    alert('Failed to fix teacher ids — check DB rules and console for details.');
  }
};

/* ======================================================
   NAV: goToMarkAttendance (class mode)
   - Saves selected class & navigates to mark-attendance.html
   ====================================================== */
window.goToMarkAttendance = function () {
  const classSel = document.getElementById('classSelect');
  const cls = classSel ? classSel.value : currentClassFilter;
  if (!cls) return alert('Select a class first');
  localStorage.setItem('selectedClass', cls);
  localStorage.removeItem('selectedStudentId');
  window.location.href = 'mark-attendance.html';
};

/* ======================================================
   ATTENDANCE MODAL & MONTH VIEW (dashboard modal)
   - openAttendanceModal used from dashboard to open small modal (optional)
   - loadAttendanceMonth used for modal
   ====================================================== */
export function openAttendanceModal(studentId) {
  selectedStudentId = studentId;
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('attendanceModal');

  if (!modal || !overlay) {
    localStorage.setItem('selectedStudentId', studentId);
    localStorage.removeItem('selectedClass');
    window.location.href = 'mark-attendance.html';
    return;
  }

  const student = allStudents[studentId] || {};
  document.getElementById('modalStudentName').innerText = student.name || 'Student';
  overlay.style.display = 'block';
  modal.style.display = 'block';

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const mp = document.getElementById('monthPicker');
  if (mp) mp.value = defaultMonth;

  loadAttendanceMonth();
}

window.closeModal = function () {
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('attendanceModal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
  selectedStudentId = null;
};

window.loadAttendanceMonth = async function () {
  const mp = document.getElementById('monthPicker');
  const month = mp?.value;
  if (!selectedStudentId) return;
  try {
    const snap = await get(ref(db, `students/${selectedStudentId}`));
    const student = snap.val() || {};
    const attendance = student.attendance || {};
    const table = document.getElementById('attendanceMonthTable');
    if (!table) return;

    table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;

    if (!month) {
      Object.keys(attendance).sort().forEach(date => {
        const status = attendance[date];
        const r = table.insertRow();
        r.insertCell(0).innerText = date;
        r.insertCell(1).innerText = status || '-';
        const p = r.insertCell(2).appendChild(document.createElement('button'));
        p.innerText = 'Present'; p.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${date}`), 'present'); loadAttendanceMonth(); };
        const a = r.insertCell(3).appendChild(document.createElement('button'));
        a.innerText = 'Absent'; a.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${date}`), 'absent'); loadAttendanceMonth(); };
      });
      return;
    }

    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return;
    const daysInMonth = new Date(y, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = attendance[dd] || '';
      const r = table.insertRow();
      r.insertCell(0).innerText = dd;
      const statusCell = r.insertCell(1); statusCell.innerText = status || '-';
      const pcell = r.insertCell(2);
      const pbtn = document.createElement('button'); pbtn.innerText = 'Present';
      pbtn.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${dd}`), 'present'); loadAttendanceMonth(); };
      pcell.appendChild(pbtn);
      const acell = r.insertCell(3);
      const abtn = document.createElement('button'); abtn.innerText = 'Absent';
      abtn.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${dd}`), 'absent'); loadAttendanceMonth(); };
      acell.appendChild(abtn);

      if (status === 'present') statusCell.style.color = 'lightgreen';
      if (status === 'absent') statusCell.style.color = '#ff7b7b';
    }
  } catch (err) {
    console.error('loadAttendanceMonth error', err);
  }
};

/* ======================================================
   MARK ATTENDANCE PAGE (mark-attendance.html)
   - initMarkAttendancePage decides if in class mode or student mode
   - loadMarkAttendanceMonth populates the table for the selected student/month
   - loadClassAttendanceUI dynamically builds class UI (radios) and saves attendance
   ====================================================== */

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

window.initMarkAttendancePage = async function () {
  if (!auth.currentUser) { setTimeout(window.initMarkAttendancePage, 300); return; }

  const classForMark = localStorage.getItem('selectedClass');
  selectedStudentId = localStorage.getItem('selectedStudentId') || null;

  if (classForMark) {
    await loadClassAttendanceUI(classForMark);
    return;
  }

  if (!selectedStudentId) { alert('No student selected. Go to dashboard and click "Mark Attendance".'); window.location.href = 'dashboard.html'; return; }

  try {
    const snap = await get(ref(db, `students/${selectedStudentId}`));
    const student = snap.val() || {};
    document.getElementById('studentNameLabel').innerText = student.name || '';
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const mp = document.getElementById('monthPickerMark');
    if (mp) mp.value = defaultMonth;
    document.getElementById('singleStudentUI').style.display = 'block';
    document.getElementById('classAttendanceUI').style.display = 'none';
    await loadMarkAttendanceMonth();
  } catch (err) {
    console.error('initMarkAttendancePage error', err);
    alert('Failed to load student');
    window.location.href = 'dashboard.html';
  }
};

window.loadMarkAttendanceMonth = async function () {
  const mp = document.getElementById('monthPickerMark');
  const month = mp?.value;
  if (!selectedStudentId) return;

  try {
    const snap = await get(ref(db, `students/${selectedStudentId}`));
    const student = snap.val() || {};
    const attendance = student.attendance || {};
    const table = document.getElementById('markAttendanceTable');
    if (!table) return;

    table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;

    const [y, m] = (month || '').split('-').map(Number);
    if (!y || !m) {
      Object.keys(attendance).sort().forEach(date => {
        const status = attendance[date];
        const r = table.insertRow();
        r.insertCell(0).innerText = date;
        r.insertCell(1).innerText = status || '-';
        const p = r.insertCell(2).appendChild(document.createElement('button'));
        p.innerText = 'Present'; p.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${date}`), 'present'); loadMarkAttendanceMonth(); };
        const a = r.insertCell(3).appendChild(document.createElement('button'));
        a.innerText = 'Absent'; a.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${date}`), 'absent'); loadMarkAttendanceMonth(); };
      });
      return;
    }

    const days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = attendance[dd] || '';
      const r = table.insertRow();
      r.insertCell(0).innerText = dd;
      const stCell = r.insertCell(1); stCell.innerText = status || '-';
      const p = r.insertCell(2).appendChild(document.createElement('button'));
      p.innerText = 'Present'; p.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${dd}`), 'present'); loadMarkAttendanceMonth(); };
      const a = r.insertCell(3).appendChild(document.createElement('button'));
      a.innerText = 'Absent'; a.onclick = async () => { await set(ref(db, `students/${selectedStudentId}/attendance/${dd}`), 'absent'); loadMarkAttendanceMonth(); };
      if (status === 'present') stCell.style.color = 'lightgreen';
      if (status === 'absent') stCell.style.color = '#ff7b7b';
    }
  } catch (err) {
    console.error('loadMarkAttendanceMonth error', err);
  }
};

/* CLASS MODE UI */
async function loadClassAttendanceUI(className) {
  const container = document.querySelector('.container');
  if (!container) return alert('Mark Attendance page missing container');

  // Show class UI container
  document.getElementById('classAttendanceUI').style.display = 'block';
  document.getElementById('singleStudentUI').style.display = 'none';
  // Build the class UI (keeps container element in the page clean)
  const html = `
    <div class="row" style="justify-content:space-between;">
      <h2>Mark Attendance — Class: <span id="classTitle"></span></h2>
<button id="viewClassAnalyticsBtn" class="btn-cta">View Analytics</button>
    </div>
    <div style="margin-top:8px;">
      <div>Class: <strong id="classTitleText"></strong></div>
      <div style="margin-top:8px;">
        <label for="attendanceDate">Date</label>
        <input id="attendanceDate" type="date" value="${todayDateString()}">
      </div>
    </div>
    <div class="table-wrap" style="margin-top:12px;">
      <table id="classAttendanceTable">
        <tr><th>Name</th><th>Present</th><th>Absent</th></tr>
      </table>
    </div>
    <div class="row" style="margin-top:8px;">
      <button id="saveClassAttendanceBtn" class="btn-cta">Save Attendance</button>
      <button id="cancelClassAttendanceBtn" class="btn-cta">Back</button>
      <button id="exportClassCSVBtn" class="btn-cta">Export CSV</button>
    </div>
  `;
  document.getElementById('classAttendanceUI').innerHTML = html;

  document.getElementById('classTitle').innerText = className;
  document.getElementById('classTitleText').innerText = className;

  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const rows = [];
    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (s.class !== className) continue;
      if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
      rows.push({ id, name: s.name || '' });
    }

    const table = document.getElementById('classAttendanceTable');
    if (!table) return;

    if (rows.length === 0) {
      const r = table.insertRow();
      const c = r.insertCell(0);
      c.colSpan = 3;
      c.innerText = 'No students found in this class for your account.';
    } else {
      rows.forEach((st) => {
        const r = table.insertRow();
        r.insertCell(0).innerText = st.name;
        const pcell = r.insertCell(1);
        const presentInput = document.createElement('input');
        presentInput.type = 'radio';
        presentInput.name = `att_${st.id}`;
        presentInput.value = 'present';
        presentInput.checked = true; // default present
        pcell.appendChild(presentInput);
        const acell = r.insertCell(2);
        const absentInput = document.createElement('input');
        absentInput.type = 'radio';
        absentInput.name = `att_${st.id}`;
        absentInput.value = 'absent';
        acell.appendChild(absentInput);
        r.dataset.studentId = st.id;
      });
    }

    document.getElementById('saveClassAttendanceBtn').onclick = async () => {
      const dateInput = document.getElementById('attendanceDate').value || todayDateString();
      await saveClassAttendance(rows, dateInput);
    };
    document.getElementById('cancelClassAttendanceBtn').onclick = () => {
      localStorage.removeItem('selectedClass');
      window.location.href = 'dashboard.html';
    };
    document.getElementById('exportClassCSVBtn').onclick = () => exportClassAttendanceCSV(rows, document.getElementById('attendanceDate').value || todayDateString());
    document.getElementById('viewClassAnalyticsBtn').onclick = () => {
      // Open analytics page prefilled with class & current month
      localStorage.setItem('analyticsClass', className);
      window.location.href = 'analytics.html';
    };
  } catch (err) {
    console.error('loadClassAttendanceUI error', err);
  }
}

async function saveClassAttendance(rows, dateStr) {
  if (!rows || rows.length === 0) { alert('No students to save'); return; }
  try {
    for (const st of rows) {
      const selected = document.querySelector(`input[name="att_${st.id}"]:checked`);
      const value = selected ? selected.value : 'present';
      await set(ref(db, `students/${st.id}/attendance/${dateStr}`), value);
    }
    alert('Attendance saved for ' + dateStr);
    localStorage.removeItem('selectedClass');
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('saveClassAttendance error', err);
    alert('Failed to save attendance — check console for details.');
  }
}

/* ======================================================
   EXPORTS (CSV / Excel) + PRINT
   ====================================================== */
function tableToCSV(headerRow, rows) {
  const all = [headerRow.join(',')].concat(rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')));
  return all.join('\n');
}

function downloadFile(filename, content, mime='text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

window.exportAttendanceCSV = async function () {
  if (!selectedStudentId) return alert('No student selected');
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const rows = Object.keys(attendance).sort().map(d => [d, attendance[d]]);
  const csv = tableToCSV(['Date','Status'], rows);
  downloadFile(`${(student.name||'student')}_attendance.csv`, csv, 'text/csv');
};

window.exportAttendanceCSVModal = async function () {
  const mp = document.getElementById('monthPicker');
  const month = mp?.value;
  if (!selectedStudentId) return alert('No student selected');
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const rows = Object.keys(attendance).sort().map(d => [d, attendance[d]]);
  const csv = tableToCSV(['Date','Status'], rows);
  downloadFile(`${(student.name||'student')}_attendance.csv`, csv, 'text/csv');
};

window.exportAttendanceExcel = async function () {
  if (!selectedStudentId) return alert('No student selected');
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const rows = Object.keys(attendance).sort().map(d => [d, attendance[d]]);
  const csv = tableToCSV(['Date','Status'], rows);
  downloadFile(`${(student.name||'student')}_attendance.xls`, csv, 'application/vnd.ms-excel');
};

window.exportClassAttendanceCSV = (rows, dateStr) => {
  if (!rows || rows.length === 0) return alert('No data to export');
  const csvRows = rows.map(st => {
    const selected = document.querySelector(`input[name="att_${st.id}"]:checked`);
    const value = selected ? selected.value : 'present';
    return [st.name, st.id, value];
  });
  const csv = tableToCSV(['Name','StudentId','Status'], csvRows);
  downloadFile(`class_attendance_${dateStr}.csv`, csv, 'text/csv');
};

function exportClassAttendanceCSV(rows, dateStr) {
  window.exportClassAttendanceCSV(rows, dateStr);
}

window.exportBunkersCSV = async function () {
  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const rows = [];
    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
      const absent = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
      if (absent > 0) rows.push([s.name||'', s.class||'', s.subject||'', absent]);
    }
    if (rows.length === 0) return alert('No bunkers found');
    const csv = tableToCSV(['Name','Class','Subject','Absences'], rows);
    downloadFile('top_bunkers.csv', csv, 'text/csv');
  } catch (err) {
    console.error('exportBunkersCSV', err);
  }
};

window.printReport = function () {
  const table = document.getElementById('markAttendanceTable') || document.getElementById('attendanceMonthTable');
  if (!table) return alert('Nothing to print');
  const w = window.open('', '', 'width=900,height=700');
  const title = (document.getElementById('studentNameLabel')?.innerText) || (document.getElementById('modalStudentName')?.innerText) || 'Attendance Report';
  w.document.write(`<h3>Monthly Attendance Report — ${title}</h3>`);
  w.document.write(table.outerHTML);
  w.document.close();
  w.print();
};

/* ======================================================
   TOP BUNKERS (page: top-bunkers.html)
   - initTopBunkersPage builds table with low attendance students
   ====================================================== */
window.initTopBunkersPage = async function () {
  if (!auth.currentUser) { setTimeout(window.initTopBunkersPage, 300); return; }
  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const bunkers = [];
    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
      const absentCount = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
      if (absentCount > 0) bunkers.push({ id, ...s, totalAbsent: absentCount });
    }
    bunkers.sort((a, b) => b.totalAbsent - a.totalAbsent);
    const table = document.getElementById('bunkersTable');
    if (!table) return;
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Subject</th><th>Absences</th></tr>`;
    bunkers.forEach(s => {
      const r = table.insertRow();
      r.insertCell(0).innerText = s.name;
      r.insertCell(1).innerText = s.class;
      r.insertCell(2).innerText = s.subject;
      const cell = r.insertCell(3); cell.innerText = s.totalAbsent;
      if (s.totalAbsent >= 3) cell.style.color = '#ffb4b4';
    });
  } catch (err) {
    console.error('initTopBunkersPage error', err);
  }
};

/* ======================================================
   MARKS + PREDICTION (marks.html area)
   - initMarksPage, loadMarksForStudent, saveMarksForStudent, computeAndShowPrediction
   - Already implemented earlier: kept intact
   ====================================================== */
/* (This section intentionally kept brief because your original code was included earlier in the big merged file.
   If you have a dedicated marks.html page, call initMarksPage() on load.)
*/

/* ======================================================
   ANALYTICS (new page: analytics.html)
   - initAnalyticsPage populates classes & default month
   - renderAnalytics fetches class students and monthly attendance and draws simple charts
   - Charts are plain SVG/DOM to avoid external libs; you can replace with Chart.js later
   ====================================================== */

window.initAnalyticsPage = function () {
  if (!auth.currentUser) { setTimeout(window.initAnalyticsPage, 300); return; }
  loadTeacherProfile();
  const now = new Date();
  document.getElementById('analyticsMonth').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const cls = localStorage.getItem('analyticsClass');
  if (cls) {
    const sel = document.getElementById('analyticsClassSelect');
    if (sel) sel.value = cls;
    localStorage.removeItem('analyticsClass');
  }
};

window.renderAnalytics = async function () {
  const className = document.getElementById('analyticsClassSelect')?.value;
  const month = document.getElementById('analyticsMonth')?.value;
  if (!className) return alert('Select a class');
  if (!month) return alert('Select a month');

  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const students = [];
    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (s.class !== className) continue;
      if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
      students.push({ id, name: s.name || '', attendance: s.attendance || {} });
    }

    // Analyze month
    const [y, m] = month.split('-').map(Number);
    const mdays = new Date(y, m, 0).getDate();
    const totals = { present: 0, absent: 0, dayTotals: Array(mdays).fill(0) };
    const studentTotals = [];

    for (const s of students) {
      let spresent = 0, sabsent = 0;
      for (let d = 1; d <= mdays; d++) {
        const dd = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const st = s.attendance[dd];
        if (st === 'present') { spresent++; totals.present++; totals.dayTotals[d-1]++; }
        if (st === 'absent') { sabsent++; totals.absent++; }
      }
      studentTotals.push({ id: s.id, name: s.name, present: spresent, absent: sabsent, totalDays: mdays });
    }

    // Simple charts area
    const area = document.getElementById('chartsArea');
    area.innerHTML = '';

    // Summary card
    const summary = document.createElement('div');
    summary.className = 'card';
    const totalStudents = students.length;
    const totalPossible = totalStudents * mdays;
    const presentPct = totalPossible ? Math.round((totals.present/totalPossible)*100) : 0;
    summary.innerHTML = `<div class="row space"><div><strong>${className} — ${month}</strong><div style="color:var(--muted)">${totalStudents} students · ${mdays} days</div></div>
                         <div style="text-align:right"><div style="font-size:22px">${presentPct}%</div><div style="color:var(--muted)">Present overall</div></div></div>`;
    area.appendChild(summary);

    // Day trend (bar)
    const dayCard = document.createElement('div');
    dayCard.className = 'card';
    dayCard.innerHTML = `<strong>Daily Present Count</strong><div id="dayBar" style="margin-top:10px; display:flex; gap:6px; align-items:end; height:140px;"></div>`;
    area.appendChild(dayCard);
    const dayBar = dayCard.querySelector('#dayBar');
    const maxDay = Math.max(...totals.dayTotals, 1);
    totals.dayTotals.forEach((v,i) => {
      const col = document.createElement('div');
      col.style.width = '100%';
      col.style.flex = '1';
      const h = Math.round((v/maxDay)*100);
      col.style.height = `${Math.max(6, h)}%`;
      col.style.background = 'linear-gradient(180deg,#0ea5e9,#3b82f6)';
      col.style.borderRadius = '6px';
      col.title = `Day ${i+1}: ${v} present`;
      dayBar.appendChild(col);
    });

    // Student ranking (table)
    const rankCard = document.createElement('div');
    rankCard.className = 'card';
    rankCard.innerHTML = `<strong>Student Attendance — present days</strong>`;
    const twrap = document.createElement('div');
    twrap.className = 'table-wrap';
    const t = document.createElement('table');
    t.innerHTML = `<tr><th>Name</th><th>Present</th><th>Absent</th><th>%</th></tr>`;
    studentTotals.sort((a,b)=>b.present-a.present).forEach(s => {
      const tr = t.insertRow();
      tr.insertCell(0).innerText = s.name;
      tr.insertCell(1).innerText = s.present;
      tr.insertCell(2).innerText = s.absent;
      tr.insertCell(3).innerText = Math.round((s.present/s.totalDays)*100) + '%';
    });
    twrap.appendChild(t);
    rankCard.appendChild(twrap);
    area.appendChild(rankCard);

    // Export / print buttons
    const ctrl = document.createElement('div');
    ctrl.className = 'row';
    ctrl.style.marginTop = '10px';
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn-ghost';
    exportBtn.innerText = 'Export Monthly Excel';
    exportBtn.onclick = async () => {
      // Build CSV: header days + students rows
      const header = ['Name'];
      for (let d=1; d<=mdays; d++) header.push(`D${d}`);
      const rows = studentTotals.map(st => {
        const row = [st.name];
        for (let d=1; d<=mdays; d++) {
          const dd = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const stv = (students.find(s=>s.id===st.id).attendance[dd] || '').substring(0,1);
          row.push(stv);
        }
        return row;
      });
      const csv = tableToCSV(header, rows);
      downloadFile(`analytics_${className}_${month}.xls`, csv, 'application/vnd.ms-excel');
    };
    ctrl.appendChild(exportBtn);

    const printBtn = document.createElement('button');
    printBtn.className = 'btn-primary';
    printBtn.innerText = 'Print Report';
    printBtn.onclick = () => {
      const w = window.open('', '', 'width=900,height=700');
      w.document.write(`<h3>Attendance — ${className} — ${month}</h3>`);
      w.document.write(summary.outerHTML + rankCard.innerHTML);
      w.document.close();
      w.print();
    };
    ctrl.appendChild(printBtn);
    area.appendChild(ctrl);

  } catch (err) {
    console.error('renderAnalytics error', err);
    alert('Failed to render analytics');
  }
};

/* Provide a button from mark-attendance page to open analytics for the selected student */
window.openAnalyticsForStudent = function () {
  if (!selectedStudentId) { alert('No student selected'); return; }
  // store selected student in localStorage so analytics page can show per-student charts if desired
  localStorage.setItem('analyticsStudentId', selectedStudentId);
  window.location.href = 'analytics.html';
};

/* ======================================================
   Small helper used by marks prediction (not duplicated)
   ====================================================== */
function toPct(x) { if (x == null) return '-'; return (x*100).toFixed(1) + '%'; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ======================================================
   End of merged script
   ====================================================== */
 /* ----------------------------------------------------
   MARKS PAGE SYSTEM (FINAL MERGED VERSION)
---------------------------------------------------- */

export function initMarksPage() {
  const teacher = JSON.parse(localStorage.getItem("teacherData"));
  if (!teacher) { 
    window.location.href = "login.html"; 
    return; 
  }

  const studentSelect = document.getElementById("marksStudentSelect");
  const form = document.getElementById("marksForm");

  const classId = teacher.classAssigned;
  const studentsRef = ref(db, `classes/${classId}/students`);

  // 🔥 Load students list automatically
  onValue(studentsRef, snap => {
    studentSelect.innerHTML = `<option value="">-- Select Student --</option>`;
    snap.forEach(st => {
      const data = st.val();
      studentSelect.innerHTML += `<option value="${st.key}">${data.name}</option>`;
    });
  });

  studentSelect.onchange = () => {
    const id = studentSelect.value;
    if (!id) return (form.style.display = "none");
    form.style.display = "block";
    loadStudentMarks(id);
  };

  document.getElementById("saveMarksBtn").onclick = saveMarks;
  document.getElementById("predictBtn").onclick = recomputePrediction;
  document.getElementById("clearMarksBtn").onclick = clearMarks;
  document.getElementById("studyPredictBtn").onclick = predictStudyHourMarks;
}

/* ------------ LOAD MARKS + STUDENT NAME ------------ */
function loadStudentMarks(studentId) {
  const teacher = JSON.parse(localStorage.getItem("teacherData"));
  const classId = teacher.classAssigned;

  const studentRef = ref(db, `classes/${classId}/students/${studentId}`);
  const marksRef = ref(db, `classes/${classId}/students/${studentId}/marks`);

  // Load Student Name
  onValue(studentRef, snap => {
    if (snap.exists()) {
      const stu = snap.val();
      document.getElementById("marksStudentName").innerText = stu.name;
    }
  });

  // Load Saved Marks
  onValue(marksRef, snap => {
    const d = snap.val() || {};

    ut1Score.value = d.ut1Score || "";
    ut1Max.value = d.ut1Max || "";
    hyScore.value = d.hyScore || "";
    hyMax.value = d.hyMax || "";
    ut2Score.value = d.ut2Score || "";
    ut2Max.value = d.ut2Max || "25";
    annualScore.value = d.annualScore || "";
    annualMax.value = d.annualMax || "100";

    drawPerformanceChart(d);
  });
}

/* ------------------- SAVE MARKS -------------------- */
function saveMarks() {
  const studentId = marksStudentSelect.value;
  const teacher = JSON.parse(localStorage.getItem("teacherData"));
  const classId = teacher.classAssigned;

  if (!studentId) return alert("Select a student first.");

  const data = {
    ut1Score: ut1Score.value,
    ut1Max: ut1Max.value,
    hyScore: hyScore.value,
    hyMax: hyMax.value,
    ut2Score: ut2Score.value,
    ut2Max: ut2Max.value,
    annualScore: annualScore.value,
    annualMax: annualMax.value
  };

  update(ref(db, `classes/${classId}/students/${studentId}/marks`), data)
    .then(() => alert("Marks saved successfully!"))
    .catch(err => alert(err));
}

/* ------------------ CLEAR INPUTS ------------------- */
function clearMarks() {
  ut1Score.value = "";
  ut1Max.value = "";
  hyScore.value = "";
  hyMax.value = "";
  ut2Score.value = "";
  ut2Max.value = "25";
  annualScore.value = "";
  annualMax.value = "100";
  predictionSummary.innerText = "";
}

/* ------------------ PREDICT MARKS ------------------ */
function recomputePrediction() {
  const ut1 = Number(ut1Score.value);
  const hy = Number(hyScore.value);

  if (!ut1 || !hy) {
    predictionSummary.innerText = "Enter UT-1 & Half-Yearly first.";
    return;
  }

  const predictedUT2 = Math.round(ut1 * 0.4 + hy * 0.6);
  const predictedAnnual = Math.round(hy * 0.5 + predictedUT2 * 0.5);

  ut2Score.value = predictedUT2;
  annualScore.value = predictedAnnual;

  predictionSummary.innerText =
    `Predicted UT-2: ${predictedUT2}\nPredicted Annual: ${predictedAnnual}`;
}

/* ----------- STUDY HOURS → SCORE ESTIMATE ---------- */
function predictStudyHourMarks() {
  const hours = Number(document.getElementById("studyHours").value);

  if (!hours) {
    studyHourPrediction.innerText = "Enter study hours.";
    return;
  }

  let predicted = Math.min(100, Math.round(hours * 7));
  let category = "Average";

  if (predicted > 85) category = "Topper";
  else if (predicted < 40) category = "Failer";

  studyHourPrediction.innerText =
    `Estimated Score: ${predicted}/100\nStatus: ${category}`;
}

/* ------------------- CHART SYSTEM ------------------ */
let chartInstance = null;

function drawPerformanceChart(marks) {
  const ctx = document.getElementById("performanceChart").getContext("2d");

  const scores = [
    Number(marks.ut1Score || 0),
    Number(marks.hyScore || 0),
    Number(marks.ut2Score || 0),
    Number(marks.annualScore || 0)
  ];

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["UT-1", "Half-Yearly", "UT-2", "Annual"],
      datasets: [{
        label: "Performance Trend",
        data: scores,
        borderWidth: 2,
        tension: 0.4
      }]
    }
  });
}

/* ---------------- DOM REFERENCES ------------------- */
const ut1Score = document.getElementById("ut1Score");
const ut1Max = document.getElementById("ut1Max");
const hyScore = document.getElementById("hyScore");
const hyMax = document.getElementById("hyMax");
const ut2Score = document.getElementById("ut2Score");
const ut2Max = document.getElementById("ut2Max");
const annualScore = document.getElementById("annualScore");
const annualMax = document.getElementById("annualMax");

const marksStudentSelect = document.getElementById("marksStudentSelect");
const predictionSummary = document.getElementById("predictionSummary");