// global.js
import { auth } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let currentUser = null;
onAuthStateChanged(auth, u => { currentUser = u; });

export function getCurrentUser() { return currentUser; }

// Wait until auth is ready then call fn (useful on page load)
export function waitForAuth(fn, timeout = 500) {
  if (currentUser) return fn();
  setTimeout(() => waitForAuth(fn, timeout), timeout);
}

// Logout (global)
window.logout = async function() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn("Sign out error", e);
  } finally {
    location.href = "index.html";
  }
};
