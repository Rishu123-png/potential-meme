// topbunkers.js
import { db } from "./firebase.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

export async function initTopBunkersPage() {
  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const bunkers = [];
    for (const id in data) {
      const s = data[id]; if (!s) continue;
      if (!(s.teacher && s.teacher === (window?.auth?.currentUser?.uid || ''))) continue;
      const absentCount = Object.values(s.attendance || {}).filter(v => v === 'absent').length;
      if (absentCount > 0) bunkers.push({ id, ...s, totalAbsent: absentCount });
    }
    bunkers.sort((a,b)=>b.totalAbsent-a.totalAbsent);
    const table = document.getElementById('bunkersTable'); if (!table) return;
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Subject</th><th>Absences</th></tr>`;
    bunkers.forEach(s => {
      const r = table.insertRow(); r.insertCell(0).innerText = s.name; r.insertCell(1).innerText = s.class; r.insertCell(2).innerText = s.subject;
      const cell = r.insertCell(3); cell.innerText = s.totalAbsent; if (s.totalAbsent >= 3) cell.style.color = '#ffb4b4';
    });
  } catch (err) {
    console.error('initTopBunkersPage', err);
  }
}