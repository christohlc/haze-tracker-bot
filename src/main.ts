import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import Retired from './components/Retired.svelte';
import { initTelegram } from './lib/telegram';
import { RETIRED } from '../tgcloud/lib/retired.js';

initTelegram();
// iOS shows :active press states only once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// Resting between haze seasons: no dashboard, not even the copy saved on this device.
export default mount(RETIRED ? Retired : App, { target: document.getElementById('app')! });
