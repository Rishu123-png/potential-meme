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
let currentTeacherUser = null;
let teacherProfile = null;
let allStudents = {};
let selectedStudentId = null;
let currentClassFilter = "";

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
    const ids = Array.isArray(classes) ? classes : Object.keys(classes).length ? Object.values(classes) : [];

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

// ---- MERGED: FILTER BY SUBJECT ----
function renderStudentsTable() {
  const table = document.getElementById('studentsTable');
  if (!table) return;

  table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Absences</th><th>Actions</th></tr>`;

  if (!allStudents || !auth.currentUser) return;

  for (const id in allStudents) {
    const s = allStudents[id];
    if (!s) continue;

    // teacher restriction — teacher sees only their students
    if (s.teacher !== auth.currentUser.uid) continue;

    // class filter
    if (currentClassFilter && s.class !== currentClassFilter) continue;

    // SUBJECT FILTER: this is the required fix
    if (teacherProfile?.subject && s.subject !== teacherProfile.subject) continue;

    const row = table.insertRow();
    row.insertCell(0).innerText = s.name || '';
    row.insertCell(1).innerText = s.class || '';

    const absences = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    row.insertCell(2).innerText = absences;

    const actionCell = row.insertCell(3);

    const editBtn = document.createElement('button');
    editBtn.innerText = 'Edit';
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
    delBtn.onclick = async () => {
      if (!confirm('Delete this student?')) return;
      try {
        await set(ref(db, `students/${id}`), null);
      } catch (err) { alert('Delete failed'); console.error(err); }
    };
    actionCell.appendChild(delBtn);

    const markBtn = document.createElement('button');
    markBtn.innerText = 'Mark Attendance';
    markBtn.onclick = () => {
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
   Attendance modal & month view (dashboard modal version)
   ====================== */

export function openAttendanceModal(studentId) {
  selectedStudentId = studentId;
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('attendanceModal');

  if (!modal || !overlay) {
    localStorage.setItem('selectedStudentId', studentId);
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
   Mark Attendance page (separate page flow)
   ====================== */

window.initMarkAttendancePage = async function () {
  if (!auth.currentUser) { setTimeout(window.initMarkAttendancePage, 300); return; }

  selectedStudentId = localStorage.getItem('selectedStudentId') || null;
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
   Print monthly report
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
      if (s.teacher !== auth.currentUser.uid) continue;
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
   Helpers
   ====================== */

window.goToMarkAttendance = function () {
  if (!currentClassFilter) return alert('Select a class first');
  for (const id in allStudents) {
    const s = allStudents[id];
    if (s && s.class === currentClassFilter && s.teacher === auth.currentUser.uid) {
      localStorage.setItem('selectedStudentId', id);
      window.location.href = 'mark-attendance.html';
      return;
    }
  }
  alert('No students in this class. Add students first.');
};