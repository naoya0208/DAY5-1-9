import React, { useState, useEffect } from 'react';
import { Coffee, CheckCircle, LogOut, Play } from 'lucide-react';

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxeUcISdoCkhh33d4U104yhlwBUhEcEOPfPG0MWub4yyN6UVoM7rVKupgkdicDKXbRdTQ/exec';
const TRAINEE_ID = 'T001'; // Demo ID
const USER_NAME = '山田 太郎'; // Demo Name
const APP_URL = window.location.href;

function App() {
    const [status, setStatus] = useState('idle'); // idle, working, break
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (date) => {
        return date.toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    };

    const handleAction = async (type) => {
        setLoading(true);
        try {
            // In a real scenario, we would use fetch to the GAS Web App URL
            console.log(`Sending ${type} to GAS...`);
            // Simulating API call
            await new Promise(resolve => setTimeout(resolve, 800));

            if (type === 'clock-in') setStatus('working');
            if (type === 'clock-out') setStatus('idle');
            if (type === 'break-start') setStatus('break');
            if (type === 'break-end') setStatus('working');

            alert(`${type} 完了しました`);
        } catch (error) {
            alert('エラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            <div className="glass-card">
                <div className="time-display">{formatTime(currentTime)}</div>
                <div className="date-display">{formatDate(currentTime)}</div>

                <div className={`status-badge status-${status}`}>
                    {status === 'idle' && '未出勤'}
                    {status === 'working' && '勤務中'}
                    {status === 'break' && '休憩中'}
                </div>

                {status === 'idle' ? (
                    <button
                        className="main-button"
                        onClick={() => handleAction('clock-in')}
                        disabled={loading}
                    >
                        <Play size={40} fill="currentColor" />
                        <span style={{ marginTop: '10px' }}>出勤打刻</span>
                    </button>
                ) : (
                    <button
                        className="main-button"
                        style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                        onClick={() => handleAction('clock-out')}
                        disabled={loading}
                    >
                        <LogOut size={40} />
                        <span style={{ marginTop: '10px' }}>退勤打刻</span>
                    </button>
                )}

                <div className="button-grid">
                    <button
                        className="secondary-button"
                        onClick={() => handleAction(status === 'break' ? 'break-end' : 'break-start')}
                        disabled={loading || status === 'idle'}
                    >
                        <Coffee size={20} />
                        {status === 'break' ? '休憩終了' : '休憩開始'}
                    </button>

                    <button
                        className="secondary-button"
                        onClick={() => handleAction('assignment')}
                        disabled={loading}
                    >
                        <CheckCircle size={20} />
                        課題完了
                    </button>

                    <button
                        className="secondary-button assignment-button"
                        onClick={() => {
                            const url = prompt('提出するアプリのURLを入力してください', APP_URL);
                            if (url) handleAction('assignment');
                        }}
                    >
                        管理者へ報告
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;
