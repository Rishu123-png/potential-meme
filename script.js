// script.js
// Works with: index.html, dashboard.html, add-students.html, mark-attendance.html, top-bunkers.html
// Uses Realtime Database (v10.12.5 CDN imports expected in firebase.js)

/* IMPORTANT:
   Keep firebase.js (v10.12.5 CDN) in project and that file must export `auth` and `db`.
   Example firebase.js already provided earlier by you.
*/

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

// Called from index.html (onclick="login()")
window.login = async function () {
  const email = (document.getElementById('email')?.value || '').trim();
  const password = document.getElementById('password')?.value || '';
  if (!email || !password) { alert('Enter email and password'); return; }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    currentTeacherUser = cred.user;
    // Redirect to dashboard after successful login
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error('Login failed', err);
    alert(err.message || 'Login failed');
  }
};

// Called from pages (onclick="logout()")
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

/*
  This function populates:
   - #teacherName
   - #teacherSubject
   - #teacherSubjectAdd
   - select#classSelect
   - select#classSelectAdd

  Call from dashboard.html onload: initDashboardPage()
  Call from add-students.html onload: initAddStudentsPage()
*/
export async function loadTeacherProfile() {
  if (!auth.currentUser) {
    // retry shortly if auth not ready yet
    setTimeout(loadTeacherProfile, 200);
    return;
  }

  const uid = auth.currentUser.uid;
  const teacherRef = ref(db, `teachers/${uid}`);

  // listen for teacher profile changes
  onValue(teacherRef, snapshot => {
    const data = snapshot.val() || {};
    teacherProfile = data;

    // set UI fields if present
    const nameEl = document.getElementById('teacherName');
    const subjectEl = document.getElementById('teacherSubject');
    const subjectAddEl = document.getElementById('teacherSubjectAdd');

    if (nameEl) nameEl.innerText = data.name || '';
    if (subjectEl) subjectEl.innerText = data.subject || '';
    if (subjectAddEl) subjectAddEl.innerText = data.subject || '';

    // populate class selects (supports object or array)
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

// Called when dashboard.html loads
window.initDashboardPage = function () {
  if (!auth.currentUser) {
    // wait for auth to initialize
    setTimeout(window.initDashboardPage, 300);
    return;
  }

  // Load teacher profile and populate classes
  loadTeacherProfile();

  // Attach onchange to class selector
  const classSel = document.getElementById('classSelect');
  if (classSel) {
    classSel.onchange = () => {
      currentClassFilter = classSel.value || '';
      loadStudents(currentClassFilter);
    };
  }

  // initial students load
  loadStudents();
};

// load all students and render (filtered by class if provided)
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

  // header
  table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Absences</th><th>Actions</th></tr>`;

  if (!allStudents) return;

  // iterate students in DB
  for (const id in allStudents) {
    const s = allStudents[id];
    if (!s) continue;

    // If class filter is set, skip other classes
    if (currentClassFilter && s.class !== currentClassFilter) continue;

    // If student has a teacher and it is not current teacher, skip
    if (s.teacher && auth.currentUser && s.teacher !== auth.currentUser.uid) continue;

    const row = table.insertRow();
    row.insertCell(0).innerText = s.name || '';
    row.insertCell(1).innerText = s.class || '';

    const absences = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    row.insertCell(2).innerText = absences;

    const actionCell = row.insertCell(3);

    // If student has no teacher, show Claim button + Add button to claim and edit
    if (!s.teacher) {
      const claimBtn = document.createElement('button');
      claimBtn.innerText = 'Claim';
      claimBtn.onclick = () => claimStudent(id);
      actionCell.appendChild(claimBtn);
    }

    // Edit button (only enabled if this teacher owns the student)
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

    // Delete button (only if teacher owns student)
    const delBtn = document.createElement('button');
    delBtn.innerText = 'Delete';
    delBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    delBtn.onclick = async () => {
      if (!confirm('Delete this student?')) return;
      try {
        await set(ref(db, `students/${id}`), null); // remove node
      } catch (err) { alert('Delete failed'); console.error(err); }
    };
    actionCell.appendChild(delBtn);

    // Mark Attendance button (only if teacher owns or student was unassigned but teacher claimed)
    const markBtn = document.createElement('button');
    markBtn.innerText = 'Mark Attendance';
    markBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    markBtn.onclick = () => {
      localStorage.setItem('selectedStudentId', id);
      // If dashboard has modal, open it; else go to mark-attendance page
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

// Called from add-students.html onload
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
      if (!s) {
        continue;
      }
      if (!s.teacher) {
        await set(ref(db, `students/${id}/teacher`), auth.currentUser.uid);
      }
    }
    alert('Done. Refreshing students list.');
    loadStudents(currentClassFilter);
  } catch (err) {
    console.error('fixTeacherIds error', err);
    alert('Failed to fix teacher ids');
  }
};

/* ======================
   Attendance modal & month view (dashboard modal version)
   ====================== */

export function openAttendanceModal(studentId) {
  selectedStudentId = studentId;
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('attendanceModal');

  // If modal elements aren't present (multi-page flow), redirect to mark-attendance page
  if (!modal || !overlay) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'mark-attendance.html';
    return;
  }

  const student = allStudents[studentId] || {};
  document.getElementById('modalStudentName').innerText = student.name || 'Student';
  overlay.style.display = 'block';
  modal.style.display = 'block';

  // default month => current month
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
  const month = mp?.value; // "YYYY-MM"
  if (!selectedStudentId) return;
  try {
    const snap = await get(ref(db, `students/${selectedStudentId}`));
    const student = snap.val() || {};
    const attendance = student.attendance || {};
    const table = document.getElementById('attendanceMonthTable');
    if (!table) return;

    table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;

    if (!month) {
      // render existing entries
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

    // build days of month
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

  // fetch student
  try {
    const snap = await get(ref(db, `students/${selectedStudentId}`));
    const student = snap.val() || {};
    document.getElementById('studentNameLabel').innerText = student.name || '';
    // set default month
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
      // show existing entries only
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
   Print monthly report (modal or mark-attendance page)
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
      // only show bunkers for students owned by this teacher
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
   Helpers
   ====================== */

// Quick helper used in dashboard to jump to mark attendance for first stud