/**
 * 支出管理アプリ - Google Apps Script バックエンド
 * 
 * このスクリプトは、Webアプリからの支出データを
 * Google Spreadsheetsに保存・取得するためのAPIを提供します。
 */

// シート名の定数
const SHEET_NAME = 'Expenses';

/**
 * Webアプリとしてデプロイされた際のGETリクエストハンドラ
 * 動作確認用のエンドポイント
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: '支出管理アプリ GAS API is running',
    version: '1.0.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Webアプリとしてデプロイされた際のPOSTリクエストハンドラ
 * フロントエンドからのリクエストを処理
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 同時実行による不整合を防ぐためロック取得（最大30秒待機）
    lock.waitLock(30000);
    
    // 内容が空でないか確認
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('リクエストデータが空です');
    }

    // リクエストボディをパース
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    console.log('Action received:', action); // GASログに出力
    
    // シートを取得または作成
    const sheet = getOrCreateSheet();
    
    // アクションに応じて処理を分岐
    let result;
    switch (action) {
      case 'upload':
        result = uploadExpenses(sheet, params.data);
        break;
      case 'download':
        result = downloadExpenses(sheet);
        break;
      case 'sync':
        result = syncExpenses(sheet, params.data);
        break;
      default:
        throw new Error('不明なアクション: ' + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error occurred:', error.message); // GASログに出力
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.message,
      data: []
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    lock.releaseLock();
  }
}

/**
 * Expensesシートを取得、存在しない場合は作成
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    // シートが存在しない場合は新規作成
    sheet = ss.insertSheet(SHEET_NAME);
    
    // ヘッダー行を設定
    const headers = ['ID', '日付', 'カテゴリ', '金額', 'メモ'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // ヘッダー行のスタイル設定
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#667eea')
      .setFontColor('#ffffff');
    
    // 列幅の自動調整
    sheet.autoResizeColumns(1, headers.length);
  }
  
  return sheet;
}

/**
 * 支出データをアップロード（上書き）
 */
function uploadExpenses(sheet, expenses) {
  try {
    // 既存のデータをクリア（ヘッダー行は残す）
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 5).clear();
    }
    
    // 新しいデータを書き込み
    if (expenses && expenses.length > 0) {
      const rows = expenses.map(expense => [
        expense.id,
        expense.date,
        expense.category,
        expense.amount,
        expense.memo || ''
      ]);
      
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    }
    
    // 変更を即座に反映
    SpreadsheetApp.flush();
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return {
      success: true,
      message: `${expenses.length}件のデータをアップロードしました`,
      debug: {
        spreadsheetName: ss.getName(),
        sheetName: sheet.getName(),
        lastRow: sheet.getLastRow()
      },
      data: expenses
    };
    
  } catch (error) {
    throw new Error('Upload failed: ' + error.message);
  }
}

/**
 * 支出データをダウンロード
 */
function downloadExpenses(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    
    // データが存在しない場合
    if (lastRow <= 1) {
      return {
        success: true,
        message: 'データがありません',
        data: []
      };
    }
    
    // データを取得
    const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    
    // オブジェクトの配列に変換
    const expenses = values.map(row => ({
      id: String(row[0]),
      date: formatDate(row[1]),
      category: row[2],
      amount: Number(row[3]),
      memo: row[4] || ''
    }));
    
    return {
      success: true,
      message: `${expenses.length}件のデータをダウンロードしました`,
      data: expenses
    };
    
  } catch (error) {
    throw new Error('Download failed: ' + error.message);
  }
}

/**
 * 支出データを同期（マージ）
 * ローカルとクラウドのデータをIDベースでマージ
 */
function syncExpenses(sheet, localExpenses) {
  try {
    // クラウドのデータを取得
    const cloudResult = downloadExpenses(sheet);
    const cloudExpenses = cloudResult.data;
    
    // IDをキーとしたマップを作成
    const expenseMap = new Map();
    
    // クラウドのデータを追加
    cloudExpenses.forEach(expense => {
      expenseMap.set(expense.id, expense);
    });
    
    // ローカルのデータを追加（既存のものは上書き）
    localExpenses.forEach(expense => {
      expenseMap.set(expense.id, expense);
    });
    
    // マージされたデータを配列に変換
    const mergedExpenses = Array.from(expenseMap.values());
    
    // 日付でソート（降順）
    mergedExpenses.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });
    
    // マージされたデータをアップロード
    uploadExpenses(sheet, mergedExpenses);
    
    return {
      success: true,
      message: `同期完了: ${mergedExpenses.length}件`,
      data: mergedExpenses
    };
    
  } catch (error) {
    throw new Error('Sync failed: ' + error.message);
  }
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDate(date) {
  if (typeof date === 'string') {
    return date;
  }
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * テスト用関数: サンプルデータを作成
 */
function createSampleData() {
  const sheet = getOrCreateSheet();
  
  const sampleExpenses = [
    {
      id: '1704182400000',
      date: '2026-01-02',
      category: '食費',
      amount: 1200,
      memo: 'ランチ代'
    },
    {
      id: '1704096000000',
      date: '2026-01-01',
      category: '交通費',
      amount: 500,
      memo: '電車代'
    },
    {
      id: '1704009600000',
      date: '2025-12-31',
      category: '娯楽費',
      amount: 3000,
      memo: '映画鑑賞'
    }
  ];
  
  uploadExpenses(sheet, sampleExpenses);
  Logger.log('サンプルデータを作成しました');
}
