import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView
        },
        {
            path: '/t/:id',
            name: 'tournament',
            component: () => import('../views/TournamentView.vue')
        },
        {
            path: '/analytics',
            name: 'analytics',
            component: () => import('../components/AnalyticsDashboard.vue')
        },
        {
            path: '/tools',
            name: 'tools',
            component: () => import('../views/ToolsView.vue')
        }
    ]
})

export default router