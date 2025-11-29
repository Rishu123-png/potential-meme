// students.js
import { auth, db } from "./firebase.js";
import { push, set, ref, get } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { waitForAuth } from "./global.js";

export function initAddStudentsPage() {
  waitForAuth(() => {
    // teacher profile fill is done in dashboard.loadTeacherProfile which you should call from dashboard
  });
}

export async function addStudent() {
  if (!auth.currentUser) { alert('Please login'); window.location.href = 'index.html'; return; }
  const name = (document.getElementById('studentName')?.value || '').trim();
  const cls = (document.getElementById('classSelectAdd')?.value || '').trim();
  if (!name || !cls) { alert('Enter student name and class'); return; }
  // Try to read teacher profile subject if exists under /teachers
  const teacherSnap = await get(ref(db, `teachers/${auth.currentUser.uid}`));
  const subj = teacherSnap.exists() ? (teacherSnap.val().subject || '') : '';
  try {
    const newRef = push(ref(db, 'students'));
    await set(newRef, { name, class: cls, subject: subj, teacher: auth.currentUser.uid, attendance: {} });
    alert('Student added');
    window.location.href = 'dashboard.html';
  } catch (e) {
    console.error(e); alert('Failed to add student');
  }
}

// helper to read single student (used by marks / attendance)
export async function getStudent(studentId) {
  if (!studentId) return null;
  const snap = await get(ref(db, `students/${studentId}`));
  return snap.exists() ? snap.val() : null;
}
