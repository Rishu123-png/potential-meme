import { auth, db } from './firebase.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { 
  ref, push, set, onValue, update, remove 
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

let currentTeacher = null;
let allStudents = {};
let selectedStudentId = null;

// ======================= Section Control ======================
function showDashboard() {
    document.getElementById("dashboard").classList.remove("hidden");
    document.getElementById("loginDiv").classList.add("hidden");
    document.getElementById("bunkersSection").classList.add("hidden");
}

function showBunkers() {
    document.getElementById("bunkersSection").classList.remove("hidden");
    document.getElementById("dashboard").classList.add("hidden");
}

// ======================= Login/Signup ======================
window.signup = function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const uid = userCredential.user.uid;
            set(ref(db, 'teachers/' + uid), { email, name: "", subjects: [] });
            alert("Signup successful! Please enter your name & subject in dashboard.");
        })
        .catch(e => alert(e.message));
}

window.login = function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            currentTeacher = userCredential.user;
            showDashboard();
            loadTeacherData();
        })
        .catch(e => alert("Login failed: " + e.message));
}

window.logout = function() {
    signOut(auth).then(() => {
        currentTeacher = null;
        document.getElementById("loginDiv").classList.remove("hidden");
        document.getElementById("dashboard").classList.add("hidden");
        document.getElementById("bunkersSection").classList.add("hidden");
        closeModal();
    });
}

// ======================= Load Teacher Data & Students ======================
function loadTeacherData() {
    const teacherRef = ref(db, 'teachers/' + currentTeacher.uid);
    onValue(teacherRef, snapshot => {
        const data = snapshot.val();
        document.getElementById("teacherName").innerText = data?.name || "Teacher";
        loadStudents();
    });
}

function loadStudents() {
    const studentsRef = ref(db, 'students');
    onValue(studentsRef, snapshot => {
        allStudents = snapshot.val() || {};
        displayStudents();
        displayBunkingReport();
    });
}

// ======================= Display Students ======================
function displayStudents() {
    const table = document.getElementById("studentsTable");
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Subject</th><th>Edit</th><th>Delete</th><th>Attendance</th></tr>`;
    for (let id in allStudents) {
        const student = allStudents[id];
        const row = table.insertRow();
        row.insertCell(0).innerText = student.name;
        row.insertCell(1).innerText = student.class;
        row.insertCell(2).innerText = student.subject;

        const editCell = row.insertCell(3);
        const editBtn = document.createElement("button");
        editBtn.innerText = "Edit";
        editBtn.disabled = student.teacher !== currentTeacher.uid;
        editBtn.onclick = () => editStudentPrompt(id);
        editCell.appendChild(editBtn);

        const delCell = row.insertCell(4);
        const delBtn = document.createElement("button");
        delBtn.innerText = "Delete";
        delBtn.disabled = student.teacher !== currentTeacher.uid;
        delBtn.onclick = () => deleteStudent(id);
        delCell.appendChild(delBtn);

        const attCell = row.insertCell(5);
        const attBtn = document.createElement("button");
        attBtn.innerText = "Attendance";
        attBtn.onclick = () => openAttendanceModal(id);
        attCell.appendChild(attBtn);
    }
}

// ======================= Add/Edit/Delete Students ==================
window.addStudent = function() {
    const name = document.getElementById("studentName").value;
    const className = document.getElementById("studentClass").value;
    const subject = document.getElementById("studentSubject").value;
    if (!name || !className || !subject) { alert("Enter all fields"); return; }
    const newStudentRef = push(ref(db, 'students'));
    set(newStudentRef, { name, class: className, subject, teacher: currentTeacher.uid, attendance: {} });
    document.getElementById("studentName").value = "";
    document.getElementById("studentClass").value = "";
    document.getElementById("studentSubject").value = "";
}

function editStudentPrompt(id) {
    const newName = prompt("Enter new name:", allStudents[id].name);
    if (!newName) return;
    update(ref(db, 'students/' + id), { name: newName });
}

function deleteStudent(id) {
    if (!confirm("Delete this student?")) return;
    remove(ref(db, 'students/' + id));
}

// ======================= Attendance Modal ======================
function openAttendanceModal(id) {
    selectedStudentId = id;
    const student = allStudents[id];
    document.getElementById("modalStudentName").innerText = student.name;
    document.getElementById("attendanceModal").classList.remove("hidden");
    document.getElementById("modalOverlay").classList.remove("hidden");
    loadAttendanceMonth();
}

window.closeModal = function() {
    document.getElementById("attendanceModal").classList.add("hidden");
    document.getElementById("modalOverlay").classList.add("hidden");
}

// ======================= Load Monthly Attendance ==================
window.loadAttendanceMonth = function() {
    const month = document.getElementById("monthPicker").value; 
    const table = document.getElementById("attendanceTable");
    table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Mark Present</th><th>Mark Absent</th></tr>`;
    if (!selectedStudentId) return;
    const student = allStudents[selectedStudentId];
    const attendance = student.attendance || {};
    for (let date in attendance) {
        if (month && !date.startsWith(month)) continue;
        const row = table.insertRow();
        row.insertCell(0).innerText = date;
        row.insertCell(1).innerText = attendance[date];
        const presentBtn = row.insertCell(2).appendChild(document.createElement("button"));
        presentBtn.innerText = "Present";
        presentBtn.onclick = () => markAttendance(date, "present");
        const absentBtn = row.insertCell(3).appendChild(document.createElement("button"));
        absentBtn.innerText = "Absent";
        absentBtn.onclick = () => markAttendance(date, "absent");
    }
}

// ======================= Mark Attendance ======================
function markAttendance(date, status) {
    if (!selectedStudentId) return;
    set(ref(db, 'students/' + selectedStudentId + '/attendance/' + date), status);
    loadAttendanceMonth();
    loadStudents();
}

// ======================= Bunking Report =========================
function displayBunkingReport() {
    const table = document.getElementById("bunkingTable");
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Subject</th><th>Absences</th></tr>`;
    const bunkers = [];
    for (let id in allStudents) {
        const student = allStudents[id];
        const totalAbsent = Object.values(student.attendance || {}).filter(s => s === "absent").length;
        if (totalAbsent > 0) bunkers.push({ ...student, totalAbsent });
    }
    bunkers.sort((a,b)=>b.totalAbsent - a.totalAbsent);
    bunkers.forEach(student=>{
        const row = table.insertRow();
        row.insertCell(0).innerText = student.name;
        row.insertCell(1).innerText = student.class;
        row.insertCell(2).innerText = student.subject;
        const cell = row.insertCell(3);
        cell.innerText = student.totalAbsent;
        if(student.totalAbsent>=3) cell.style.color="red";
    });
}

// ======================= Print Monthly Report ==================
window.printReport = function() {
    const printContents = document.getElementById("attendanceModal").innerHTML;
    const w = window.open("", "", "width=800,height=600");
    w.document.write(printContents);
    w.document.close();
    w.print();
}