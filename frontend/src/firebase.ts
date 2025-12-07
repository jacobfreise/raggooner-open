import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAOZOQKH7slZ2fW_jjZEvFCH0T82EMBiVg",
    authDomain: "raggooneropen.firebaseapp.com",
    databaseURL: "https://raggooneropen-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "raggooneropen",
    storageBucket: "raggooneropen.firebasestorage.app",
    messagingSenderId: "389145362446",
    appId: "1:389145362446:web:907a5c2f2c30a11db97c5f",
    measurementId: "G-QWVW75P7MC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);