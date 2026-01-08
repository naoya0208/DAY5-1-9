/**
 * 出退勤管理アプリ バックエンド (Google Apps Script)
 * 仕様に基づき、打刻記録、休憩計算、LINE通知、課題完了報告を処理します。
 */

// ユーザー設定 (LINEの設定)
const LINE_ACCESS_TOKEN = 'YOZ7UftinQaO3OyBDaloYu4cXzhYtLzmqBzAGNvCIJRg7h+DoqsX0n6OXdfOFZ9vI7/+VIOKgdWLHJ6yBmeAi6kPqz4+FZ3vpHQTBEAQSHA81c9tQLH/8oP8UUyRpnHxvmJ0QlaAjZWiraJeO38tBgdB04t89/1O/w1cDnyilFU=';
const LINE_GROUP_ID = 'C5a5b36e27a78ed6cfbb74839a8a9d04e';

/**
 * 初回セットアップ用関数
 * スプシに必要なシートを作成し、ヘッダーを書き込みます。
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheets = [
    { name: '打刻記録', header: ['日付', '研修生ID', '氏名', '出勤時刻', '退勤時刻', '休憩時間', '勤務時間'] },
    { name: '課題完了記録', header: ['完了日時', '研修生ID', '氏名', 'アプリURL', '判定'] },
    { name: '研修生マスタ', header: ['研修生ID', '氏名', 'ステータス'] }
  ];

  sheets.forEach(s => {
    let sheet = ss.getSheetByName(s.name);
    if (!sheet) {
      sheet = ss.insertSheet(s.name);
      sheet.appendRow(s.header);
    }
  });
  
  SpreadsheetApp.getUi().alert('セットアップが完了しました！');
}

/**
 * Web App で POST リクエストを受け取る
 */
function doPost(e) {
  try {
    const contents = e.postData.contents;
    const data = JSON.parse(contents);
    const { type, traineeId, name, appUrl } = data;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    const dateStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd');
    const timeStr = Utilities.formatDate(now, 'JST', 'HH:mm');
    const dateTimeStr = Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm');

    let result = { status: 'success' };

    switch (type) {
      case 'clock-in':
        handleClockIn(ss, traineeId, name, dateStr, timeStr, dateTimeStr);
        break;
      case 'clock-out':
        handleClockOut(ss, traineeId, name, dateStr, timeStr);
        break;
      case 'break-start':
        handleBreak(ss, traineeId, name, dateStr, timeStr, 'start');
        break;
      case 'break-end':
        handleBreak(ss, traineeId, name, dateStr, timeStr, 'end');
        break;
      case 'assignment':
        handleAssignment(ss, traineeId, name, dateTimeStr, appUrl);
        break;
      default:
        throw new Error('不明な打刻種別です: ' + type);
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleClockIn(ss, traineeId, name, dateStr, timeStr, dateTimeStr) {
  const sheet = ss.getSheetByName('打刻記録');
  sheet.appendRow([dateStr, traineeId, name, timeStr, '', '', '']);
  sendLineMessage(`【出勤】\n${name}\n${dateTimeStr}`);
}

function handleClockOut(ss, traineeId, name, dateStr, timeStr) {
  const sheet = ss.getSheetByName('打刻記録');
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  
  for (let i = data.length - 1; i >= 1; i--) {
     let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    if (rowDate === dateStr && String(data[i][1]) === String(traineeId) && data[i][4] === '') {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    const rowData = data[rowIdx-1];
    const clockInTimeStr = rowData[3];
    let breakDuration = rowData[5] || '00:00';
    sheet.getRange(rowIdx, 5).setValue(timeStr);
    const workTime = calculateNetWorkTime(clockInTimeStr, timeStr, breakDuration);
    sheet.getRange(rowIdx, 7).setValue(workTime);
    sendLineMessage(`【退勤】\n${name}\n出勤：${clockInTimeStr}\n退勤：${timeStr}\n休憩：${breakDuration}\n勤務時間：${workTime}`);
  } else {
    throw new Error('当日の出勤記録が見つかりません');
  }
}

function handleBreak(ss, traineeId, name, dateStr, timeStr, phase) {
  const sheet = ss.getSheetByName('打刻記録');
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = data.length - 1; i >= 1; i--) {
    let rowDate = data[i][0];
    if (rowDate instanceof Date) rowDate = Utilities.formatDate(rowDate, 'JST', 'yyyy/MM/dd');
    if (rowDate === dateStr && String(data[i][1]) === String(traineeId) && data[i][4] === '') {
      rowIdx = i + 1;
      break;
    }
  }

  if (rowIdx !== -1) {
    if (phase === 'start') {
      sheet.getRange(rowIdx, 6).setValue('@' + timeStr);
    } else {
      const currentBreakVal = sheet.getRange(rowIdx, 6).getValue();
      if (typeof currentBreakVal === 'string' && currentBreakVal.startsWith('@')) {
        const bStartStr = currentBreakVal.substring(1);
        const diffMin = getDiffInMinutes(bStartStr, timeStr);
        sheet.getRange(rowIdx, 6).setValue(formatMinutesToHHMM(diffMin));
      }
    }
  }
}

function handleAssignment(ss, traineeId, name, dateTimeStr, appUrl) {
  const sheet = ss.getSheetByName('課題完了記録');
  sheet.appendRow([dateTimeStr, traineeId, name, appUrl, '未確認']);
  sendLineMessage(`【🎉課題完了報告🎉】\n研修生：${name}（${traineeId}）\n完了：${dateTimeStr}\nアプリURL: ${appUrl}\n確認をお願いします！`);
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
  } catch (e) { console.error(e); }
}

function calculateNetWorkTime(startStr, endStr, breakDurStr) {
  const startMin = timeToMinutes(startStr);
  const endMin = timeToMinutes(endStr);
  let totalMin = endMin - startMin;
  if (totalMin < 0) totalMin += 24 * 60;
  const breakMin = timeToMinutes(String(breakDurStr).replace('@', ''));
  return formatMinutesToHHMM(totalMin - breakMin);
}

function getDiffInMinutes(startStr, endStr) {
  const s = timeToMinutes(startStr);
  const e = timeToMinutes(endStr);
  let d = e - s;
  if (d < 0) d += 24 * 60;
  return d;
}

function timeToMinutes(tStr) {
  if (!tStr || typeof tStr !== 'string' || !tStr.includes(':')) return 0;
  const parts = tStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatMinutesToHHMM(min) {
  const mm = Math.max(0, min);
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
