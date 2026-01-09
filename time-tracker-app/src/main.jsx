import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

/*
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister();
            console.log('[SW] Unregistered existing service worker');
        }
    });

    // 以前のキャッシュも削除を試みる
    if (window.caches) {
        caches.keys().then(function (names) {
            for (let name of names) caches.delete(name);
        });
    }
}
*/
