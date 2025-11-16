// script.js
import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ref, set, push, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

let currentTeacher = null;
let allStudents = {};
let selectedStudentId = null;

// ======================= SIGNUP / LOGIN =======================
window.signup = function() {
    const email = document.getElementById("signupEmail").value;
    const password = document.getElementById("signupPassword").value;
    const name = document.getElementById("signupName").value;
    const subject = document.getElementById("signupSubject").value;
    const classesText = document.getElementById("signupClasses").value;

    if (!email || !password || !name || !subject || !classesText) { alert("Fill all fields"); return; }

    const classes = classesText.split(",").map(c=>c.trim());

    createUserWithEmailAndPassword(auth,email,password).then(user=>{
        const uid = user.user.uid;
        set(ref(db,'teachers/'+uid),{email,name,subject,classes});
        alert("Signup success!");
        document.getElementById("signupDiv").classList.add("hidden");
        document.getElementById("loginDiv").classList.remove("hidden");
    }).catch(e=>alert(e.message));
}

window.login = function() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    signInWithEmailAndPassword(auth,email,password).then(user=>{
        currentTeacher = user.user;
        document.getElementById("loginDiv").classList.add("hidden");
        document.getElementById("dashboardDiv").classList.remove("hidden");
        loadTeacherInfo();
    }).catch(e=>alert(e.message));
}

window.logout = function() {
    signOut(auth).then(()=>{
        currentTeacher = null;
        document.getElementById("dashboardDiv").classList.add("hidden");
        document.getElementById("topBunkersDiv").classList.add("hidden");
        document.getElementById("loginDiv").classList.remove("hidden");
    });
}

// ======================= LOAD TEACHER INFO =======================
function loadTeacherInfo(){
    const teacherRef = ref(db,'teachers/'+currentTeacher.uid);
    onValue(teacherRef, snap=>{
        const data = snap.val();
        document.getElementById("teacherNameDisplay").innerText = data.name;
        document.getElementById("teacherSubjectDisplay").innerText = data.subject;
        populateClassDropdown(data.classes || []);
        loadStudents();
    });
}

// ======================= CLASS DROPDOWN =======================
function populateClassDropdown(classes){
    const filter = document.getElementById("classFilter");
    const add = document.getElementById("classFilterAdd");
    filter.innerHTML="<option value='all'>All Classes</option>";
    add.innerHTML="<option value=''>Select Class</option>";
    classes.forEach(c=>{
        const opt1=document.createElement("option"); opt1.value=c; opt1.innerText=c; filter.appendChild(opt1);
        const opt2=document.createElement("option"); opt2.value=c; opt2.innerText=c; add.appendChild(opt2);
    });
}

// ======================= LOAD STUDENTS =======================
function loadStudents(){
    const selectedClass = document.getElementById("classFilter").value;
    const studentsRef = ref(db,'students');
    onValue(studentsRef,snap=>{
        allStudents = snap.val() || {};
        const filtered = {};
        for(let id in allStudents){
            const s=allStudents[id];
            if(s.teacher===currentTeacher.uid && s.subject===document.getElementById("teacherSubjectDisplay").innerText){
                if(selectedClass==='all' || s.class===selectedClass){ filtered[id]=s; }
            }
        }
        displayStudentsTable(filtered);
        displayTopBunkers(filtered);
    });
}

// ======================= DISPLAY STUDENTS =====================
function displayStudentsTable(students){
    const table=document.getElementById("studentsTable");
    table.innerHTML=`<tr><th>Name</th><th>Class</th><th>Attendance</th><th>Edit</th><th>Delete</th></tr>`;
    for(let id in students){
        const s=students[id];
        const row=table.insertRow();
        row.insertCell(0).innerText=s.name;
        row.insertCell(1).innerText=s.class;
        row.insertCell(2).innerText=Object.values(s.attendance||{}).filter(a=>a==="absent").length;
        const editCell=row.insertCell(3);
        const editBtn=document.createElement("button"); editBtn.innerText="Edit"; editBtn.onclick=()=>editStudent(id); editCell.appendChild(editBtn);
        const delCell=row.insertCell(4);
        const delBtn=document.createElement("button"); delBtn.innerText="Delete"; delBtn.onclick=()=>deleteStudent(id); delCell.appendChild(delBtn);
        row.onclick=()=>openAttendanceModal(id);
    }
}

// ======================= ADD STUDENT ===========================
window.addStudent=function(){
    const name=document.getElementById("studentName").value;
    const className=document.getElementById("classFilterAdd").value;
    const subject=document.getElementById("teacherSubjectDisplay").innerText;
    if(!name || !className){ alert("Fill all fields"); return; }
    const newStudentRef = push(ref(db,'students'));
    set(newStudentRef,{name, class:className, subject, teacher:currentTeacher.uid, attendance:{}});
    document.getElementById("studentName").value="";
    loadStudents();
}

// ======================= EDIT / DELETE ========================
function editStudent(id){
    const newName = prompt("Enter new name",allStudents[id].name);
    if(!newName) return;
    update(ref(db,'students/'+id),{name:newName});
}

function deleteStudent(id){
    if(!confirm("Delete student?")) return;
    remove(ref(db,'students/'+id));
}

// ======================= ATTENDANCE MODAL =====================
function openAttendanceModal(id){
    selectedStudentId=id;
    const student=allStudents[id];
    document.getElementById("modalStudentName").innerText=student.name;
    document.getElementById("attendanceModal").classList.remove("hidden");
    document.getElementById("modalOverlay").classList.remove("hidden");
    loadAttendanceMonth();
}

window.closeModal=function(){
    document.getElementById("attendanceModal").classList.add("hidden");
    document.getElementById("modalOverlay").classList.add("hidden");
}

// ======================= LOAD MONTHLY ATTENDANCE ==============
window.loadAttendanceMonth=function(){
    const month=document.getElementById("monthPicker").value;
    const table=document.getElementById("attendanceTable");
    table.innerHTML="<tr><th>Date</th><th>Status</th><th>Mark Present</th><th>Mark Absent</th></tr>";
    if(!selectedStudentId) return;
    const student=allStudents[selectedStudentId];
    const attendance=student.attendance||{};
    for(let date in attendance){
        if(month && !date.startsWith(month)) continue;
        const row=table.insertRow();
        row.insertCell(0).innerText=date;
        row.insertCell(1).innerText=attendance[date];
        const presentBtn=row.insertCell(2).appendChild(document.createElement("button"));
        presentBtn.innerText="Present"; presentBtn.onclick=()=>markAttendance(date,"present");
        const absentBtn=row.insertCell(3).appendChild(document.createElement("button"));
        absentBtn.innerText="Absent"; absentBtn.onclick=()=>markAttendance(date,"absent");
    }
}

// ======================= MARK ATTENDANCE =====================
function markAttendance(date,status){
    if(!selectedStudentId) return;
    set(ref(db,'students/'+selectedStudentId+'/attendance/'+date),status);
    loadStudents();
}

// ======================= PRINT REPORT ========================
window.printReport=function(){
    const content=document.getElementById("attendanceModal").innerHTML;
    const w=window.open("","Print","width=800,height=600");
    w.document.write(content); w.document.close(); w.print();
}

// ======================= TOP BUNKERS ==========================
function displayTopBunkers(students){
    const table=document.getElementById("bunkingTable");
    table.innerHTML="<tr><th>Name</th><th>Class</th><th>Absences</th></tr>";
    const bunkers=[];
    for(let id in students){
        const s=students[id];
        const absentCount=Object.values(students[id].attendance||{}).filter(a=>a==="absent").length;
        if(absentCount>0) bunkers.push({...s,totalAbsent:absentCount});
    }
    bunkers.sort((a,b)=>b.totalAbsent-a.totalAbsent);
    bunkers.forEach(s=>{
        const row=table.insertRow();
        row.insertCell(0).innerText=s.name;
        row.insertCell(1).innerText=s.class;
        const cell=row.insertCell(2); cell.innerText=s.totalAbsent;
        if(s.totalAbsent>=3) cell.style.color="red";
    });
}

// ======================= SHOW TAB ============================
window.showTab=function(tabId){
    document.getElementById("studentsTab").classList.add("hidden");
    document.getElementById("bunkersTab").classList.add("hidden");
    document.getElementById(tabId).classList.remove("hidden");
}