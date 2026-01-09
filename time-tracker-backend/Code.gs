const SPREADSHEET_ID = '1MOzxb7RKuxVMHQI7djPIu2iw6Hf3GLeg71_9oQi6FS8';
const LINE_ACCESS_TOKEN = 'YOZ7UftinQaO3OyBDaloYu4cXzhYtLzmqBzAGNvCIJRg7h+DoqsX0n6OXdfOFZ9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UUyRpnHxvmJ0QlaAjZWiraJeO38tBgdB04t89/1O/w1cDnyilFU=';
const LINE_GROUP_ID = 'C5a5b36e27a78ed6cfbb74839a8a9d04e';

/**
 * シート取得（空白対策）
 */
function getSheetSafe(name) {
  if (!name) return null;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const target = String(name).trim();
  for (let s of ss.getSheets()) {
    if (s.getName().trim() === target) return s;
  }
  return null;
}

/**
 * ログ記録
 */
function logToSheet(level, message, data = '') {
  try {
    const sheet = getSheetSafe('設定・ログ');
    if (sheet) {
      sheet.appendRow([new Date(), level, message, typeof data === 'object' ? JSON.stringify(data) : String(data)]);
    }
  } catch (e) {}
}

/**
 * ✅ 診断用ツール：ブラウザで開くと最新10件のログと現在の状態を表示
 */
function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = getSheetSafe('設定・ログ');
  let recentLogs = [];
  
  if (logSheet) {
    const lastRow = logSheet.getLastRow();
    if (lastRow > 1) {
      recentLogs = logSheet.getRange(Math.max(2, lastRow - 9), 1, Math.min(10, lastRow - 1), 4).getDisplayValues();
    }
  }

  const status = {
    message: "✅ GAS接続成功！",
    sheets: ss.getSheets().map(s => s.getName()),
    time: Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'),
    recentLogs: recentLogs.map(row => ({ time: row[0], level: row[1], msg: row[2], data: row[3] }))
  };

  return ContentService.createTextOutput(JSON.stringify(status, null, 2)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * メイン：POST受信
 */
function doPost(e) {
  try {
    const contents = (e && e.postData) ? e.postData.contents : null;
    if (!contents) throw new Error("データが届いていません");
    
    logToSheet('INFO', '受信開始', contents);
    const data = JSON.parse(contents);
    const { type, traineeId, name, appUrl } = data;
    
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd');
    const timeStr = Utilities.formatDate(now, 'JST', 'HH:mm');
    const dateTimeStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm');

    switch (type) {
      case 'clock-in':
        handleClockIn(traineeId, name, dateStr, timeStr, dateTimeStr);
        break;
      case 'clock-out':
        handleClockOut(traineeId, name, dateStr, timeStr);
        break;
      case 'break-start':
      case 'break-end':
        handleBreak(traineeId, name, dateStr, timeStr, type === 'break-start' ? 'start' : 'end');
        break;
      case 'assignment':
        handleAssignment(traineeId, name, dateTimeStr, appUrl);
        break;
      default:
        throw new Error('不明な種別: ' + type);
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logToSheet('ERROR', 'doPostエラー', err.toString());
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 共通：行検索（見た目 + 正規化で最強の検索）
 */
function findRowIndex(sheet, dateStr, traineeId) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  const targetId = String(traineeId).trim();
  const targetDateNorm = normalizeDate(dateStr);
  
  logToSheet('DEBUG', '行検索開始', {targetDate: dateStr, targetId: targetId, normDate: targetDateNorm});

  for (let i = displayValues.length - 1; i >= 1; i--) {
    // 1. 表示文字列での比較
    const rowDateStr = String(displayValues[i][0]).trim();
    const rowId = String(displayValues[i][1]).trim();
    const rowClockOut = String(displayValues[i][4]).trim();

    // 2. 日付オブジェクトからの変換比較
    let rowDateObjStr = "";
    if (values[i][0] instanceof Date) {
      rowDateObjStr = Utilities.formatDate(values[i][0], 'JST', 'yyyy/MM/dd');
    }

    // 日付の正規化比較
    const rowDateNorm = normalizeDate(rowDateStr);
    const rowDateObjNorm = normalizeDate(rowDateObjStr);
    
    // 判定ロジック
    const isDateMatch = (rowDateNorm === targetDateNorm) || (rowDateObjNorm === targetDateNorm);
    const isIdMatch = (rowId === targetId);

    // ログに判定詳細を残す
    if (i === displayValues.length - 1) {
       logToSheet('DEBUG', '最新行チェック', {
         row: i + 1,
         rowDate: rowDateStr,
         isDateMatch: isDateMatch,
         rowId: rowId,
         isIdMatch: isIdMatch,
         out: rowClockOut
       });
    }

    if (isDateMatch && isIdMatch && rowClockOut === "") {
      logToSheet('DEBUG', '行一致成功', {row: i + 1});
      return i + 1;
    }
  }
  
  logToSheet('WARN', '行が見つかりませんでした', {date: dateStr, id: targetId});
  return -1;
}

/**
 * 日付正規化 (2026/01/09 -> 2026/1/9)
 */
function normalizeDate(str) {
  if (!str) return "";
  const s = String(str).trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    return Number(parts[0]) + '/' + Number(parts[1]) + '/' + Number(parts[2]);
  }
  return s; // スラッシュ区切りでなければそのまま
}

/**
 * 1. 出勤
 */
function handleClockIn(traineeId, name, dateStr, timeStr, dateTimeStr) {
  const sheet = getSheetSafe('打刻記録');
  if (!sheet) throw new Error('打刻記録シートが見つかりません');
  
  sheet.appendRow([dateStr, traineeId, name, timeStr, '', '', '']);
  updateMasterSheet(traineeId, name, '勤務中');
  sendLineMessage(`【出勤】\n${name}\n${dateTimeStr}`);
  logToSheet('INFO', '出勤完了', name);
}

/**
 * 2. 退勤
 */
function handleClockOut(traineeId, name, dateStr, timeStr) {
  const sheet = getSheetSafe('打刻記録');
  const rowIdx = findRowIndex(sheet, dateStr, traineeId);

  if (rowIdx !== -1) {
    const range = sheet.getRange(rowIdx, 1, 1, 7);
    const displayData = range.getDisplayValues()[0];
    const clockInTime = displayData[3];
    const breakDuration = displayData[5] || '00:00';
    
    // 計算
    const workTime = calculateNetWorkTime(clockInTime, timeStr, breakDuration);
    
    sheet.getRange(rowIdx, 5).setValue(timeStr);
    sheet.getRange(rowIdx, 7).setValue(workTime);
    
    updateMasterSheet(traineeId, name, '未出勤');
    sendLineMessage(`【退勤】\n${name}\n出勤：${clockInTime}\n退勤：${timeStr}\n休憩：${breakDuration}\n勤務時間：${workTime}`);
  } else {
    throw new Error('退勤対象の出勤記録（退勤未記入の行）が見つかりません');
  }
}

/**
 * 3. 休憩
 */
function handleBreak(traineeId, name, dateStr, timeStr, phase) {
  const sheet = getSheetSafe('打刻記録');
  const rowIdx = findRowIndex(sheet, dateStr, traineeId);

  if (rowIdx !== -1) {
    if (phase === 'start') {
      sheet.getRange(rowIdx, 6).setValue('@' + timeStr);
      updateMasterSheet(traineeId, name, '休憩中');
      logToSheet('INFO', '休憩開始', name);
    } else {
      const val = String(sheet.getRange(rowIdx, 6).getValue());
      if (val.startsWith('@')) {
        const diff = getDiffInMinutes(val.substring(1), timeStr);
        sheet.getRange(rowIdx, 6).setValue(formatMinutesToHHMM(diff));
      }
      updateMasterSheet(traineeId, name, '勤務中');
      logToSheet('INFO', '休憩終了', name);
    }
  }
}

/**
 * 4. 課題完了 (確実に反映させるためにロジックを整理)
 */
function handleAssignment(traineeId, name, dateTimeStr, appUrl) {
  const sheet = getSheetSafe('課題完了記録');
  if (!sheet) {
    logToSheet('ERROR', '課題完了記録シートが見つかりません');
    throw new Error('課題完了記録シートが見つかりません');
  }
  
  // 確実に追記
  sheet.appendRow([dateTimeStr, traineeId, name, appUrl, '未確認']);
  
  // LINE通知
  sendLineMessage(`【🎉課題完了報告🎉】\n研修生：${name}\n完了：${dateTimeStr}\nURL: ${appUrl}`);
  
  logToSheet('INFO', '課題完了報告を記録しました', {name: name, url: appUrl});
}

/**
 * 共通：マスタ更新 (他シートが動かない原因をここで解消)
 */
function updateMasterSheet(traineeId, name, status) {
  const sheet = getSheetSafe('研修生マスタ');
  if (!sheet) {
    logToSheet('ERROR', '研修生マスタのシートが見つかりません');
    return;
  }

  const data = sheet.getDataRange().getDisplayValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;

  // 1行目はヘッダーなので2行目から探索
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][0]).trim();
    if (rowId === targetId) {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    // 既存ユーザーの更新
    sheet.getRange(rowIdx, 2).setValue(name);
    sheet.getRange(rowIdx, 3).setValue(status);
    logToSheet('INFO', 'マスタ更新成功', {id: targetId, status: status});
  } else {
    // 新規ユーザーの追加
    sheet.appendRow([targetId, name, status]);
    logToSheet('INFO', 'マスタ新規追加成功', {id: targetId, name: name, status: status});
  }
}

/**
 * ユーティリティ
 */
function calculateNetWorkTime(start, end, breakStr) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  const b = timeToMinutes(String(breakStr).replace('@', ''));
  return formatMinutesToHHMM(diff - b);
}

function getDiffInMinutes(s, e) {
  let d = timeToMinutes(e) - timeToMinutes(s);
  if (d < 0) d += 24 * 60;
  return d;
}

function timeToMinutes(str) {
  const t = String(str);
  if (!t.includes(':')) return 0;
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function formatMinutesToHHMM(m) {
  const mm = Math.max(0, m);
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function sendLineMessage(text) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
      payload: JSON.stringify({ to: LINE_GROUP_ID, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
  } catch (e) { logToSheet('ERROR', 'LINE送信失敗', e.toString()); }
}
