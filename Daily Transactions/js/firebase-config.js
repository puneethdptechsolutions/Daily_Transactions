import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCtPb7oi5RXfJhvV1A4P3Dx2h_xiZ1g4dA",
  authDomain: "dailytransactions-521fb.firebaseapp.com",
  projectId: "dailytransactions-521fb",
  storageBucket: "dailytransactions-521fb.firebasestorage.app",
  messagingSenderId: "142655139389",
  appId: "1:142655139389:web:0413e4c5779f02f4438454"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);