// === LOGIN SYSTEM ===
const teachers = {
  "ai_teacher": { password: "ai123", subject: "Artificial Intelligence" },
  "ped_teacher": { password: "ped123", subject: "Physical Education" },
  "cs_teacher": { password: "cs123", subject: "Computer Science" },
  "psy_teacher": { password: "psy123", subject: "Psychology" },
  "ds_teacher": { password: "ds123", subject: "Data Science" },
};

let loggedInTeacher = null;

function loginTeacher() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const teacher = teachers[username];

  if (teacher && teacher.password === password) {
    loggedInTeacher = teacher;
    document.getElementById("login-section").style.display = "none";
    document.getElementById("attendance-section").style.display = "block";
    document.getElementById("teacher-subject").innerText = teacher.subject;
    loadStudentsForSubject(teacher.subject);
  } else {
    alert("Invalid username or password");
  }
}

// === STUDENTS DATA (from students.js) ===
function loadStudentsForSubject(subject) {
  const container = document.getElementById("students-list");
  container.innerHTML = "";
  const classNames = Object.keys(studentsData);

  classNames.forEach(className => {
    const classDiv = document.createElement("div");
    classDiv.classList.add("class-box");
    const classTitle = document.createElement("h3");
    classTitle.textContent = `Class ${className}`;
    classDiv.appendChild(classTitle);

    const students = studentsData[className][subject];
    if (!students) return;

    students.forEach(student => {
      const row = document.createElement("div");
      row.classList.add("student-row");
      row.innerHTML = `
        <span>${student}</span>
        <button onclick="markAttendance('${className}','${subject}','${student}','Present')">✅ Present</button>
        <button onclick="markAttendance('${className}','${subject}','${student}','Absent')">❌ Absent</button>
      `;
      classDiv.appendChild(row);
    });
    container.appendChild(classDiv);
  });
}

// === MARK ATTENDANCE ===
function markAttendance(className, subject, studentName, status) {
  console.log(`${studentName} in ${className} marked ${status}`);
  alert(`${studentName} marked as ${status}`);

  // Auto-save to Firebase
  if (typeof saveAttendanceToFirebase === "function") {
    saveAttendanceToFirebase(className, subject, studentName, status);
  }
}

// === FIREBASE SAVE FUNCTION ===
async function saveAttendanceToFirebase(className, subject, studentName, status) {
  try {
    await db.collection("attendance").add({
      class: className,
      subject: subject,
      student: studentName,
      status: status,
      timestamp: new Date().toLocaleString(),
    });
    console.log(`✅ Saved to Firebase: ${studentName} - ${status}`);
  } catch (error) {
    console.error("❌ Error saving to Firebase:", error);
  }
}
