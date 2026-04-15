import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            '/admin': 'http://localhost:3000',
            '/v1': 'http://localhost:3000',
        }
    }
});
//# sourceMappingURL=vite.config.js.map