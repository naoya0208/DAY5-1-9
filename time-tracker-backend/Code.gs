const SPREADSHEET_ID = '1MOzxb7RKuxVMHQI7djPIu2iw6Hf3GLeg71_9oQi6FS8';
const LINE_ACCESS_TOKEN = 'YOZ7UftinQaO3OyBDaloYu4cXzhYtLzmqBzAGNvCIJRg7h+DoqsX0n6OXdfOFZ9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UU_z9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UUyRpnHxvmJ0QlaAjZWiraJeO38tBgdB04t89/1O/w1cDnyilFU='; // トークンなどは既存のまま
const LINE_GROUP_ID = 'C5a5b36e27a78ed6cfbb74839a8a9d04e';

/**
 * スプレッドシートを確実に取得
 */
function getSS() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * シート名を柔軟に検索（空白などを許容）
 */
function getSheetSafe(ss, name) {
  const sheets = ss.getSheets();
  const target = name.trim();
  for (let s of sheets) {
    if (s.getName().trim() === target) return s;
  }
  return null;
}

/**
 * 診断用：ブラウザでURLを開いたときに動作確認ができる
 */
function doGet() {
  const ss = getSS();
  const sheets = ss.getSheets().map(s => s.getName());
  return ContentService.createTextOutput("✅ GAS接続成功！\n\n見つかったシート:\n- " + sheets.join("\n- "))
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * セットアップ
 */
function setupSheet() {
  const ss = getSS();
  const sheets = [
    { name: '打刻記録', header: ['日付', '研修生ID', '氏名', '出勤時刻', '退勤時刻', '休憩時間', '勤務時間'] },
    { name: '課題完了記録', header: ['完了日時', '研修生ID', '氏名', 'アプリURL', '判定'] },
    { name: '研修生マスタ', header: ['研修生ID', '氏名', 'ステータス'] },
    { name: '設定・ログ', header: ['日時', 'レベル', 'メッセージ', '詳細データ'] }
  ];

  sheets.forEach(s => {
    let sheet = getSheetSafe(ss, s.name);
    if (!sheet) {
      sheet = ss.insertSheet(s.name);
      sheet.appendRow(s.header);
    }
  });
  SpreadsheetApp.getUi().alert('セットアップ完了！ログシートを確認してください。');
}

function logToSheet(level, message, data = '') {
  try {
    const ss = getSS();
    const sheet = getSheetSafe(ss, '設定・ログ');
    if (sheet) {
      sheet.appendRow([new Date(), level, message, typeof data === 'object' ? JSON.stringify(data) : data]);
    }
  } catch (e) {}
}

/**
 * メイン処理
 */
function doPost(e) {
  try {
    const contents = (e && e.postData) ? e.postData.contents : "No Data";
    logToSheet('INFO', '受信開始', contents);

    const data = JSON.parse(contents);
    const { type, traineeId, name, appUrl } = data;
    
    const ss = getSS();
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd');
    const timeStr = Utilities.formatDate(now, 'JST', 'HH:mm');
    const dateTimeStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm');

    switch (type) {
      case 'clock-in':
        handleClockIn(ss, traineeId, name, dateStr, timeStr, dateTimeStr);
        break;
      case 'clock-out':
        handleClockOut(ss, traineeId, name, dateStr, timeStr);
        break;
      case 'break-start':
      case 'break-end':
        handleBreak(ss, traineeId, name, dateStr, timeStr, type === 'break-start' ? 'start' : 'end');
        break;
      case 'assignment':
        handleAssignment(ss, traineeId, name, dateTimeStr, appUrl);
        break;
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    logToSheet('ERROR', '致命的エラー', err.toString());
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleClockIn(ss, traineeId, name, dateStr, timeStr, dateTimeStr) {
  const sheet = getSheetSafe(ss, '打刻記録');
  if (!sheet) throw new Error('「打刻記録」シートが見つかりません');
  
  sheet.appendRow([dateStr, traineeId, name, timeStr, '', '', '']);
  updateMasterSheet(ss, traineeId, name, '勤務中');
  sendLineMessage(`【出勤】\n${name}\n${dateTimeStr}`);
}

function handleClockOut(ss, traineeId, name, dateStr, timeStr) {
  const sheet = getSheetSafe(ss, '打刻記録');
  if (!sheet) throw new Error('「打刻記録」シートが見つかりません');
  
  const data = sheet.getDataRange().getValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;
  
  for (let i = data.length - 1; i >= 1; i--) {
    let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    const rowId = String(data[i][1]).trim();
    if (rowDate === dateStr && rowId === targetId && data[i][4] === '') {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    const clockInTime = data[rowIdx-1][3];
    const breakTime = data[rowIdx-1][5] || '00:00';
    const workTime = calculateNetWorkTime(clockInTime, timeStr, breakTime);
    
    sheet.getRange(rowIdx, 5).setValue(timeStr);
    sheet.getRange(rowIdx, 7).setValue(workTime);
    
    updateMasterSheet(ss, traineeId, name, '未出勤');
    sendLineMessage(`【退勤】\n${name}\n出勤：${clockInTime}\n退勤：${timeStr}\n休憩：${breakTime}\n勤務時間：${workTime}`);
  } else {
    throw new Error('当日の出勤記録未完了の行が見つかりません');
  }
}

function handleBreak(ss, traineeId, name, dateStr, timeStr, phase) {
  const sheet = getSheetSafe(ss, '打刻記録');
  const data = sheet.getDataRange().getValues();
  const targetId = String(traineeId).trim();
  let rowIdx = -1;

  for (let i = data.length - 1; i >= 1; i--) {
    let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    if (rowDate === dateStr && String(data[i][1]).trim() === targetId && data[i][4] === '') {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    if (phase === 'start') {
      sheet.getRange(rowIdx, 6).setValue('@' + timeStr);
      updateMasterSheet(ss, traineeId, name, '休憩中');
    } else {
      const val = sheet.getRange(rowIdx, 6).getValue();
      if (typeof val === 'string' && val.startsWith('@')) {
        const diff = getDiffInMinutes(val.substring(1), timeStr);
        sheet.getRange(rowIdx, 6).setValue(formatMinutesToHHMM(diff));
      }
      updateMasterSheet(ss, traineeId, name, '勤務中');
    }
  }
}

function updateMasterSheet(ss, traineeId, name, status) {
  const sheet = getSheetSafe(ss, '研修生マスタ');
  if (!sheet) return;
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
  logToSheet('INFO', 'マスタ更新完了', {id: traineeId, status: status});
}

function handleAssignment(ss, traineeId, name, dateTimeStr, appUrl) {
  const sheet = getSheetSafe(ss, '課題完了記録');
  sheet.appendRow([dateTimeStr, traineeId, name, appUrl, '未確認']);
  sendLineMessage(`【🎉課題完了報告🎉】\n研修生：${name}\n完了：${dateTimeStr}\nURL: ${appUrl}`);
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
  if (!str || !str.includes(':')) return 0;
  const p = str.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function formatMinutesToHHMM(m) {
  const mm = Math.max(0, m);
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}
