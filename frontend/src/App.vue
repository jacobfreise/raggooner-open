<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'


// Config will be injected by the environment
// const firebaseConfig = {
//   apiKey: "REDACTED_FIREBASE_API_KEY",
//   authDomain: "raggooneropen.firebaseapp.com",
//   databaseURL: "https://raggooneropen-default-rtdb.europe-west1.firebasedatabase.app",
//   projectId: "raggooneropen",
//   storageBucket: "raggooneropen.firebasestorage.app",
//   messagingSenderId: "389145362446",
//   appId: "1:389145362446:web:907a5c2f2c30a11db97c5f",
//   measurementId: "G-QWVW75P7MC"
// };
</script>

<template>
  <div>
  </div>
  <HelloWorld msg="Raccoon Open Tournament" />
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
