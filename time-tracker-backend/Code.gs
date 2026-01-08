const SPREADSHEET_ID = '1MOzxb7RKuxVMHQI7djPIu2iw6Hf3GLeg71_9oQi6FS8';
const LINE_ACCESS_TOKEN = 'YOZ7UftinQaO3OyBDaloYu4cXzhYtLzmqBzAGNvCIJRg7h+DoqsX0n6OXdfOFZ9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UUyRpnHxvmJ0QlaAjZWiraJeO38tBgdB04t89/1O/w1cDnyilFU=';
const LINE_GROUP_ID = 'C5a5b36e27a78ed6cfbb74839a8a9d04e';

/**
 * 共通：シート取得（名前の揺れに対応）
 */
function getSheetSafe(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const target = name.trim();
  for (let s of sheets) {
    if (s.getName().trim() === target) return s;
  }
  return null;
}

/**
 * ログ記録（独立した関数として強化）
 */
function logToSheet(level, message, data = '') {
  try {
    const sheet = getSheetSafe('設定・ログ');
    if (sheet) {
      sheet.appendRow([new Date(), level, message, typeof data === 'object' ? JSON.stringify(data) : String(data)]);
    }
  } catch (e) {
    console.error('Log failed: ' + e.toString());
  }
}

/**
 * メイン：POST受信
 */
function doPost(e) {
  try {
    const contents = (e && e.postData) ? e.postData.contents : "No Data";
    logToSheet('INFO', '受信開始', contents);

    const data = JSON.parse(contents);
    const { type, traineeId, name, appUrl } = data;
    
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd');
    const timeStr = Utilities.formatDate(now, 'JST', 'HH:mm');
    const dateTimeStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm');

    let result = { status: 'success' };

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
        throw new Error('Unsupported type: ' + type);
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logToSheet('ERROR', 'doPost致命的エラー', err.toString());
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 1. 出勤
 */
function handleClockIn(traineeId, name, dateStr, timeStr, dateTimeStr) {
  const sheet = getSheetSafe('打刻記録');
  if (!sheet) throw new Error('打刻記録シートが見つかりません');
  
  sheet.appendRow([dateStr, traineeId, name, timeStr, '', '', '']); // 出勤、退勤空、休憩空、勤務空
  updateMasterSheet(traineeId, name, '勤務中');
  sendLineMessage(`【出勤】\n${name}\n${dateTimeStr}`);
  logToSheet('INFO', '出勤完了', name);
}

/**
 * 2. 退勤
 */
function handleClockOut(traineeId, name, dateStr, timeStr) {
  const sheet = getSheetSafe('打刻記録');
  const data = sheet.getDataRange().getValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;

  // 最後の未退勤行を探す
  for (let i = data.length - 1; i >= 1; i--) {
    let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    const rowId = String(data[i][1]).trim();
    const rowClockOut = String(data[i][4]).trim();

    if (rowDate === dateStr && rowId === targetId && rowClockOut === '') {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    const clockInTime = data[rowIdx-1][3];
    const breakDuration = data[rowIdx-1][5] || '00:00';
    const workTime = calculateNetWorkTime(clockInTime, timeStr, breakDuration);
    
    sheet.getRange(rowIdx, 5).setValue(timeStr); // 退勤
    sheet.getRange(rowIdx, 7).setValue(workTime); // 勤務時間
    
    updateMasterSheet(traineeId, name, '未出勤');
    sendLineMessage(`【退勤】\n${name}\n出勤：${clockInTime}\n退勤：${timeStr}\n休憩：${breakDuration}\n勤務時間：${workTime}`);
    logToSheet('INFO', '退勤完了', {name: name, workTime: workTime});
  } else {
    logToSheet('WARN', '退勤対象行なし', {id: targetId, date: dateStr});
    throw new Error('本日の出勤記録未完了の行が見つかりません');
  }
}

/**
 * 3. 休憩
 */
function handleBreak(traineeId, name, dateStr, timeStr, phase) {
  const sheet = getSheetSafe('打刻記録');
  const data = sheet.getDataRange().getValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;

  for (let i = data.length - 1; i >= 1; i--) {
    let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    const rowId = String(data[i][1]).trim();
    if (rowDate === dateStr && rowId === targetId && String(data[i][4]).trim() === '') {
      rowIdx = i + 1;
      break;
    }
  }

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
  } else {
    logToSheet('WARN', '休憩対象行なし', name);
  }
}

/**
 * 4. 課題完了
 */
function handleAssignment(traineeId, name, dateTimeStr, appUrl) {
  const sheet = getSheetSafe('課題完了記録');
  if (!sheet) throw new Error('課題完了記録シートが見つかりません');
  
  sheet.appendRow([dateTimeStr, traineeId, name, appUrl, '未確認']);
  sendLineMessage(`【🎉課題完了報告🎉】\n研修生：${name}\n完了：${dateTimeStr}\nURL: ${appUrl}`);
  logToSheet('INFO', '課題完了報告', name);
}

/**
 * 共通：マスタ更新
 */
function updateMasterSheet(traineeId, name, status) {
  const sheet = getSheetSafe('研修生マスタ');
  if (!sheet) {
    logToSheet('ERROR', '研修生マスタが見つかりません');
    return;
  }
  const data = sheet.getDataRange().getValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === targetId) { rowIdx = i + 1; break; }
  }

  if (rowIdx !== -1) {
    sheet.getRange(rowIdx, 2).setValue(name);
    sheet.getRange(rowIdx, 3).setValue(status);
  } else {
    sheet.appendRow([traineeId, name, status]);
  }
  logToSheet('INFO', 'マスタ更新', {id: targetId, status: status});
}

/**
 * ユーティリティ：時間計算
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
  if (!str || !String(str).includes(':')) return 0;
  const p = String(str).split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function formatMinutesToHHMM(m) {
  const mm = Math.max(0, m);
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function sendLineMessage(text) {
  const url = 'https://api.line.me/v2/bot/message/push';
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
      payload: JSON.stringify({ to: LINE_GROUP_ID, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
  } catch (e) { logToSheet('ERROR', 'LINE送信失敗', e.toString()); }
}
