import { app } from "./firebase.js";
import { studentsData } from "./students.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase, ref, set, get, push, child
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

window.addEventListener("DOMContentLoaded", () => {
  const auth = getAuth(app);
  const db = getDatabase(app);
  const storage = getStorage(app);

  // UI references
  const authLogin = document.getElementById("authLogin");
  const authSignup = document.getElementById("authSignup");
  const showSignup = document.getElementById("showSignup");
  const showLogin = document.getElementById("showLogin");
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("signupBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const saveAll = document.getElementById("saveAll");
  const viewHistory = document.getElementById("viewHistory");

  // Toggle Login/Signup
  showSignup?.addEventListener("click", () => {
    authLogin.style.display = "none";
    authSignup.style.display = "block";
  });

  showLogin?.addEventListener("click", () => {
    authSignup.style.display = "none";
    authLogin.style.display = "block";
  });

  // Signup
  signupBtn?.addEventListener("click", async () => {
    const name = fullName.value.trim();
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const cls = signupClass.value.trim();
    const subj = signupSubject.value.trim();
    const file = avatarUpload.files[0];
    signupMessage.textContent = "";

    if (!name || !email || password.length < 6 || !cls || !subj) {
      signupMessage.textContent = "Fill all fields (password min 6 chars)";
      return;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;
      let photoURL = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

      if (file) {
        const fileRef = sRef(storage, `avatars/${uid}/${file.name}`);
        await uploadBytes(fileRef, file);
        photoURL = await getDownloadURL(fileRef);
      }

      await set(ref(db, `teachers/${uid}`), {
        name, email, class: cls, subject: subj, photoURL,
        createdAt: new Date().toISOString()
      });

      signupMessage.textContent = "✅ Account created! You can now log in.";
      showLogin.click();
    } catch (err) {
      signupMessage.textContent = err.message;
    }
  });

  // Login
  loginBtn?.addEventListener("click", async () => {
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    } catch (err) {
      authMessage.textContent = err.message;
    }
  });

  // Auth change
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      authLogin.style.display = "none";
      authSignup.style.display = "none";
      dashboard.style.display = "block";

      const snap = await get(child(ref(db), `teachers/${user.uid}`));
      if (snap.exists()) {
        const t = snap.val();
        welcome.textContent = `Welcome, ${t.name}`;
        teacherMeta.textContent = `${t.subject} • ${t.class}`;
        teacherAvatar.src = t.photoURL || teacherAvatar.src;
      }
    } else {
      dashboard.style.display = "none";
      authLogin.style.display = "block";
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", () => signOut(auth));

  // Render students
  function renderStudentsFor(cls, subj) {
    studentListContainer.innerHTML = "";
    const list = studentsData[cls]?.[subj] || [];
    if (list.length === 0) {
      studentListContainer.innerHTML = `<p>No students for ${cls} / ${subj}</p>`;
      return;
    }
    list.sort();
    list.forEach(name => {
      const row = document.createElement("div");
      row.className = "student-row";
      row.innerHTML = `<span>${name}</span>
        <select>
          <option>Present</option>
          <option>Absent</option>
        </select>`;
      studentListContainer.appendChild(row);
    });
  }

  classSelect?.addEventListener("change", () =>
    renderStudentsFor(classSelect.value, subjectSelect.value)
  );
  subjectSelect?.addEventListener("change", () =>
    renderStudentsFor(classSelect.value, subjectSelect.value)
  );

  // Save attendance
  saveAll?.addEventListener("click", async () => {
    const cls = classSelect.value, subj = subjectSelect.value;
    const rows = studentListContainer.querySelectorAll(".student-row");
    if (!cls || !subj || rows.length === 0) return alert("Select class & subject first.");
    const date = new Date().toISOString().split("T")[0];
    const ts = new Date().toISOString();
    const user = auth.currentUser;
    for (const r of rows) {
      const name = r.querySelector("span").innerText;
      const status = r.querySelector("select").value;
      await push(ref(db, `attendance/${date}/${cls}/${subj}`), {
        student: name, status, teacher: user.email, timestamp: ts
      });
    }
    alert("✅ Attendance saved!");
  });

  // View history
  viewHistory?.addEventListener("click", async () => {
    historyTableBody.innerHTML = "";
    const cls = classSelect.value, subj = subjectSelect.value;
    if (!cls || !subj) return alert("Select class & subject first.");
    const snap = await get(ref(db, `attendance`));
    if (!snap.exists()) return alert("No records found.");
    const data = snap.val();
    for (const date in data) {
      const c = data[date][cls]?.[subj];
      if (!c) continue;
      for (const id in c) {
        const r = c[id];
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${date}</td><td>${cls}</td><td>${subj}</td><td>${r.student}</td><td>${r.status}</td><td>${r.teacher}</td>`;
        historyTableBody.appendChild(tr);
      }
    }
    historyContainer.style.display = "block";
  });
});
