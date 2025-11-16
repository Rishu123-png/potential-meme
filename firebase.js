// firebase.js (npm version)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBSWzs19870cWmGxd9-kJsKOOs755jyuU0",
  authDomain: "school-attendence-system-9090.firebaseapp.com",
  databaseURL: "https://school-attendence-system-9090-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-attendence-system-9090",
  storageBucket: "school-attendence-system-9090.firebasestorage.app",
  messagingSenderId: "728832169882",
  appId: "1:728832169882:web:b335869779e73ab8c20c23"
};

// Initialize Firebase app
export const app = initializeApp(firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const db = getDatabase(app);