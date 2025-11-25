// script.js
// Works with: index.html, dashboard.html, add-students.html, mark-attendance.html, top-bunkers.html
// Uses Realtime Database (v10.12.5 CDN imports expected in firebase.js)
console.log("SCRIPT JS LOADED");
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
      <button class="btn-cta" onclick="logout()">Logout</button>
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
/* ======================
   Marks page + Prediction
   ====================== */

// Call on marks.html load
window.initMarksPage = async function () {
  if (!auth.currentUser) { setTimeout(window.initMarksPage, 300); return; }

  // populate student dropdown (only teacher's own students)
  await loadStudentsForMarks();

  const sel = document.getElementById('marksStudentSelect');
  sel.onchange = async () => {
    const id = sel.value;
    if (!id) {
      document.getElementById('marksForm').style.display = 'none';
      return;
    }
    document.getElementById('marksForm').style.display = 'block';
    const student = allStudents[id] || {};
    document.getElementById('marksStudentName').innerText = (student.name || 'Student') + ' — ' + (student.class || '');
    await loadMarksForStudent(id);
  };

  document.getElementById('predictBtn').onclick = () => {
    const id = document.getElementById('marksStudentSelect').value;
    if (!id) return alert('Select a student first');
    computeAndShowPrediction(); // uses current input values
  };

  document.getElementById('saveMarksBtn').onclick = async () => {
    const id = document.getElementById('marksStudentSelect').value;
    if (!id) return alert('Select a student first');
    await saveMarksForStudent(id);
  };

  document.getElementById('clearMarksBtn').onclick = () => {
    ['ut1Score','ut1Max','hyScore','hyMax','ut2Score','ut2Max','annualScore','annualMax'].forEach(k => {
      const el = document.getElementById(k);
      if (el) el.value = '';
    });
    document.getElementById('predictionSummary').innerText = 'Cleared inputs.';
  };
};

// populate dropdown using cached allStudents; also refresh cache from DB
async function loadStudentsForMarks() {
  // ensure allStudents is up to date
  try {
    const snap = await get(ref(db, 'students'));
    allStudents = snap.val() || {};
  } catch (err) {
    console.error('loadStudentsForMarks error', err);
    alert('Failed to load students');
    return;
  }

  const sel = document.getElementById('marksStudentSelect');
  sel.innerHTML = '<option value="">-- Select student --</option>';
  for (const id in allStudents) {
    const s = allStudents[id];
    if (!s) continue;
    // show only students of this teacher
    if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
    const opt = document.createElement('option');
    opt.value = id;
    opt.innerText = `${s.name} — ${s.class || ''}`;
    sel.appendChild(opt);
  }
}

// Load existing marks from RTDB for a student and fill inputs
async function loadMarksForStudent(studentId) {
  try {
    const snap = await get(ref(db, `marks/${auth.currentUser.uid}/${studentId}`));
    const data = snap.val() || {};

    // set inputs if values exist
    if (data['UT-1']) {
      document.getElementById('ut1Score').value = data['UT-1'].score ?? '';
      document.getElementById('ut1Max').value = data['UT-1'].max ?? '';
    } else {
      document.getElementById('ut1Score').value = '';
      document.getElementById('ut1Max').value = '';
    }
    if (data['Half-Yearly']) {
      document.getElementById('hyScore').value = data['Half-Yearly'].score ?? '';
      document.getElementById('hyMax').value = data['Half-Yearly'].max ?? '';
    } else {
      document.getElementById('hyScore').value = '';
      document.getElementById('hyMax').value = '';
    }
    if (data['UT-2']) {
      document.getElementById('ut2Score').value = data['UT-2'].score ?? '';
      document.getElementById('ut2Max').value = data['UT-2'].max ?? (document.getElementById('ut2Max').value || '');
    } else {
      document.getElementById('ut2Score').value = '';
    }
    if (data['Annual']) {
      document.getElementById('annualScore').value = data['Annual'].score ?? '';
      document.getElementById('annualMax').value = data['Annual'].max ?? (document.getElementById('annualMax').value || '');
    } else {
      document.getElementById('annualScore').value = '';
    }

    // compute prediction automatically
    computeAndShowPrediction();
  } catch (err) {
    console.error('loadMarksForStudent error', err);
    alert('Failed to load marks');
  }
}

// Save marks inputs to RTDB under marks/{teacherId}/{studentId}/{exam}
async function saveMarksForStudent(studentId) {
  const ut1Score = Number(document.getElementById('ut1Score').value || '');
  const ut1Max = Number(document.getElementById('ut1Max').value || '');
  const hyScore = Number(document.getElementById('hyScore').value || '');
  const hyMax = Number(document.getElementById('hyMax').value || '');
  const ut2Score = document.getElementById('ut2Score').value;
  const ut2Max = Number(document.getElementById('ut2Max').value || '');
  const annualScore = document.getElementById('annualScore').value;
  const annualMax = Number(document.getElementById('annualMax').value || '');

  // write each exam if numbers provided or if user left it blank but predicted values exist, don't auto-save predicted values unless user accepts
  try {
    const basePath = `marks/${auth.currentUser.uid}/${studentId}`;

    // UT-1
    if (!isNaN(ut1Score) && ut1Score !== '') {
      await set(ref(db, `${basePath}/UT-1`), { score: ut1Score, max: ut1Max || null, timestamp: Date.now() });
    }

    // Half-Yearly
    if (!isNaN(hyScore) && hyScore !== '') {
      await set(ref(db, `${basePath}/Half-Yearly`), { score: hyScore, max: hyMax || null, timestamp: Date.now() });
    }

    // UT-2 (if teacher entered a value; if empty we do NOT overwrite with prediction)
    if (ut2Score !== '') {
      await set(ref(db, `${basePath}/UT-2`), { score: Number(ut2Score), max: ut2Max || null, timestamp: Date.now() });
    }

    // Annual
    if (annualScore !== '') {
      await set(ref(db, `${basePath}/Annual`), { score: Number(annualScore), max: annualMax || null, timestamp: Date.now() });
    }

    alert('Marks saved successfully');
  } catch (err) {
    console.error('saveMarksForStudent error', err);
    alert('Failed to save marks (check permissions)');
  }
}

/* ===========================
   Prediction algorithm
   - Simple, explainable linear extrapolation + weighted annual estimate
   - Explanation shown to teacher
   =========================== */
function computeAndShowPrediction() {
  // read inputs
  const ut1ScoreRaw = document.getElementById('ut1Score').value;
  const ut1MaxRaw = document.getElementById('ut1Max').value;
  const hyScoreRaw = document.getElementById('hyScore').value;
  const hyMaxRaw = document.getElementById('hyMax').value;
  const ut2MaxRaw = document.getElementById('ut2Max').value || '25';
  const annualMaxRaw = document.getElementById('annualMax').value || '100';

  const ut1Score = ut1ScoreRaw === '' ? null : Number(ut1ScoreRaw);
  const ut1Max = ut1MaxRaw === '' ? null : Number(ut1MaxRaw);
  const hyScore = hyScoreRaw === '' ? null : Number(hyScoreRaw);
  const hyMax = hyMaxRaw === '' ? null : Number(hyMaxRaw);
  const ut2Max = Number(ut2MaxRaw);
  const annualMax = Number(annualMaxRaw);

  if (ut1Score == null && hyScore == null) {
    document.getElementById('predictionSummary').innerText = 'Enter UT-1 and/or Half-Yearly marks to compute predictions.';
    return;
  }

  // compute percentages (0..1)
  const ut1Pct = (ut1Score != null && ut1Max > 0) ? (ut1Score / ut1Max) : null;
  const hyPct = (hyScore != null && hyMax > 0) ? (hyScore / hyMax) : null;

  // Predicted UT-2 percent
  let predUT2Pct = null;
  let explanation = '';

  if (ut1Pct != null && hyPct != null) {
    // linear trend extrapolation: slope = hy - ut1, predict ut2 = hy + slope
    const slope = hyPct - ut1Pct;
    predUT2Pct = hyPct + slope;
    explanation += `Trend: UT-1 ${toPct(ut1Pct)} → Half-Year ${toPct(hyPct)} (slope ${toPct(slope)}). `;
    explanation += `Extrapolated UT-2 = Half-Year + slope = ${toPct(predUT2Pct)}. `;
  } else if (hyPct != null) {
    // only half-year available: assume stable
    predUT2Pct = hyPct;
    explanation += `Only Half-Yearly available. Predict UT-2 = Half-Year (${toPct(hyPct)}). `;
  } else if (ut1Pct != null) {
    // only ut1 available: assume same level
    predUT2Pct = ut1Pct;
    explanation += `Only UT-1 available. Predict UT-2 = UT-1 (${toPct(ut1Pct)}). `;
  }

  // clamp prediction 0..1
  predUT2Pct = clamp(predUT2Pct, 0, 1);

  // Annual prediction: weighted combination
  // weights: UT-1 20%, Half-Year 50%, UT-2 predicted 30% (these are example weights — you can adjust)
  const w_ut1 = 0.20, w_hy = 0.50, w_ut2 = 0.30;
  const a_ut1 = ut1Pct != null ? ut1Pct : predUT2Pct; // fallback
  const a_hy = hyPct != null ? hyPct : predUT2Pct;
  const annualPct = clamp((w_ut1 * a_ut1) + (w_hy * a_hy) + (w_ut2 * predUT2Pct), 0, 1);

  // convert to scores for displayed maxima
  const predUT2Score = Math.round(predUT2Pct * ut2Max);
  const predAnnualScore = Math.round(annualPct * annualMax);

  // confidence heuristics: if slope small -> higher confidence
  let conf = 0.5;
  if (ut1Pct != null && hyPct != null) {
    const slopeAbs = Math.abs(hyPct - ut1Pct);
    conf = Math.max(0.25, 1 - slopeAbs); // if big slope -> lower confidence
  } else {
    conf = 0.6;
  }

  // show results
  const summary = [];
  summary.push(`Predicted UT-2: ${predUT2Score}/${ut2Max} (${toPct(predUT2Pct)})`);
  summary.push(`Predicted Annual: ${predAnnualScore}/${annualMax} (${toPct(annualPct)})`);
  summary.push(`Confidence: ${(conf*100).toFixed(0)}%`);
  summary.push('');
  summary.push('Explanation: ' + explanation);

  document.getElementById('predictionSummary').innerText = summary.join('\n');

  // prefill UT-2 and Annual inputs with predicted values **but do not save them automatically**
  const ut2Input = document.getElementById('ut2Score');
  const annualInput = document.getElementById('annualScore');

  // Only prefill if fields are empty (so teacher can keep their overrides)
  if (!ut2Input.value) ut2Input.value = predUT2Score;
  if (!annualInput.value) annualInput.value = predAnnualScore;
}

// small helpers
function toPct(x) {
  if (x == null) return '-';
  return (x*100).toFixed(1) + '%';
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }