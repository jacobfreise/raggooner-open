import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// const firebaseConfig = {
//     apiKey: "REDACTED_FIREBASE_API_KEY",
//     authDomain: "raggooneropen.firebaseapp.com",
//     databaseURL: "https://raggooneropen-default-rtdb.europe-west1.firebasedatabase.app",
//     projectId: "raggooneropen",
//     storageBucket: "raggooneropen.firebasestorage.app",
//     messagingSenderId: "389145362446",
//     appId: "1:389145362446:web:907a5c2f2c30a11db97c5f",
//     measurementId: "G-QWVW75P7MC"
// };

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (location.hostname === "localhost") {
    console.log("🔧 connecting to emulators...");
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

export { db, auth };