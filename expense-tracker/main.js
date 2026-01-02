// 支出データを管理するクラス
class ExpenseManager {
    constructor() {
        this.expenses = this.loadExpenses();
        this.currentFilter = 'all';
    }

    // localStorageから支出データを読み込む
    loadExpenses() {
        const data = localStorage.getItem('expenses');
        return data ? JSON.parse(data) : [];
    }

    // localStorageに支出データを保存する
    saveExpenses() {
        localStorage.setItem('expenses', JSON.stringify(this.expenses));
    }

    // 新しい支出を追加
    addExpense(expense) {
        const newExpense = {
            id: Date.now().toString(),
            date: expense.date,
            category: expense.category,
            amount: parseFloat(expense.amount),
            memo: expense.memo || ''
        };
        this.expenses.push(newExpense);
        this.saveExpenses();
        return newExpense;
    }

    // 支出を削除
    deleteExpense(id) {
        this.expenses = this.expenses.filter(expense => expense.id !== id);
        this.saveExpenses();
    }

    // すべての支出を取得
    getAllExpenses() {
        return this.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // 今月の支出を取得
    getCurrentMonthExpenses() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        return this.expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getFullYear() === currentYear &&
                expenseDate.getMonth() === currentMonth;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    // カテゴリ別に集計
    getCategorySummary(expenses) {
        const summary = {};

        expenses.forEach(expense => {
            if (!summary[expense.category]) {
                summary[expense.category] = 0;
            }
            summary[expense.category] += expense.amount;
        });

        return summary;
    }

    // 合計金額を計算
    getTotalAmount(expenses) {
        return expenses.reduce((total, expense) => total + expense.amount, 0);
    }
}

// UIを管理するクラス
class ExpenseUI {
    constructor(manager) {
        this.manager = manager;
        this.form = document.getElementById('expenseForm');
        this.expenseList = document.getElementById('expenseList');
        this.categorySummary = document.getElementById('categorySummary');
        this.totalAmount = document.getElementById('totalAmount');

        this.initializeEventListeners();
        this.setDefaultDate();
        this.render();
    }

    // イベントリスナーを初期化
    initializeEventListeners() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    // デフォルトの日付を今日に設定
    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
    }

    // フォーム送信を処理
    handleSubmit() {
        const expense = {
            date: document.getElementById('date').value,
            category: document.getElementById('category').value,
            amount: document.getElementById('amount').value,
            memo: document.getElementById('memo').value
        };

        this.manager.addExpense(expense);
        this.form.reset();
        this.setDefaultDate();
        this.render();
        this.showNotification('支出を記録しました！');
    }

    // 支出を削除
    deleteExpense(id) {
        if (confirm('この支出を削除しますか？')) {
            this.manager.deleteExpense(id);
            this.render();
            this.showNotification('支出を削除しました');
        }
    }

    // 画面全体を再描画
    render() {
        const expenses = this.manager.currentFilter === 'current'
            ? this.manager.getCurrentMonthExpenses()
            : this.manager.getAllExpenses();

        this.renderExpenseList(expenses);
        this.renderCategorySummary(expenses);
    }

    // 支出一覧を描画
    renderExpenseList(expenses) {
        if (expenses.length === 0) {
            this.expenseList.innerHTML = `
                <div class="empty-state">
                    <p>📝 まだ支出が記録されていません</p>
                </div>
            `;
            return;
        }

        this.expenseList.innerHTML = expenses.map(expense => `
            <div class="expense-item">
                <div class="expense-info">
                    <div class="expense-header">
                        <span class="expense-date">${this.formatDate(expense.date)}</span>
                        <span class="expense-category">${expense.category}</span>
                    </div>
                    ${expense.memo ? `<div class="expense-memo">${expense.memo}</div>` : ''}
                </div>
                <div class="expense-amount">¥${this.formatNumber(expense.amount)}</div>
                <div class="expense-actions">
                    <button class="btn btn-delete" onclick="ui.deleteExpense('${expense.id}')">
                        削除
                    </button>
                </div>
            </div>
        `).join('');
    }

    // カテゴリ別集計を描画
    renderCategorySummary(expenses) {
        const summary = this.manager.getCategorySummary(expenses);
        const total = this.manager.getTotalAmount(expenses);

        // カテゴリアイコンマップ
        const categoryIcons = {
            '食費': '🍽️',
            '交通費': '🚃',
            '娯楽費': '🎮',
            '日用品': '🛒',
            '医療費': '💊',
            '光熱費': '💡',
            'その他': '📝'
        };

        if (Object.keys(summary).length === 0) {
            this.categorySummary.innerHTML = `
                <div class="empty-state">
                    <p>データがありません</p>
                </div>
            `;
        } else {
            this.categorySummary.innerHTML = Object.entries(summary)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => `
                    <div class="category-item">
                        <div class="category-name">${categoryIcons[category] || ''} ${category}</div>
                        <div class="category-amount">¥${this.formatNumber(amount)}</div>
                    </div>
                `).join('');
        }

        this.totalAmount.textContent = `¥${this.formatNumber(total)}`;
    }

    // 日付をフォーマット
    formatDate(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    // 数値をフォーマット（カンマ区切り）
    formatNumber(num) {
        return num.toLocaleString('ja-JP');
    }

    // 通知を表示
    showNotification(message) {
        // シンプルなアラート（後でトーストに変更可能）
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }
}

// クラウド同期を管理するクラス
class CloudSync {
    constructor() {
        this.gasUrl = localStorage.getItem('gasUrl') || '';
        this.loadSavedUrl();
    }

    // 保存されたURLを入力フィールドに表示
    loadSavedUrl() {
        const urlInput = document.getElementById('gasUrl');
        if (urlInput && this.gasUrl) {
            urlInput.value = this.gasUrl;
        }
    }

    // GAS WebアプリのURLを設定
    setGasUrl(url) {
        this.gasUrl = url;
        localStorage.setItem('gasUrl', url);
    }

    // URLが設定されているか確認
    isConfigured() {
        return this.gasUrl && this.gasUrl.trim() !== '';
    }

    // 支出データをアップロード
    async uploadExpenses(expenses) {
        if (!this.isConfigured()) {
            throw new Error('GAS WebアプリURLが設定されていません');
        }

        const response = await fetch(this.gasUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'upload',
                data: expenses
            })
        });

        if (!response.ok) {
            throw new Error('アップロードに失敗しました');
        }

        return await response.json();
    }

    // 支出データをダウンロード
    async downloadExpenses() {
        if (!this.isConfigured()) {
            throw new Error('GAS WebアプリURLが設定されていません');
        }

        const response = await fetch(this.gasUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'download'
            })
        });

        if (!response.ok) {
            throw new Error('ダウンロードに失敗しました');
        }

        return await response.json();
    }

    // 支出データを同期（マージ）
    async syncExpenses(localExpenses) {
        if (!this.isConfigured()) {
            throw new Error('GAS WebアプリURLが設定されていません');
        }

        const response = await fetch(this.gasUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'sync',
                data: localExpenses
            })
        });

        if (!response.ok) {
            throw new Error('同期に失敗しました');
        }

        return await response.json();
    }
}

// グローバル関数（HTMLから呼び出すため）
function filterByMonth(filter) {
    expenseManager.currentFilter = filter;
    ui.render();
}

// GAS URLを保存
function saveGasUrl() {
    const url = document.getElementById('gasUrl').value.trim();
    if (!url) {
        showSyncStatus('URLを入力してください', 'error');
        return;
    }
    cloudSync.setGasUrl(url);
    showSyncStatus('URL保存完了 ✓', 'success');
}

// クラウドにアップロード
async function uploadToCloud() {
    try {
        showSyncStatus('アップロード中...', 'info');
        const expenses = expenseManager.getAllExpenses();
        const result = await cloudSync.uploadExpenses(expenses);

        if (result.success) {
            showSyncStatus(`✓ ${result.message}`, 'success');
        } else {
            showSyncStatus('アップロード失敗: ' + result.message, 'error');
        }
    } catch (error) {
        showSyncStatus('エラー: ' + error.message, 'error');
    }
}

// クラウドからダウンロード
async function downloadFromCloud() {
    try {
        showSyncStatus('ダウンロード中...', 'info');
        const result = await cloudSync.downloadExpenses();

        if (result.success) {
            // ローカルデータを上書き
            expenseManager.expenses = result.data;
            expenseManager.saveExpenses();
            ui.render();
            showSyncStatus(`✓ ${result.message}`, 'success');
        } else {
            showSyncStatus('ダウンロード失敗: ' + result.message, 'error');
        }
    } catch (error) {
        showSyncStatus('エラー: ' + error.message, 'error');
    }
}

// クラウドと同期
async function syncWithCloud() {
    try {
        showSyncStatus('同期中...', 'info');
        const localExpenses = expenseManager.getAllExpenses();
        const result = await cloudSync.syncExpenses(localExpenses);

        if (result.success) {
            // マージされたデータで更新
            expenseManager.expenses = result.data;
            expenseManager.saveExpenses();
            ui.render();
            showSyncStatus(`✓ ${result.message}`, 'success');
        } else {
            showSyncStatus('同期失敗: ' + result.message, 'error');
        }
    } catch (error) {
        showSyncStatus('エラー: ' + error.message, 'error');
    }
}

// 同期ステータスを表示
function showSyncStatus(message, type) {
    const status = document.getElementById('syncStatus');
    if (!status) return;

    status.textContent = message;
    status.className = `sync-status ${type}`;

    // 成功・エラーメッセージは3秒後に消す
    if (type !== 'info') {
        setTimeout(() => {
            status.textContent = '';
            status.className = 'sync-status';
        }, 3000);
    }
}

// グローバル関数（HTMLから呼び出すため）
function filterByMonth(filter) {
    expenseManager.currentFilter = filter;
    ui.render();
}

// アプリケーションの初期化
const expenseManager = new ExpenseManager();
const ui = new ExpenseUI(expenseManager);
const cloudSync = new CloudSync();

// アニメーション用のCSSを追加
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
