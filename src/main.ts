import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initTelegram } from './lib/telegram';

initTelegram();

export default mount(App, { target: document.getElementById('app')! });
