// analytics.js
import { auth, db } from "./firebase.js";
import { get, ref } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { waitForAuth } from "./global.js";

window.initAnalyticsPage = function() {
  waitForAuth(() => {
    // ensure teacher profile selectors filled (dashboard.loadTeacherProfile should have run)
    const now = new Date();
    const mm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const el = document.getElementById('analyticsMonth'); if (el) el.value = mm;
    const cls = localStorage.getItem('analyticsClass');
    if (cls) { const sel = document.getElementById('analyticsClassSelect'); if (sel) sel.value = cls; localStorage.removeItem('analyticsClass'); }
  });
};

window.renderAnalytics = async function() {
  const className = document.getElementById('analyticsClassSelect')?.value;
  const month = document.getElementById('analyticsMonth')?.value;
  if (!className) return alert('Select a class');
  if (!month) return alert('Select a month');
  try {
    const snap = await get(ref(db, 'students'));
    const data = snap.val() || {};
    const students = [];
    for (const id in data) {
      const s = data[id]; if (!s) continue;
      if (s.class !== className) continue;
      if (!(s.teacher && s.teacher === auth.currentUser.uid)) continue;
      students.push({ id, name: s.name || '', attendance: s.attendance || {} });
    }
    // analyze
    const [y,m] = month.split('-').map(Number);
    const mdays = new Date(y,m,0).getDate();
    const totals = { present:0, absent:0, dayTotals: Array(mdays).fill(0) };
    const studentTotals = [];
    for (const s of students) {
      let sp=0, sa=0;
      for (let d=1; d<=mdays; d++) {
        const dd = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const st = s.attendance[dd];
        if (st === 'present') { sp++; totals.present++; totals.dayTotals[d-1]++; }
        if (st === 'absent') { sa++; totals.absent++; }
      }
      studentTotals.push({ id: s.id, name: s.name, present: sp, absent: sa, totalDays: mdays });
    }
    // render summary and charts area
    const area = document.getElementById('chartsArea');
    area.innerHTML = '';
    const summary = document.createElement('div'); summary.className='card';
    const totalStudents = students.length;
    const totalPossible = totalStudents * mdays;
    const presentPct = totalPossible ? Math.round((totals.present/totalPossible)*100) : 0;
    summary.innerHTML = `<div class="row space"><div><strong>${className} — ${month}</strong><div style="color:var(--muted)">${totalStudents} students · ${mdays} days</div></div>
                         <div style="text-align:right"><div style="font-size:22px">${presentPct}%</div><div style="color:var(--muted)">Present overall</div></div></div>`;
    area.appendChild(summary);
    // day bar
    const dayCard = document.createElement('div'); dayCard.className='card';
    dayCard.innerHTML = `<strong>Daily Present Count</strong><div id="dayBar" style="margin-top:10px; display:flex; gap:6px; align-items:end; height:140px;"></div>`;
    area.appendChild(dayCard);
    const dayBar = dayCard.querySelector('#dayBar');
    const maxDay = Math.max(...totals.dayTotals,1);
    totals.dayTotals.forEach((v,i) => {
      const col = document.createElement('div'); col.style.width='100%'; col.style.flex='1';
      const h = Math.round((v/maxDay)*100); col.style.height = `${Math.max(6,h)}%`;
      col.style.background = 'linear-gradient(180deg,#0ea5e9,#3b82f6)'; col.style.borderRadius='6px';
      col.title = `Day ${i+1}: ${v} present`; dayBar.appendChild(col);
    });
    // ranking table
    const rankCard = document.createElement('div'); rankCard.className='card';
    rankCard.innerHTML = `<strong>Student Attendance — present days</strong>`;
    const twrap = document.createElement('div'); twrap.className='table-wrap';
    const t = document.createElement('table'); t.innerHTML = `<tr><th>Name</th><th>Present</th><th>Absent</th><th>%</th></tr>`;
    studentTotals.sort((a,b)=>b.present-a.present).forEach(s => {
      const tr = t.insertRow(); tr.insertCell(0).innerText = s.name; tr.insertCell(1).innerText = s.present; tr.insertCell(2).innerText = s.absent;
      tr.insertCell(3).innerText = Math.round((s.present/s.totalDays)*100)+'%';
    });
    twrap.appendChild(t); rankCard.appendChild(twrap); area.appendChild(rankCard);
    // export & print buttons (omitted details — same helpers from main merged file)
  } catch (e) {
    console.error(e); alert('Failed to render analytics');
  }
};