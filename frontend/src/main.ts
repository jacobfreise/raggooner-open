import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 1. Import PrimeVue config
import PrimeVue from 'primevue/config';

createApp(App).use(PrimeVue).mount('#app')
