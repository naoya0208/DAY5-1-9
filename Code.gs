// Code.gs

/**
 * スプレッドシート起動時にカスタムメニューを追加
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📄 ドキュメント処理')
    .addItem('PDF送信', 'sendPdfWithSummary')
    .addSeparator()
    .addItem('5分間隔実行開始', 'startAutoExecution')
    .addItem('自動実行停止', 'stopAutoExecution')
    .addToUi();
}

/**
 * URLからドキュメントIDを抽出
 * @param {string} url - GoogleドキュメントのURL
 * @return {string} - 抽出されたドキュメントID
 */
function extractDocIdFromUrl(url) {
  if (!url || url.trim() === '') {
    throw new Error('URLが入力されていません');
  }
  
  // URLからドキュメントIDを抽出
  // パターン: https://docs.google.com/document/d/{ID}/edit...
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  
  if (match && match[1]) {
    return match[1];
  } else {
    throw new Error('有効なGoogleドキュメントのURLではありません');
  }
}

/**
 * メイン処理：ドキュメントをPDF化して要約付きメール送信
 */
function sendPdfWithSummary() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startTime = new Date();
  
  try {
    // A1セルからURLを取得
    const docUrl = sheet.getRange('A1').getValue();
    
    if (!docUrl || docUrl.trim() === '') {
      throw new Error('A1セルにドキュメントURLが入力されていません');
    }
    
    // URLからドキュメントIDを抽出
    const docId = extractDocIdFromUrl(docUrl);
    
    // A2セルに抽出したドキュメントIDを表示
    sheet.getRange('A2').setValue(docId);
    
    // スクリプトプロパティから設定を取得
    const props = PropertiesService.getScriptProperties();
    const mailTo = props.getProperty('MAIL_TO');
    const mailSubject = props.getProperty('MAIL_SUBJECT');
    const geminiApiKey = props.getProperty('GEMINI_API_KEY');
    
    if (!mailTo || !mailSubject || !geminiApiKey) {
      throw new Error('スクリプトプロパティが正しく設定されていません');
    }
    
    // 1. ドキュメント内容を取得
    const doc = DocumentApp.openById(docId);
    const docText = doc.getBody().getText();
    const docTitle = doc.getName();
    
    // 2. Gemini APIで要約生成
    const summary = generateSummaryWithGemini(docText, geminiApiKey);
    
    // 3. Drive API v3でPDF変換
    const pdfBlob = convertDocToPdf(docId, docTitle);
    
    // 4. Gmail APIでメール送信
    sendEmailWithPdf(mailTo, mailSubject, summary, pdfBlob, docTitle);
    
    // 5. 実行完了ログをスプレッドシートに記録
    const endTime = new Date();
    sheet.getRange('B2').setValue('実行完了');
    sheet.getRange('C2').setValue(Utilities.formatDate(endTime, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'));
    
    SpreadsheetApp.getUi().alert('✅ PDF送信が完了しました！');
    
  } catch (error) {
    // エラー処理
    sheet.getRange('B2').setValue('エラー: ' + error.message);
    sheet.getRange('C2').setValue(Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss'));
    
    SpreadsheetApp.getUi().alert('❌ エラーが発生しました：\n' + error.message);
    Logger.log('エラー詳細: ' + error);
  }
}

/**
 * Gemini APIを使ってテキストを要約（リトライ機能付き）
 */
function generateSummaryWithGemini(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [{
        text: `以下の文書を300文字程度で要約してください：\n\n${text}`
      }]
    }]
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  // リトライロジック（最大3回試行）
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      // レスポンスコードをログに記録
      Logger.log(`API Response Code (試行 ${attempt}/${maxRetries}): ${responseCode}`);
      
      // 429エラー（レート制限）の場合はリトライ
      if (responseCode === 429) {
        const waitTime = attempt * 5; // 5秒、10秒、15秒と増加
        Logger.log(`レート制限エラー。${waitTime}秒待機してリトライします...`);
        Utilities.sleep(waitTime * 1000);
        lastError = new Error(`レート制限エラー（試行 ${attempt}/${maxRetries}）`);
        continue; // 次の試行へ
      }
      
      // その他の200以外のエラー
      if (responseCode !== 200) {
        throw new Error(`Gemini API エラー (${responseCode}): ${responseText}`);
      }
      
      const json = JSON.parse(responseText);
      
      // エラーレスポンスをチェック
      if (json.error) {
        throw new Error(`Gemini API エラー: ${json.error.message || JSON.stringify(json.error)}`);
      }
      
      // コンテンツフィルタリングをチェック
      if (json.candidates && json.candidates[0]) {
        const candidate = json.candidates[0];
        
        // finishReasonをチェック
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          throw new Error(`コンテンツが生成できませんでした。理由: ${candidate.finishReason}`);
        }
        
        // 正常なレスポンス
        if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
          Logger.log(`要約生成成功（試行 ${attempt}/${maxRetries}）`);
          return candidate.content.parts[0].text;
        }
      }
      
      // 予期しないレスポンス形式
      throw new Error('Gemini APIからの要約生成に失敗しました。レスポンス: ' + responseText.substring(0, 200));
      
    } catch (error) {
      // エラーの詳細をログに記録
      Logger.log(`Gemini API エラー詳細 (試行 ${attempt}/${maxRetries}): ${error}`);
      lastError = error;
      
      // 最後の試行でない場合は少し待機
      if (attempt < maxRetries) {
        Utilities.sleep(2000); // 2秒待機
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  throw new Error(`要約生成に失敗しました（${maxRetries}回試行）: ${lastError.message}`);
}

/**
 * Drive API v3を使ってドキュメントをPDFに変換
 */
function convertDocToPdf(docId, docTitle) {
  const url = `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=application/pdf`;
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() === 200) {
    return response.getBlob().setName(docTitle + '.pdf');
  } else {
    throw new Error('PDF変換に失敗しました: ' + response.getContentText());
  }
}

/**
 * Gmail APIでPDF添付メールを送信
 */
function sendEmailWithPdf(to, subject, summary, pdfBlob, docTitle) {
  const boundary = "boundary_" + Utilities.getUuid();
  
  const mailBody = `
ドキュメント「${docTitle}」のPDFをお送りします。

【要約】
${summary}

---
このメールは自動送信されています。
`;
  
  // メールをマルチパート形式で構築
  let mailData = "";
  mailData += "MIME-Version: 1.0\r\n";
  mailData += "To: " + to + "\r\n";
  mailData += "Subject: " + subject + "\r\n";
  mailData += "Content-Type: multipart/mixed; boundary=" + boundary + "\r\n\r\n";
  
  // テキスト部分
  mailData += "--" + boundary + "\r\n";
  mailData += "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
  mailData += mailBody + "\r\n\r\n";
  
  // PDF添付部分
  mailData += "--" + boundary + "\r\n";
  mailData += "Content-Type: application/pdf; name=\"" + pdfBlob.getName() + "\"\r\n";
  mailData += "Content-Transfer-Encoding: base64\r\n";
  mailData += "Content-Disposition: attachment; filename=\"" + pdfBlob.getName() + "\"\r\n\r\n";
  mailData += Utilities.base64Encode(pdfBlob.getBytes()) + "\r\n\r\n";
  mailData += "--" + boundary + "--";
  
  // Gmail APIで送信
  const url = "https://www.googleapis.com/gmail/v1/users/me/messages/send";
  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'message/rfc822'
    },
    payload: mailData,
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() !== 200) {
    throw new Error('メール送信に失敗しました: ' + response.getContentText());
  }
}

/**
 * 5分間隔の自動実行を開始
 */
function startAutoExecution() {
  // 既存のトリガーを削除
  stopAutoExecution();
  
  // 新しいトリガーを作成
  ScriptApp.newTrigger('sendPdfWithSummary')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  SpreadsheetApp.getUi().alert('✅ 5分間隔の自動実行を開始しました');
}

/**
 * 自動実行を停止
 */
function stopAutoExecution() {
  const triggers = ScriptApp.getProjectTriggers();
  
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === 'sendPdfWithSummary') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  SpreadsheetApp.getUi().alert('✅ 自動実行を停止しました');
}