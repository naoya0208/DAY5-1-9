import React, { useState, useEffect } from 'react';
import { Coffee, CheckCircle, LogOut, Play, Settings, User, Clock, Bell } from 'lucide-react';

// 注意: このURLはGASをデプロイした後に更新する必要があります
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw0LuXOKn9U7Vl_WMy5qizVBhbyJum-m_LX43Lw5leEJ3T7kX441tUIuMj-2rT4bTtV/exec';

function App() {
    const [status, setStatus] = useState(() => localStorage.getItem('tracker_status') || 'idle');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [notification, setNotification] = useState({ show: false, message: '' });

    const [userInfo, setUserInfo] = useState(() => {
        const saved = localStorage.getItem('user_info');
        return saved ? JSON.parse(saved) : { id: 'T001', name: '研修生' };
    });

    const [tempUserInfo, setTempUserInfo] = useState(userInfo);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        localStorage.setItem('tracker_status', status);
    }, [status]);

    const showToast = (message) => {
        setNotification({ show: true, message });
        setTimeout(() => setNotification({ show: false, message: '' }), 3000);
    };

    const handleAction = async (type, extraData = {}) => {
        if (!userInfo.id || !userInfo.name) {
            setShowSettings(true);
            return;
        }

        setLoading(true);
        try {
            await fetch(GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify({
                    type,
                    traineeId: userInfo.id,
                    name: userInfo.name,
                    appUrl: window.location.href,
                    ...extraData
                }),
            });

            if (type === 'clock-in') {
                setStatus('working');
                showToast('出勤を記録しました');
            }
            if (type === 'clock-out') {
                setStatus('idle');
                showToast('退勤を記録しました');
            }
            if (type === 'break-start') {
                setStatus('break');
                showToast('休憩を開始しました');
            }
            if (type === 'break-end') {
                setStatus('working');
                showToast('休憩を終了しました');
            }
            if (type === 'assignment') {
                showToast('課題完了を報告しました');
            }
        } catch (error) {
            console.error('Detailed Error:', error);
            alert(`エラーが発生しました：${error.message}\nインターネット接続またはGASのアクセス許可設定（全員）を確認してください。`);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = () => {
        setUserInfo(tempUserInfo);
        localStorage.setItem('user_info', JSON.stringify(tempUserInfo));
        setShowSettings(false);
        showToast('設定を保存しました');
    };

    return (
        <div className="container">
            {/* Toast Notification */}
            <div className={`toast ${notification.show ? 'show' : ''}`}>
                <Bell size={18} />
                {notification.message}
            </div>

            <div className="glass-card">
                <div className="header">
                    <div className="user-profile" onClick={() => setShowSettings(true)}>
                        <div className="avatar">
                            <User size={20} />
                        </div>
                        <div className="user-details">
                            <span className="user-name">{userInfo.name}</span>
                            <span className="user-id">ID: {userInfo.id}</span>
                        </div>
                        <Settings className="settings-icon" size={18} />
                    </div>
                </div>

                <div className={`status-display status-${status}`}>
                    <div className="status-label">
                        {status === 'idle' && '未出勤'}
                        {status === 'working' && '勤務中'}
                        {status === 'break' && '休憩中'}
                    </div>
                    <div className="time-display">{currentTime.toLocaleTimeString('ja-JP', { hour12: false })}</div>
                    <div className="date-display">{currentTime.toLocaleDateString('ja-JP', { weekday: 'short', month: 'long', day: 'numeric' })}</div>
                </div>

                <div className="main-actions">
                    {status === 'idle' ? (
                        <button
                            className="action-btn btn-clock-in"
                            onClick={() => handleAction('clock-in')}
                            disabled={loading}
                        >
                            <div className="btn-icon"><Play size={32} fill="currentColor" /></div>
                            <span>出勤打刻</span>
                        </button>
                    ) : (
                        <button
                            className="action-btn btn-clock-out"
                            onClick={() => handleAction('clock-out')}
                            disabled={loading}
                        >
                            <div className="btn-icon"><LogOut size={32} /></div>
                            <span>退勤打刻</span>
                        </button>
                    )}
                </div>

                <div className="secondary-actions">
                    <button
                        className={`btn-sub ${status === 'break' ? 'active' : ''}`}
                        onClick={() => handleAction(status === 'break' ? 'break-end' : 'break-start')}
                        disabled={loading || status === 'idle'}
                    >
                        <Coffee size={24} />
                        <span>{status === 'break' ? '休憩終了' : '休憩開始'}</span>
                    </button>

                    <button
                        className="btn-sub btn-assignment"
                        onClick={() => {
                            if (window.confirm('「課題完了ボタン」を押すと管理者に通知が届きます。よろしいですか？')) {
                                handleAction('assignment');
                            }
                        }}
                        disabled={loading}
                    >
                        <CheckCircle size={24} />
                        <span>課題完了</span>
                    </button>
                </div>
            </div>

            {showSettings && (
                <div className="modal-overlay">
                    <div className="modal-content glass-effect">
                        <h3>ユーザー設定</h3>
                        <div className="input-field">
                            <label>研修生ID</label>
                            <input
                                type="text"
                                value={tempUserInfo.id}
                                onChange={(e) => setTempUserInfo({ ...tempUserInfo, id: e.target.value })}
                                placeholder="T001"
                            />
                        </div>
                        <div className="input-field">
                            <label>氏名</label>
                            <input
                                type="text"
                                value={tempUserInfo.name}
                                onChange={(e) => setTempUserInfo({ ...tempUserInfo, name: e.target.value })}
                                placeholder="山田 太郎"
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={() => setShowSettings(false)}>キャンセル</button>
                            <button className="btn-save" onClick={saveSettings}>保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
