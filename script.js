    import { app } from "./firebase.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { studentsData } from "./students.js";

const auth = getAuth(app);
const db = getDatabase(app);

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginContainer = document.getElementById("login-container");
const attendanceContainer = document.getElementById("attendance-container");
const loginMessage = document.getElementById("loginMessage");
const teacherNameSpan = document.getElementById("teacherName");

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const saveMessage = document.getElementById("saveMessage");
const saveBtn = document.getElementById("saveAttendanceBtn");
const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const historyBody = document.getElementById("historyBody");

// LOGIN
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginMessage.textContent = "Login successful!";
  } catch (error) {
    loginMessage.textContent = "Invalid email or password!";
  }
});

// AUTH STATE
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = "none";
    attendanceContainer.style.display = "block";
    teacherNameSpan.textContent = user.email;
  } else {
    loginContainer.style.display = "block";
    attendanceContainer.style.display = "none";
  }
});

// LOGOUT
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// AUTO STUDENT LIST
classSelect.addEventListener("change", updateStudentList);
subjectSelect.addEventListener("change", updateStudentList);

function updateStudentList() {
  const className = classSelect.value;
  const subject = subjectSelect.value;
  const studentListDiv = document.getElementById("studentList");

  studentListDiv.innerHTML = "";

  if (className && subject && studentsData[className] && studentsData[className][subject]) {
    let students = studentsData[className][subject];
    students.sort();

    students.forEach((student) => {
      const row = document.createElement("div");
      row.classList.add("student-row");
      row.innerHTML = `
        <span>${student}</span>
        <select id="status-${student}">
          <option value="Present">Present</option>
          <option value="Absent">Absent</option>
        </select>
      `;
      studentListDiv.appendChild(row);
    });
  }
}

// SAVE ATTENDANCE
saveBtn.addEventListener("click", () => {
  const className = classSelect.value;
  const subject = subjectSelect.value;

  if (!className || !subject) {
    saveMessage.textContent = "⚠️ Please select class and subject!";
    return;
  }

  const students = studentsData[className]?.[subject];
  if (!students) {
    saveMessage.textContent = "No students found!";
    return;
  }

  students.sort();
  const attendanceRef = ref(db, "attendance");

  students.forEach((student) => {
    const status = document.getElementById(`status-${student}`).value;
    const record = {
      className,
      subject,
      studentName: student,
      status,
      date: new Date().toLocaleString(),
      teacher: auth.currentUser?.email || "unknown"
    };
    push(attendanceRef, record);
  });

  saveMessage.textContent = "✅ Attendance saved successfully!";
});

// VIEW HISTORY
viewHistoryBtn.addEventListener("click", () => {
  historyBody.innerHTML = "";
  const attendanceRef = ref(db, "attendance");

  onValue(attendanceRef, (snapshot) => {
    historyBody.innerHTML = "";
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.values(data).forEach((r) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${r.date}</td>
          <td>${r.className}</td>
          <td>${r.subject}</td>
          <td>${r.studentName}</td>
          <td>${r.status}</td>
        `;
        historyBody.appendChild(row);
      });
    } else {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="5">No attendance data found</td>`;
      historyBody.appendChild(row);
    }
  });
});
