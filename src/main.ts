import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Vue Flow 必须的基础样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'

import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
