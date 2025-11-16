// ======================= Firebase Setup =======================
import { auth, db } from "./firebase.js"; 
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// ======================= Global Variables =======================
let currentTeacher = null;
let allStudents = {};
let teacherSubject = "";
let selectedStudentId = null;

// ======================= Page Management =======================
window.onload = function() {
    showPage("loginPage");
    document.getElementById("attendanceModal").classList.add("hidden");
    document.getElementById("modalOverlay").classList.add("hidden");
};

function showPage(pageId) {
    const pages = ["loginPage", "dashboardPage", "addStudentPage", "attendancePage", "bunkersPage"];
    pages.forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById(pageId).classList.remove("hidden");

    document.getElementById("logoutBtn").style.display = (pageId !== "loginPage") ? "block" : "none";
}

// ======================= Login / Logout =======================
window.login = function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if(!email || !password){ alert("Enter email & password"); return; }

    signInWithEmailAndPassword(auth, email, password)
        .then(userCredential => {
            currentTeacher = userCredential.user;
            showPage("dashboardPage"); // show dashboard only after login
            loadTeacherInfo();          // load teacher info & students after login
        })
        .catch(error => alert(error.message));
};

window.logout = function() {
    signOut(auth).then(() => {
        currentTeacher = null;
        showPage("loginPage");
    });
};

// ======================= Load Teacher Info ======================
function loadTeacherInfo() {
    const teacherRef = ref(db, 'teachers/' + currentTeacher.uid);
    onValue(teacherRef, snapshot => {
        const data = snapshot.val();
        document.getElementById("teacherName").innerText = data.name || "Teacher";
        teacherSubject = data.subject || "";
        document.getElementById("teacherSubject").innerText = teacherSubject;
        populateClasses(data.classes || {});
    });
}

// ======================= Populate Class Dropdown =================
function populateClasses(classesObj) {
    const select = document.getElementById("classFilter");
    select.innerHTML = "";
    for (let key in classesObj) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.innerText = classesObj[key];
        select.appendChild(opt);
    }
}

// ======================= Page Navigation =======================
window.showAddStudentForm = function() {
    const selectedClass = document.getElementById("classFilter").value;
    document.getElementById("addStudentClass").innerText = selectedClass;
    document.getElementById("addStudentSubject").innerText = teacherSubject;
    showPage("addStudentPage");
};

window.showMarkAttendance = function() {
    const selectedClass = document.getElementById("classFilter").value;
    loadStudents(selectedClass);
    showPage("attendancePage");
};

window.showTopBunkers = function() {
    displayBunkingReport();
    showPage("bunkersPage");
};

window.backToDashboard = function() {
    showPage("dashboardPage");
};

// ======================= Add Student ==========================
window.addStudent = function() {
    const name = document.getElementById("studentName").value.trim();
    const className = document.getElementById("addStudentClass").innerText;
    const subject = document.getElementById("addStudentSubject").innerText;
    if(!name){ alert("Enter student name"); return; }

    const newStudentRef = push(ref(db, 'students'));
    set(newStudentRef, {
        name: name,
        class: className,
        subject: subject,
        teacher: currentTeacher.uid,
        attendance: {}
    });
    document.getElementById("studentName").value = "";
    alert("Student added successfully!");
    showPage("dashboardPage");
}

// ======================= Load Students ==========================
function loadStudents(selectedClass) {
    const studentsRef = ref(db, 'students');
    onValue(studentsRef, snapshot => {
        allStudents = snapshot.val() || {};
        displayAttendanceTable(selectedClass);
    });
}

// ======================= Attendance Table ======================
function displayAttendanceTable(selectedClass) {
    const table = document.getElementById("attendanceTable");
    table.innerHTML = "<tr><th>Name</th><th>Present</th><th>Absent</th><th>History</th></tr>";

    for(let id in allStudents) {
        const student = allStudents[id];
        if(student.class !== selectedClass || student.subject !== teacherSubject) continue;

        const row = table.insertRow();
        row.insertCell(0).innerText = student.name;

        const presentBtn = row.insertCell(1).appendChild(document.createElement("button"));
        presentBtn.innerText = "Present";
        presentBtn.onclick = () => markAttendance(id, getTodayDate(), "present");

        const absentBtn = row.insertCell(2).appendChild(document.createElement("button"));
        absentBtn.innerText = "Absent";
        absentBtn.onclick = () => markAttendance(id, getTodayDate(), "absent");

        const historyBtn = row.insertCell(3).appendChild(document.createElement("button"));
        historyBtn.innerText = "View History";
        historyBtn.onclick = () => openAttendanceModal(id);
    }
}

// ======================= Mark Attendance =======================
function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function markAttendance(studentId, date, status) {
    const path = 'students/' + studentId + '/attendance/' + date;
    set(ref(db, path), status);
    alert(`Marked ${status} for ${allStudents[studentId].name}`);
    loadStudents(document.getElementById("classFilter").value);
}

// ======================= Attendance History =====================
function openAttendanceModal(studentId) {
    selectedStudentId = studentId;
    const student = allStudents[studentId];
    document.getElementById("modalStudentName").innerText = student.name;
    document.getElementById("attendanceModal").classList.remove("hidden");
    document.getElementById("modalOverlay").classList.remove("hidden");
    loadAttendanceMonth();
}

window.closeModal = function() {
    document.getElementById("attendanceModal").classList.add("hidden");
    document.getElementById("modalOverlay").classList.add("hidden");
}

window.loadAttendanceMonth = function() {
    if(!selectedStudentId) return;
    const month = document.getElementById("monthPicker").value;
    const table = document.getElementById("attendanceMonthTable");
    table.innerHTML = "<tr><th>Date</th><th>Status</th></tr>";

    const attendance = allStudents[selectedStudentId].attendance || {};
    for(let date in attendance) {
        if(month && !date.startsWith(month)) continue;
        const row = table.insertRow();
        row.insertCell(0).innerText = date;
        row.insertCell(1).innerText = attendance[date];
    }
}

window.printReport = function() {
    const printContents = document.getElementById("attendanceModal").innerHTML;
    const w = window.open("", "", "width=800,height=600");
    w.document.write(printContents);
    w.document.close();
    w.print();
}

// ======================= Top Bunkers =========================
function displayBunkingReport() {
    const table = document.getElementById("bunkersTable");
    table.innerHTML = "<tr><th>Name</th><th>Class</th><th>Subject</th><th>Absences</th></tr>";
    const bunkers = [];

    for(let id in allStudents){
        const student = allStudents[id];
        if(student.subject !== teacherSubject) continue;
        const totalAbsent = Object.values(student.attendance || {}).filter(a => a === "absent").length;
        if(totalAbsent > 0) bunkers.push({...student, totalAbsent});
    }

    bunkers.sort((a,b) => b.totalAbsent - a.totalAbsent);
    bunkers.forEach(student => {
        const row = table.insertRow();
        row.insertCell(0).innerText = student.name;
        row.insertCell(1).innerText = student.class;
        row.insertCell(2).innerText = student.subject;
        const cell = row.insertCell(3);
        cell.innerText = student.totalAbsent;
        if(student.totalAbsent >=3) cell.style.color = "red";
    });
}