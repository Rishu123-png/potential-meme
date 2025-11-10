// ✅ Import Firebase and student data
import { app } from "./firebase.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { studentsData } from "./students.js";

// Firebase setup
const auth = getAuth(app);
const db = getDatabase(app);

// === HTML ELEMENTS ===
const loginContainer = document.getElementById("login-container");
const mainLayout = document.getElementById("mainLayout");
const attendanceContainer = document.getElementById("attendance-container");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");
const teacherNameSpan = document.getElementById("teacherName");

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const saveMessage = document.getElementById("saveMessage");
const saveBtn = document.getElementById("saveAttendanceBtn");
const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const historyBody = document.getElementById("historyBody");
const studentListDiv = document.getElementById("studentList");

// Sidebar buttons (new layout)
const markAttendanceBtn = document.getElementById("markAttendanceBtn");
const historyNavBtn = document.getElementById("historyNavBtn");

// === LOGIN ===
loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    loginMessage.textContent = "⚠️ Please fill all fields!";
    loginMessage.style.color = "red";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginMessage.textContent = "✅ Login successful!";
    loginMessage.style.color = "green";
  } catch (error) {
    loginMessage.textContent = "❌ Invalid email or password!";
    loginMessage.style.color = "red";
  }
});

// === AUTH STATE ===
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginContainer.style.display = "none";
    mainLayout.style.display = "flex";
    attendanceContainer.style.display = "block";
    teacherNameSpan.textContent = user.email.split("@")[0];
  } else {
    loginContainer.style.display = "block";
    mainLayout.style.display = "none";
  }
});

// === LOGOUT ===
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// === SIDEBAR BUTTONS (Navigation) ===
if (markAttendanceBtn && historyNavBtn) {
  markAttendanceBtn.addEventListener("click", () => {
    attendanceContainer.style.display = "block";
    document.getElementById("attendanceHistory").style.display = "none";
  });

  historyNavBtn.addEventListener("click", () => {
    attendanceContainer.style.display = "none";
    document.getElementById("attendanceHistory").style.display = "block";
  });
}

// === AUTO-STUDENT LIST ===
classSelect.addEventListener("change", updateStudentList);
subjectSelect.addEventListener("change", updateStudentList);

function updateStudentList() {
  const className = classSelect.value;
  const subject = subjectSelect.value;
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

// === SAVE ATTENDANCE ===
saveBtn.addEventListener("click", () => {
  const className = classSelect.value;
  const subject = subjectSelect.value;

  if (!className || !subject) {
    saveMessage.textContent = "⚠️ Please select class and subject!";
    saveMessage.style.color = "red";
    return;
  }

  const students = studentsData[className]?.[subject];
  if (!students) {
    saveMessage.textContent = "No students found!";
    saveMessage.style.color = "red";
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
  saveMessage.style.color = "green";
  setTimeout(() => (saveMessage.textContent = ""), 2000);
});

// === VIEW HISTORY ===
viewHistoryBtn.addEventListener("click", async () => {
  const attendanceRef = ref(db, "attendance");
  historyBody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

  onValue(attendanceRef, (snapshot) => {
    historyBody.innerHTML = "";
    if (snapshot.exists()) {
      const data = snapshot.val();
      const records = Object.values(data).reverse(); // show latest first

      records.forEach((r) => {
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
      historyBody.innerHTML = "<tr><td colspan='5'>No attendance data found</td></tr>";
    }
  }, {
    onlyOnce: true // fetch one-time instead of continuous
  });
});
