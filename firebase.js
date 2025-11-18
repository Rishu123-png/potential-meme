// firebase.js - Firebase CDN version 10.7.1 (FULLY compatible)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBSWzs19870cWmGxd9-kJsKOOs755jyuU0",
  authDomain: "school-attendence-system-9090.firebaseapp.com",
  databaseURL: "https://school-attendence-system-9090-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-attendence-system-9090",
  storageBucket: "school-attendence-system-9090.firebasestorage.app",
  messagingSenderId: "728832169882",
  appId: "1:728832169882:web:b335869779e73ab8c20c23"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);