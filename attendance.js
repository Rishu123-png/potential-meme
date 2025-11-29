// attendance.js
import { auth, db } from "./firebase.js";
import { ref, get, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { getStudent } from "./students.js";

export function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

// For modal / dashboard: loads a student's attendance table for a month
export async function loadAttendanceMonthToTable(studentId, month, tableId) {
  if (!studentId) return;
  const snap = await get(ref(db, `students/${studentId}`));
  const student = snap.val() || {};
  const attendance = student.attendance || {};
  const table = document.getElementById(tableId);
  if (!table) return;
  table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Present</th><th>Absent</th></tr>`;
  if (!month) {
    Object.keys(attendance).sort().forEach(date => {
      const status = attendance[date];
      const r = table.insertRow();
      r.insertCell(0).innerText = date;
      r.insertCell(1).innerText = status || '-';
      const p = r.insertCell(2).appendChild(document.createElement('button'));
      p.innerText = 'Present'; p.onclick = async () => { await set(ref(db, `students/${studentId}/attendance/${date}`), 'present'); loadAttendanceMonthToTable(studentId, month, tableId); };
      const a = r.insertCell(3).appendChild(document.createElement('button'));
      a.innerText = 'Absent'; a.onclick = async () => { await set(ref(db, `students/${studentId}/attendance/${date}`), 'absent'); loadAttendanceMonthToTable(studentId, month, tableId); };
    });
    return;
  }
  // month provided as 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return;
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const status = attendance[dd] || '';
    const r = table.insertRow();
    r.insertCell(0).innerText = dd;
    const statusCell = r.insertCell(1); statusCell.innerText = status || '-';
    const pcell = r.insertCell(2);
    const pbtn = document.createElement('button'); pbtn.innerText = 'Present';
    pbtn.onclick = async () => { await set(ref(db, `students/${studentId}/attendance/${dd}`), 'present'); loadAttendanceMonthToTable(studentId, month, tableId); };
    pcell.appendChild(pbtn);
    const acell = r.insertCell(3);
    const abtn = document.createElement('button'); abtn.innerText = 'Absent';
    abtn.onclick = async () => { await set(ref(db, `students/${studentId}/attendance/${dd}`), 'absent'); loadAttendanceMonthToTable(studentId, month, tableId); };
    acell.appendChild(abtn);
    if (status === 'present') statusCell.style.color = 'lightgreen';
    if (status === 'absent') statusCell.style.color = '#ff7b7b';
  }
}

// class UI builder for mark-attendance page
export async function buildClassAttendanceUI(className) {
  const classAttendanceUI = document.getElementById('classAttendanceUI');
  if (!classAttendanceUI) return alert('Missing classAttendanceUI container');
  // build inner html (simple)
  classAttendanceUI.innerHTML = ''; // will be filled by MarkAttendance page before calling this
  // fetch all students
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
  return rows; // caller will render rows into UI (this keeps function lean)
}

// save class attendance: rows is [{id,name}] and dateStr 'YYYY-MM-DD'
export async function saveClassAttendance(rows, dateStr) {
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
    console.error(err);
    alert('Failed to save attendance');
  }
}
