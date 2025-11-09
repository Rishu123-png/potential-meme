import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { app } from "./firebase.js";

// Firebase Database
const db = getDatabase(app);

// LOGIN SECTION
const loginBtn = document.getElementById("loginBtn");
const loginContainer = document.getElementById("login-container");
const attendanceContainer = document.getElementById("attendance-container");
const loginMessage = document.getElementById("loginMessage");
const teacherNameSpan = document.getElementById("teacherName");

// DUMMY LOGIN (You can link real teacher data later)
const validUsers = {
  teacher: "12345",
  admin: "admin123"
};

loginBtn.addEventListener("click", () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (validUsers[username] && validUsers[username] === password) {
    loginMessage.textContent = "Login successful!";
    loginContainer.style.display = "none";
    attendanceContainer.style.display = "block";
    teacherNameSpan.textContent = username;
  } else {
    loginMessage.textContent = "Invalid username or password!";
  }
});

// LOGOUT
document.getElementById("logoutBtn").addEventListener("click", () => {
  attendanceContainer.style.display = "none";
  loginContainer.style.display = "block";
});

// SAVE ATTENDANCE
const saveBtn = document.getElementById("saveAttendanceBtn");
saveBtn.addEventListener("click", () => {
  const className = document.getElementById("classSelect").value;
  const subject = document.getElementById("subjectSelect").value;
  const studentName = document.getElementById("studentName").value.trim();
  const status = document.getElementById("attendanceStatus").value;
  const saveMessage = document.getElementById("saveMessage");

  if (!className || !subject || !studentName) {
    saveMessage.textContent = "⚠️ Please fill all fields!";
    return;
  }

  const attendanceRef = ref(db, "attendance");
  const newRecord = {
    className,
    subject,
    studentName,
    status,
    date: new Date().toLocaleString(),
  };

  push(attendanceRef, newRecord)
    .then(() => {
      saveMessage.textContent = "✅ Attendance saved successfully!";
      document.getElementById("studentName").value = "";
    })
    .catch((error) => {
      console.error("Error saving attendance:", error);
      saveMessage.textContent = "❌ Failed to save attendance!";
    });
});

// VIEW ATTENDANCE HISTORY
const viewHistoryBtn = document.getElementById("viewHistoryBtn");
const historyBody = document.getElementById("historyBody");

viewHistoryBtn.addEventListener("click", () => {
  historyBody.innerHTML = ""; // clear old data
  const attendanceRef = ref(db, "attendance");

  onValue(attendanceRef, (snapshot) => {
    historyBody.innerHTML = "";
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.values(data).forEach((record) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${record.date}</td>
          <td>${record.className}</td>
          <td>${record.subject}</td>
          <td>${record.studentName}</td>
          <td>${record.status}</td>
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
