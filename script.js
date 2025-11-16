// script.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref, onValue, get, set, push
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* Global state */
let currentTeacher = null;
let teacherProfile = null;
let allStudents = {};
let selectedStudentId = null;
let currentClassFilter = "";

/* Auth change - keep user state and redirect if needed */
onAuthStateChanged(auth, user => {
  currentTeacher = user;
});

/* ----------------- LOGIN ----------------- */
window.login = async function () {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  if (!email || !password) return alert('Enter email and password');

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    currentTeacher = cred.user;
    // go to dashboard
    window.location.href = 'dashboard.html';
  } catch (e) {
    alert(e.message || 'Login failed');
  }
};

/* ----------------- LOGOUT ----------------- */
window.logout = async function () {
  try {
    await signOut(auth);
  } catch (e) { /* ignore */ }
  window.location.href = 'index.html';
};

/* ----------------- Load teacher profile & classes ----------------- */
export async function loadTeacherProfile() {
  if (!auth.currentUser) {
    // wait and retry shortly
    setTimeout(loadTeacherProfile, 300);
    return;
  }
  const uid = auth.currentUser.uid;
  const teacherRef = ref(db, `teachers/${uid}`);
  onValue(teacherRef, snap => {
    const data = snap.val() || {};
    teacherProfile = data;
    const nameEl = document.getElementById('teacherName');
    const subjectEl = document.getElementById('teacherSubject');
    const subjectAddEl = document.getElementById('teacherSubjectAdd');
    if (nameEl) nameEl.innerText = data.name || '';
    if (subjectEl) subjectEl.innerText = data.subject || '';
    if (subjectAddEl) subjectAddEl.innerText = data.subject || '';

    // populate classes into selects
    const classes = data.classes || {};
    function fillSelect(id) {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select class --</option>';
      if (Array.isArray(classes)) {
        classes.forEach(c => {
          const o = document.createElement('option'); o.value = c; o.innerText = c; sel.appendChild(o);
        });
      } else {
        for (const k in classes) {
          const v = classes[k];
          const o = document.createElement('option'); o.value = v; o.innerText = v; sel.appendChild(o);
        }
      }
    }
    fillSelect('classSelect');
    fillSelect('classSelectAdd');
  });
}

/* ----------------- Dashboard: students list ----------------- */
window.initDashboardPage = function () {
  if (!auth.currentUser) {
    setTimeout(window.initDashboardPage, 300);
    return;
  }
  loadTeacherProfile();
  const classSel = document.getElementById('classSelect');
  if (classSel) {
    classSel.onchange = () => {
      currentClassFilter = classSel.value;
      loadStudents(currentClassFilter);
    };
  }
};

export function loadStudents(selectedClass = '') {
  currentClassFilter = selectedClass;
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
  for (const id in allStudents) {
    const s = allStudents[id];
    if (!s) continue;
    if (s.teacher !== auth.currentUser.uid) continue; // only this teacher's students
    if (currentClassFilter && s.class !== currentClassFilter) continue;
    const row = table.insertRow();
    row.insertCell(0).innerText = s.name || '';
    row.insertCell(1).innerText = s.class || '';
    const absentCount = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    row.insertCell(2).innerText = absentCount;
    const actions = row.insertCell(3);
    // Edit
    const editBtn = document.createElement('button'); editBtn.innerText = 'Edit';
    editBtn.onclick = () => {
      const newName = prompt('Edit name', s.name || '');
      if (newName) set(ref(db, `students/${id}/name`), newName);
    };
    actions.appendChild(editBtn);
    // Delete
    const delBtn = document.createElement('button'); delBtn.innerText = 'Delete';
    delBtn.onclick = () => {
      if (!confirm('Delete student?')) return;
      set(ref(db, `students/${id}`), null);
    };
    actions.appendChild(delBtn);
    // Mark Attendance
    const markBtn = document.createElement('button'); markBtn.innerText = 'Mark Attendance';
    markBtn.onclick = () => {
      // store selected id and open modal (or go to mark page)
      localStorage.setItem('selectedStudentId', id);
      // If dashboard has modal elements, open modal; fallback to mark-attendance.html
      if (document.getElementById('attendanceModal')) {
        openAttendanceModal(id);
      } else {
        window.location.href = 'mark-attendance.html';
      }
    };
    actions.appendChild(markBtn);
  }
}

/* ----------------- Add Student Page ----------------- */
window.initAddStudentsPage = function () {
  if (!auth.currentUser) {
    setTimeout(window.initAddStudentsPage, 300);
    return;
  }
  loadTeacherProfile();
};

window.addStudent = async function () {
  const name = document.getElementById('studentName')?.value?.trim();
  const cls = document.getElementById('classSelectAdd')?.value;
  if (!name || !cls) return alert('Enter name and select class');
  const subj = teacherProfile?.subject || '';
  try {
    const newRef = push(ref(db, 'students'));
    await set(newRef, { name, class: cls, subject: subj, teacher: auth.currentUser.uid, attendance: {} });
    alert('Student added');
    window.location.href = 'dashboard.html';
  } catch (e) {
    alert('Failed: ' + (e.message || e));
  }
};

/* ----------------- Attendance modal & month view ----------------- */
export function openAttendanceModal(studentId) {
  selectedStudentId = studentId;
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('attendanceModal');
  if (!modal || !overlay) {
    localStorage.setItem('selectedStudentId', studentId);
    window.location.href = 'mark-attendance.html';
    return;
  }
  const student = allStudents[studentId];
  document.getElementById('modalStudentName').innerText = student?.name || 'Student';
  overlay.style.display = 'block'; modal.style.display = 'block';
  const today = new Date(); const defMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const mp = document.getElementById('monthPicker'); if (mp) mp.value = defMonth;
  loadAttendanceMonth();
}

window.closeModal = function () {
  const overlay = document.getElementById('modalOverlay'); const modal = document.getElementById('attendanceModal');
  if (overlay) overlay.style.display = 'none'; if (modal) modal.style.display = 'none';
  selectedStudentId = null;
};

window.loadAttendanceMonth = async function () {
  const mp = document.getElementById('monthPicker'); const month = mp?.value;
  if (!selectedStudentId) return;
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const table = document.getElementById('attendanceMonthTable'); if (!table) return;
  table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;
  if (!month) {
    for (const d in attendance) {
      const r = table.insertRow(); r.insertCell(0).innerText = d; r.insertCell(1).innerText = attendance[d];
      const p = r.insertCell(2).appendChild(document.createElement('button')); p.innerText='Present'; p.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${d}`),'present');
      const a = r.insertCell(3).appendChild(document.createElement('button')); a.innerText='Absent'; a.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${d}`),'absent');
    }
    return;
  }
  const [y, m] = month.split('-').map(Number); const days = new Date(y, m, 0).getDate();
  for (let d=1; d<=days; d++) {
    const dd = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const st = attendance[dd] || '';
    const r = table.insertRow(); r.insertCell(0).innerText = dd; r.insertCell(1).innerText = st || '-';
    const pcell = r.insertCell(2); const pbtn = document.createElement('button'); pbtn.innerText='Present'; pbtn.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${dd}`),'present'); pcell.appendChild(pbtn);
    const acell = r.insertCell(3); const abtn = document.createElement('button'); abtn.innerText='Absent'; abtn.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${dd}`),'absent'); acell.appendChild(abtn);
  }
};

/* ----------------- Mark Attendance page ----------------- */
window.initMarkAttendancePage = async function () {
  if (!auth.currentUser) { setTimeout(window.initMarkAttendancePage, 300); return; }
  selectedStudentId = localStorage.getItem('selectedStudentId') || null;
  if (!selectedStudentId) { alert('No student selected.'); window.location.href='dashboard.html'; return; }
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {};
  document.getElementById('studentNameLabel').innerText = student.name || '';
  const today = new Date(); const defMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const mp = document.getElementById('monthPickerMark'); if (mp) mp.value = defMonth;
  await loadMarkAttendanceMonth();
};

window.loadMarkAttendanceMonth = async function () {
  const mp = document.getElementById('monthPickerMark'); const month = mp?.value;
  if (!selectedStudentId) return;
  const snap = await get(ref(db, `students/${selectedStudentId}`));
  const student = snap.val() || {}; const attendance = student.attendance || {};
  const table = document.getElementById('markAttendanceTable'); if (!table) return;
  table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;
  const [y,m] = (month||'').split('-').map(Number);
  if (!y||!m) {
    for (const d in attendance) {
      const r=table.insertRow(); r.insertCell(0).innerText=d; r.insertCell(1).innerText=attendance[d];
      const p=r.insertCell(2).appendChild(document.createElement('button')); p.innerText='Present'; p.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${d}`),'present');
      const a=r.insertCell(3).appendChild(document.createElement('button')); a.innerText='Absent'; a.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${d}`),'absent');
    }
    return;
  }
  const days = new Date(y,m,0).getDate();
  for (let d=1; d<=days; d++) {
    const dd=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const st=attendance[dd]||'';
    const r=table.insertRow(); r.insertCell(0).innerText=dd; r.insertCell(1).innerText=st||'-';
    const p=r.insertCell(2).appendChild(document.createElement('button')); p.innerText='Present'; p.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${dd}`),'present');
    const a=r.insertCell(3).appendChild(document.createElement('button')); a.innerText='Absent'; a.onclick=()=>set(ref(db,`students/${selectedStudentId}/attendance/${dd}`),'absent');
  }
};

/* ----------------- Print report ----------------- */
window.printReport = function () {
  const table = document.getElementById('markAttendanceTable') || document.getElementById('attendanceMonthTable');
  if (!table) return alert('Nothing to print');
  const w = window.open('','print','width=900,height=700');
  const title = document.getElementById('studentNameLabel')?.innerText || document.getElementById('modalStudentName')?.innerText || 'Report';
  w.document.write(`<h3>Monthly Attendance Report — ${title}</h3>`);
  w.document.write(table.outerHTML);
  w.document.close(); w.print();
};

/* ----------------- Top bunkers ----------------- */
window.initTopBunkersPage = async function () {
  if (!auth.currentUser) { setTimeout(window.initTopBunkersPage,300); return; }
  const snap = await get(ref(db, 'students'));
  const data = snap.val() || {};
  const list = [];
  for (const id in data) {
    const s = data[id];
    if (s.teacher !== auth.currentUser.uid) continue;
    const absentCount = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    if (absentCount > 0) list.push({...s, id, totalAbsent: absentCount});
  }
  list.sort((a,b)=>b.totalAbsent - a.totalAbsent);
  const table = document.getElementById('bunkersTable'); if (!table) return;
  table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Subject</th><th>Absences</th></tr>`;
  list.forEach(s => {
    const r = table.insertRow(); r.insertCell(0).innerText=s.name; r.insertCell(1).innerText=s.class; r.insertCell(2).innerText=s.subject;
    const cell = r.insertCell(3); cell.innerText = s.totalAbsent; if (s.totalAbsent>=3) cell.classList.add('top-bunker');
  });
};

/* ----------------- Helpers ----------------- */
window.goToMarkAttendance = function () {
  // If a class selected, go to first student mark flow or dashboard modal
  if (!currentClassFilter) return alert('Select class first');
  // choose first student in that class as quick flow: store id and go
  for (const id in allStudents) {
    const s = allStudents[id];
    if (s.class === currentClassFilter && s.teacher === auth.currentUser.uid) {
      localStorage.setItem('selectedStudentId', id);
      window.location.href = 'mark-attendance.html';
      return;
    }
  }
  alert('No students in this class. Add students first.');
};