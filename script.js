// Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Your Firebase configuration (use your own)
const firebaseConfig = {
  apiKey: "AIzaSyBSWzs19870cWmGxd9-kJsKOOs755jyuU0",
  authDomain: "school-attendence-system-9090.firebaseapp.com",
  projectId: "school-attendence-system-9090",
  storageBucket: "school-attendence-system-9090.firebasestorage.app",
  messagingSenderId: "728832169882",
  appId: "1:728832169882:web:b335869779e73ab8c20c23",
  databaseURL: "https://school-attendence-system-9090-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM elements
const loginBtn = document.getElementById("login-btn");
const loginPage = document.getElementById("login-page");
const attendancePage = document.getElementById("attendance-page");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const saveBtn = document.getElementById("save-attendance");
const viewBtn = document.getElementById("view-attendance");

// Simple login for testing
loginBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (username === "teacher" && password === "12345") {
    loginPage.style.display = "none";
    attendancePage.style.display = "block";
  } else {
    alert("Invalid login. Use username: teacher, password: 12345");
  }
});

// Save attendance record
saveBtn.addEventListener("click", async () => {
  const className = document.getElementById("class-select").value;
  const subjectName = document.getElementById("subject-select").value;
  const studentName = document.getElementById("student-name").value.trim();
  const status = document.querySelector("input[name='status']:checked")?.value;

  if (!className || !subjectName || !studentName || !status) {
    alert("⚠️ Please fill all details before saving!");
    return;
  }

  try {
    await push(ref(db, "attendance/"), {
      className,
      subjectName,
      studentName,
      status,
      timestamp: new Date().toISOString()
    });
    alert("✅ Attendance saved successfully!");
    document.getElementById("student-name").value = "";
    document.querySelectorAll("input[name='status']").forEach(r => r.checked = false);
  } catch (error) {
    console.error(error);
    alert("❌ Failed to save attendance!");
  }
});

// View attendance history (table)
viewBtn.addEventListener("click", async () => {
  const className = document.getElementById("class-select").value;
  if (!className) {
    alert("Please select a class first!");
    return;
  }

  const snapshot = await get(ref(db, "attendance/"));
  const historySection = document.getElementById("attendance-history");
  const tableBody = document.querySelector("#history-table tbody");
  tableBody.innerHTML = "";

  if (snapshot.exists()) {
    const records = Object.values(snapshot.val()).filter(r => r.className === className);
    if (records.length === 0) {
      alert(`No records found for class ${className}`);
      historySection.style.display = "none";
      return;
    }

    records.forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.className}</td>
        <td>${r.subjectName}</td>
        <td>${r.studentName}</td>
        <td>${r.status}</td>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
      `;
      tableBody.appendChild(row);
    });

    historySection.style.display = "block";
  } else {
    alert("No attendance records found!");
  }
});
