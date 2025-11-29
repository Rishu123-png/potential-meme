// dashboard.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { waitForAuth } from "./global.js";

let teacherProfile = null;
export let allStudents = {}; // exported so other modules may read cache

export function initDashboardPage() {
  waitForAuth(async () => {
    loadTeacherProfile();
    const classSel = document.getElementById('classSelect');
    if (classSel) {
      classSel.onchange = () => {
        loadStudents(classSel.value || '');
      };
    }
    loadStudents();
  });
}

export function loadTeacherProfile() {
  const user = auth.currentUser;
  if (!user) return setTimeout(loadTeacherProfile, 200);
  const uid = user.uid;
  const teacherRef = ref(db, `teachers/${uid}`);
  onValue(teacherRef, snap => {
    const data = snap.val() || {};
    teacherProfile = data;
    const nameEl = document.getElementById('teacherName');
    if (nameEl) nameEl.innerText = data.name || '';
    const subjectEl = document.getElementById('teacherSubject');
    if (subjectEl) subjectEl.innerText = data.subject || '';
    const classes = data.classes || {};
    // fill selects
    const ids = Array.isArray(classes) ? classes : (Object.keys(classes).length ? Object.values(classes) : []);
    ['classSelect','classSelectAdd','analyticsClassSelect'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select class --</option>';
      ids.forEach(c => {
        const opt = document.createElement('option'); opt.value = c; opt.innerText = c; sel.appendChild(opt);
      });
    });
  });
}

export function loadStudents(filterClass = '') {
  const studentsRef = ref(db, 'students');
  onValue(studentsRef, snap => {
    allStudents = snap.val() || {};
    renderStudentsTable(filterClass);
  });
}

function renderStudentsTable(filterClass = '') {
  const table = document.getElementById('studentsTable');
  if (!table) return;
  table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Absences</th><th>Actions</th></tr>`;
  if (!allStudents) return;
  for (const id in allStudents) {
    const s = allStudents[id]; if (!s) continue;
    if (filterClass && s.class !== filterClass) continue;
    if (s.teacher && auth.currentUser && s.teacher !== auth.currentUser.uid) continue;
    const row = table.insertRow();
    row.insertCell(0).innerText = s.name || '';
    row.insertCell(1).innerText = s.class || '';
    const absences = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
    row.insertCell(2).innerText = absences;
    const actionCell = row.insertCell(3);
    // Claim button
    if (!s.teacher) {
      const claimBtn = document.createElement('button');
      claimBtn.innerText = 'Claim';
      claimBtn.onclick = () => claimStudent(id);
      actionCell.appendChild(claimBtn);
    }
    // Edit
    const editBtn = document.createElement('button');
    editBtn.innerText = 'Edit';
    editBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    editBtn.onclick = async () => {
      const newName = prompt('Edit student name', s.name||'');
      if (!newName) return;
      try { await set(ref(db, `students/${id}/name`), newName); } catch (e) { alert('Failed to edit'); }
    };
    actionCell.appendChild(editBtn);
    // Delete
    const delBtn = document.createElement('button');
    delBtn.innerText = 'Delete';
    delBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    delBtn.onclick = async () => {
      if (!confirm('Delete this student?')) return;
      try { await set(ref(db, `students/${id}`), null); } catch (e) { alert('Delete failed'); }
    };
    actionCell.appendChild(delBtn);
    // Mark attendance
    const markBtn = document.createElement('button');
    markBtn.innerText = 'Mark Attendance';
    markBtn.disabled = !(s.teacher && auth.currentUser && s.teacher === auth.currentUser.uid);
    markBtn.onclick = () => {
      localStorage.removeItem('selectedClass');
      localStorage.setItem('selectedStudentId', id);
      window.location.href = 'mark-attendance.html';
    };
    actionCell.appendChild(markBtn);
  }
}

export async function claimStudent(studentId) {
  if (!auth.currentUser) { alert('Please login'); return; }
  if (!confirm('Claim this student?')) return;
  try {
    await set(ref(db, `students/${studentId}/teacher`), auth.currentUser.uid);
    alert('Student claimed');
    loadStudents();
  } catch (e) {
    console.error(e); alert('Failed to claim');
  }
}