import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initTelegram } from './lib/telegram';

initTelegram();
// iOS shows :active press states only once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

export default mount(App, { target: document.getElementById('app')! });
