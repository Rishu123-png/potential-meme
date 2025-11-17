// script.js
// Works with: index.html, dashboard.html, add-students.html, mark-attendance.html, top-bunkers.html
// Uses Realtime Database (v10.12.5 CDN imports expected in firebase.js)

import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref, onValue, get, set, push
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* ----------------------
   Global state
   ---------------------- */
let currentTeacherUser = null;    // firebase auth user
let teacherProfile = null;        // teacher info from RTDB
let allStudents = {};             // cached students
let selectedStudentId = null;     // selected for marking/history
let currentClassFilter = "";      // class selected in dashboard

/* ----------------------
   Keep auth state in sync
   ---------------------- */
onAuthStateChanged(auth, (user) => {
  currentTeacherUser = user;
});

/* ======================
   LOGIN / LOGOUT
   ====================== */

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

/* ======================
   Teacher profile & classes
   ====================== */

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
  });
}

/* ======================
   Dashboard: students list
   ====================== */

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

/* ======================
   Add Student page
   ====================== */

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

/* ======================
   Claim student (take ownership)
   ====================== */
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

/* ======================
   One-time fixer (optional)
   Assign all students without teacher to current teacher.
   Use from console: fixTeacherIds()
   ====================== */
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
        // IMPORTANT: your DB rules must permit teacher to write student.teacher.
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
/* ======================
   Helpers: goToMarkAttendance (for class-wide attendance)
   ====================== */
window.goToMarkAttendance = function () {
  const classSel = document.getElementById('classSelect');
  const cls = classSel ? classSel.value : currentClassFilter;
  if (!cls) return alert('Select a class first');
  localStorage.setItem('selectedClass', cls);
  localStorage.removeItem('selectedStudentId');
  window.location.href = 'mark-attendance.html';
};

/* ======================
   Attendance modal & month view (dashboard modal version)
   ====================== */

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

/* ======================
   Mark Attendance page (dual-mode)
   ====================== */

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

/* ======================
   Class Attendance UI & save
   ====================== */

async function loadClassAttendanceUI(className) {
  const container = document.querySelector('.container');
  if (!container) return alert('Mark Attendance page missing container');

  container.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <h2>Mark Attendance — Class: <span id="classTitle"></span></h2>
      <button class="small-btn" onclick="logout()">Logout</button>
    </div>
    <div style="margin-top:8px;">
      <div>Class: <strong id="classTitleText"></strong></div>
      <div style="margin-top:8px;">
        <label for="attendanceDate">Date</label>
        <input id="attendanceDate" type="date" value="${todayDateString()}">
      </div>
    </div>
    <div class="table" style="margin-top:12px;">
      <table id="classAttendanceTable">
        <tr><th>Name</th><th>Present</th><th>Absent</th></tr>
      </table>
    </div>
    <div class="row" style="margin-top:12px;">
      <button id="saveClassAttendanceBtn">Save Attendance</button>
      <button id="cancelClassAttendanceBtn">Cancel</button>
      <button id="exportClassCSVBtn">Export CSV</button>
    </div>
    <p class="footer">Developed by Rishu Jaswar</p>
  `;

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
  } catch (err) {
    console.error('loadClassAttendanceUI error', err);
  }
}

async function saveClassAttendance(rows, dateStr) {
  if (!rows || rows.length === 0) { alert('No students to save'); return; }
  try {
    // For each student pick chosen radio
    for (const st of rows) {
      const selected = document.querySelector(`input[name="att_${st.id}"]:checked`);
      const value = selected ? selected.value : 'present';
      await set(ref(db, `students/${st.id}/attendance/${dateStr}`), value);
    }
    alert('Attendance saved for ' + dateStr);
    // After save, clear and return to dashboard
    localStorage.removeItem('selectedClass');
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('saveClassAttendance error', err);
    alert('Failed to save attendance — check console for details.');
  }
}

/* ======================
   Exports & print helpers
   ====================== */

function tableToCSV(headerRow, rows) {
  // headerRow: array, rows: array of arrays
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
  // Excel-friendly CSV (rename to .xls) — simple compatibility
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

/* ======================
   Print report helper
   ====================== */
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

/* ======================
   Top bunkers page
   ====================== */
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
      if (s.totalAbsent >= 3) cell.classList.add('top-bunker');
    });
  } catch (err) {
    console.error('initTopBunkersPage error', err);
  }
};

/* ======================
   Small UX helper to export modal attendance CSV (exposed globally)
   ====================== */
window.exportAttendanceCSVModal = window.exportAttendanceCSVModal || (async () => {
  if (!selectedStudentId) return alert('No student selected');
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const rows = Object.keys(attendance).sort().map(d => [d, attendance[d]]);
  const csv = tableToCSV(['Date','Status'], rows);
  downloadFile(`${(student.name||'student')}_attendance.csv`, csv, 'text/csv');
});