import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router' // Add this

const app = createApp(App)
app.use(router) // Add this
app.mount('#app')