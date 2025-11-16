// ======================= Firebase Setup =======================
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, get, set, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// ======================= Global Variables =======================
let currentTeacher = null;
let allStudents = {};
let selectedStudentId = null;
let selectedClass = null;

// ======================= LOGIN / LOGOUT =======================
window.login = async function() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentTeacher = userCredential.user;
        document.getElementById("loginDiv").classList.add("hidden");
        document.getElementById("dashboard").classList.remove("hidden");
        loadTeacherInfo();
    } catch(err) {
        alert(err.message);
    }
}

window.logout = function() {
    signOut(auth);
    currentTeacher = null;
    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("loginDiv").classList.remove("hidden");
}

// ======================= LOAD TEACHER =======================
function loadTeacherInfo() {
    const teacherRef = ref(db, 'teachers/' + currentTeacher.uid);
    onValue(teacherRef, snapshot => {
        const data = snapshot.val();
        if(!data) return alert("Teacher not found in DB!");
        document.getElementById("teacherName").innerText = data.name;
        document.getElementById("teacherSubject").innerText = data.subject;
        populateClassFilter();
        loadStudents();
    });
}

// ======================= CLASS FILTER =======================
function populateClassFilter() {
    const select = document.getElementById("classFilter");
    select.innerHTML = `<option value="">All Classes</option>
                        <option value="11A">11A</option>
                        <option value="11B">11B</option>
                        <option value="11C">11C</option>`;
    select.onchange = () => {
        selectedClass = select.value;
        loadStudents();
    }
}

// ======================= LOAD STUDENTS =======================
function loadStudents() {
    const studentsRef = ref(db, 'students');
    onValue(studentsRef, snapshot => {
        allStudents = snapshot.val() || {};
        displayStudents();
        displayBunkers();
    });
}

// ======================= DISPLAY STUDENTS =======================
function displayStudents() {
    const table = document.getElementById("studentsTable");
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Attendance</th><th>Edit</th><th>Delete</th></tr>`;
    for(let id in allStudents){
        const s = allStudents[id];
        if(s.subject !== document.getElementById("teacherSubject").innerText) continue; // Only teacher subject
        if(selectedClass && s.class !== selectedClass) continue; // Filter class

        const row = table.insertRow();
        row.insertCell(0).innerText = s.name;
        row.insertCell(1).innerText = s.class;

        const totalAbsent = Object.values(s.attendance || {}).filter(v => v==="absent").length;
        row.insertCell(2).innerText = totalAbsent;

        const editBtn = document.createElement("button");
        editBtn.innerText = "Edit"; editBtn.onclick = ()=>editStudent(id);
        row.insertCell(3).appendChild(editBtn);

        const delBtn = document.createElement("button");
        delBtn.innerText = "Delete"; delBtn.onclick = ()=>deleteStudent(id);
        row.insertCell(4).appendChild(delBtn);

        row.onclick = ()=>openAttendanceModal(id);
    }
}

// ======================= ADD / EDIT / DELETE STUDENTS =======================
window.addStudent = function() {
    const name = document.getElementById("studentName").value;
    const cls = document.getElementById("addClass").value;
    const subject = document.getElementById("teacherSubject").innerText;
    if(!name || !cls) return alert("Enter name and class");

    const newRef = push(ref(db,'students'));
    set(newRef,{
        name, class:cls, subject, teacher:currentTeacher.uid, attendance:{}
    });
    document.getElementById("studentName").value="";
}

function editStudent(id){
    const newName = prompt("Enter new name:", allStudents[id].name);
    if(!newName) return;
    update(ref(db,'students/'+id),{name:newName});
}

function deleteStudent(id){
    if(confirm("Delete student?")) remove(ref(db,'students/'+id));
}

// ======================= ATTENDANCE MODAL =======================
function openAttendanceModal(id){
    selectedStudentId = id;
    const s = allStudents[id];
    document.getElementById("modalStudentName").innerText = s.name;
    document.getElementById("attendanceModal").classList.remove("hidden");
    document.getElementById("modalOverlay").classList.remove("hidden");
    loadAttendanceMonth();
}

window.closeModal = function(){
    document.getElementById("attendanceModal").classList.add("hidden");
    document.getElementById("modalOverlay").classList.add("hidden");
}

// ======================= ATTENDANCE HISTORY =======================
window.loadAttendanceMonth = function(){
    if(!selectedStudentId) return;
    const month = document.getElementById("monthPicker").value; // YYYY-MM
    const table = document.getElementById("attendanceTable");
    table.innerHTML = `<tr><th>Date</th><th>Status</th><th>Mark Present</th><th>Mark Absent</th></tr>`;
    const student = allStudents[selectedStudentId];
    const attendance = student.attendance || {};

    for(let date in attendance){
        if(month && !date.startsWith(month)) continue;
        const row = table.insertRow();
        row.insertCell(0).innerText = date;
        row.insertCell(1).innerText = attendance[date];

        const presentBtn = row.insertCell(2).appendChild(document.createElement("button"));
        presentBtn.innerText="Present"; presentBtn.onclick=()=>markAttendance(date,"present");
        const absentBtn = row.insertCell(3).appendChild(document.createElement("button"));
        absentBtn.innerText="Absent"; absentBtn.onclick=()=>markAttendance(date,"absent");
    }
}

// ======================= MARK ATTENDANCE =======================
function markAttendance(date,status){
    if(!selectedStudentId) return;
    set(ref(db,'students/'+selectedStudentId+'/attendance/'+date),status);
}

// ======================= TOP BUNKERS =======================
function displayBunkers(){
    const table = document.getElementById("bunkingTable");
    table.innerHTML = `<tr><th>Name</th><th>Class</th><th>Absences</th></tr>`;
    const bunkers = [];
    for(let id in allStudents){
        const s = allStudents[id];
        if(s.subject!==document.getElementById("teacherSubject").innerText) continue;
        if(selectedClass && s.class !== selectedClass) continue;
        const absentCount = Object.values(s.attendance||{}).filter(v=>"absent"===v).length;
        if(absentCount>0) bunkers.push({...s,totalAbsent:absentCount});
    }
    bunkers.sort((a,b)=>b.totalAbsent-a.totalAbsent);
    bunkers.forEach(s=>{
        const row=table.insertRow();
        row.insertCell(0).innerText=s.name;
        row.insertCell(1).innerText=s.class;
        const cell=row.insertCell(2);
        cell.innerText=s.totalAbsent;
        if(s.totalAbsent>=3) cell.style.color="red";
    });
}