// ======================= Firebase Setup =======================
import { auth, db } from "./firebase.js";
import { ref, get, set, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let currentTeacher = null;
let allStudents = {};
let selectedStudentId = null;

// ======================= Auth & Profile ======================
window.addEventListener('load', () => {
    currentTeacher = auth.currentUser;
});

// Load teacher profile, subject, classes
export function loadTeacherProfile() {
    currentTeacher = auth.currentUser;
    if (!currentTeacher) {
        alert("Please login first!");
        window.location.href = "index.html";
        return;
    }

    const teacherRef = ref(db, `teachers/${currentTeacher.uid}`);
    onValue(teacherRef, snapshot => {
        const data = snapshot.val();
        if (!data) return;

        // Dashboard
        const teacherNameElem = document.getElementById("teacherName");
        if (teacherNameElem) teacherNameElem.innerText = data.name || "Teacher";

        // Subject
        if (document.getElementById("teacherSubject"))
            document.getElementById("teacherSubject").innerText = data.subject || "Subject";
        if (document.getElementById("teacherSubjectAdd"))
            document.getElementById("teacherSubjectAdd").innerText = data.subject || "Subject";

        // Populate class dropdowns
        const classSelects = ["classSelect", "classSelectAdd"];
        classSelects.forEach(selId => {
            const selectElem = document.getElementById(selId);
            if (!selectElem || !data.classes) return;
            selectElem.innerHTML = "";
            for (let key in data.classes) {
                const opt = document.createElement("option");
                opt.value = data.classes[key];
                opt.innerText = data.classes[key];
                selectElem.appendChild(opt);
            }
        });
    });
}

// ======================= Students ===========================
export function loadStudents(selectedClass = null) {
    const studentsRef = ref(db, "students");
    onValue(studentsRef, snapshot => {
        allStudents = snapshot.val() || {};
        const table = document.getElementById("studentsTable");
        if (!table) return;

        table.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Attendance</th>
          <th>Actions</th>
        </tr>`;

        for (let id in allStudents) {
            const s = allStudents[id];
            if (s.teacher !== currentTeacher.uid) continue; // only this teacher
            if (selectedClass && s.class !== selectedClass) continue;

            const tr = table.insertRow();
            tr.insertCell(0).innerText = s.name;
            const totalAbsent = Object.values(s.attendance || {}).filter(v => v === "absent").length;
            tr.insertCell(1).innerText = totalAbsent;

            const actionCell = tr.insertCell(2);
            const markBtn = document.createElement("button");
            markBtn.innerText = "Mark Attendance";
            markBtn.onclick = () => {
                selectedStudentId = id;
                window.location.href = "mark-attendance.html";
            };
            actionCell.appendChild(markBtn);
        }
    });
}

// ======================= Add Student ========================
export function addStudent() {
    const name = document.getElementById("studentName").value.trim();
    const classSelect = document.getElementById("classSelectAdd").value;
    if (!name || !classSelect) { alert("Enter name and select class"); return; }

    const newStudentRef = push(ref(db, "students"));
    set(newStudentRef, {
        name,
        class: classSelect,
        subject: document.getElementById("teacherSubjectAdd").innerText,
        teacher: currentTeacher.uid,
        attendance: {}
    });
    document.getElementById("studentName").value = "";
    alert("Student added!");
}

// ======================= Attendance =========================
export function loadAttendance() {
    if (!selectedStudentId) return;
    const student = allStudents[selectedStudentId];
    if (!student) return;

    document.getElementById("monthPicker")?.valueAsDate || new Date();

    const table = document.getElementById("attendanceTable");
    if (!table) return;
    table.innerHTML = `<tr>
        <th>Date</th><th>Status</th><th>Present</th><th>Absent</th>
    </tr>`;

    const month = document.getElementById("monthPicker")?.value; // YYYY-MM
    for (let date in student.attendance) {
        if (month && !date.startsWith(month)) continue;
        const row = table.insertRow();
        row.insertCell(0).innerText = date;
        row.insertCell(1).innerText = student.attendance[date];

        const pBtn = row.insertCell(2).appendChild(document.createElement("button"));
        pBtn.innerText = "Present";
        pBtn.onclick = () => markAttendance(date, "present");

        const aBtn = row.insertCell(3).appendChild(document.createElement("button"));
        aBtn.innerText = "Absent";
        aBtn.onclick = () => markAttendance(date, "absent");
    }
}

export function markAttendance(date, status) {
    if (!selectedStudentId) return;
    const path = `students/${selectedStudentId}/attendance/${date}`;
    set(ref(db, path), status);
    alert(`Marked ${status} for ${date}`);
    loadAttendance();
}

// ======================= Top Bunkers ========================
export function loadTopBunkers() {
    const table = document.getElementById("bunkersTable");
    if (!table) return;
    table.innerHTML = `<tr>
        <th>Name</th><th>Class</th><th>Subject</th><th>Absences</th>
    </tr>`;

    onValue(ref(db, "students"), snapshot => {
        const data = snapshot.val() || {};
        const bunkers = [];
        for (let id in data) {
            const s = data[id];
            if (s.teacher !== currentTeacher.uid) continue;
            const totalAbsent = Object.values(s.attendance || {}).filter(v => v === "absent").length;
            if (totalAbsent > 0) bunkers.push({...s, totalAbsent});
        }
        bunkers.sort((a,b)=> b.totalAbsent - a.totalAbsent);

        bunkers.forEach(s => {
            const row = table.insertRow();
            row.insertCell(0).innerText = s.name;
            row.insertCell(1).innerText = s.class;
            row.insertCell(2).innerText = s.subject;
            const c = row.insertCell(3);
            c.innerText = s.totalAbsent;
            if (s.totalAbsent >= 3) c.style.color = "red";
        });
    });
}

// ======================= Print Monthly Report ==================
export function printReport() {
    const table = document.getElementById("attendanceTable");
    if (!table) return;
    const w = window.open("", "", "width=800,height=600");
    w.document.write("<h3>Monthly Attendance Report</h3>");
    w.document.write(table.outerHTML);
    w.document.close();
    w.print();
}

// ======================= Logout =============================
export function logout() {
    signOut(auth).then(() => {
        window.location.href = "index.html";
    });
}