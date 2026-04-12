// ========================================
// Firebase Configuration - Spy Game
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyBfonEn1VDoyOE738Jb0J-YPjm31XJMU-s",
  authDomain: "spy-game-554cd.firebaseapp.com",
  databaseURL: "https://spy-game-554cd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "spy-game-554cd",
  storageBucket: "spy-game-554cd.firebasestorage.app",
  messagingSenderId: "1031094311331",
  appId: "1:1031094311331:web:7f000a14031803d7b6e216",
  measurementId: "G-M9RZHMZYNL"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const db = firebase.database();

console.log('✅ Firebase initialized successfully');
