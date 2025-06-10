// Google API クライアント ID
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com'; // あなたのクライアントID
const API_KEY = 'YOUR_API_KEY'; // あなたのAPIキー
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let googlePickerInitialized = false;
let lastUsedFileId = localStorage.getItem('lastUsedManualFileId'); // 前回のファイルIDをローカルストレージから取得

// ... (既存のgapiLoaded, initializeGapiClient, gisLoaded 関数はそのまま) ...

// APIクライアントを初期化する関数
async function initClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES,
        });
        console.log('Google APIクライアントが初期化されました。');
        googlePickerInitialized = true;

        // Google Drive 連携ボタンのイベントリスナーを設定
        document.getElementById('load-drive-manual').addEventListener('click', authorizeAndLoadFromDrive);
        document.getElementById('save-drive-manual').addEventListener('click', authorizeAndSaveToDrive);

        // ★★★ ここから追加・修正 ★★★
        // ページロード時に自動認証・読み込みを試みる
        if (lastUsedFileId) {
            console.log('ローカルストレージに前回のファイルIDがあります。自動読み込みを試みます。');
            try {
                // サイレント認証を試みる (ポップアップを出さずに認証済みか確認)
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance.isSignedIn.get()) { // 既にサインインしている場合
                    console.log('既にサインイン済みです。ファイルを読み込みます。');
                    loadManualFromFileId(lastUsedFileId);
                } else {
                    // サイレント認証が難しい場合（初回アクセスやトークン期限切れなど）
                    // ユーザーにボタンを押してもらうか、ここで認証プロンプトを出すかを検討
                    // ここでは、ユーザーにボタンを押してもらうことを推奨
                    document.getElementById('file-status').textContent = '前回使用したファイルがあります。マニュアルを読み込む (Drive) ボタンを押して読み込んでください。';
                }
            } catch (authErr) {
                console.warn('自動認証中にエラーが発生しました。手動で読み込みを促します。', authErr);
                document.getElementById('file-status').textContent = '前回使用したファイルがあります。マニュアルを読み込む (Drive) ボタンを押して読み込んでください。';
            }
        } else {
            document.getElementById('file-status').textContent = 'Google Driveに接続していません。ボタンをクリックして接続してください。';
        }
        // ★★★ ここまで追加・修正 ★★★

    } catch (err) {
        console.error('Google APIクライアントの初期化中にエラーが発生しました:', err);
    }
}


// Pickerでファイルが選択された時のコールバック関数
async function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        const fileId = doc.id;
        const fileName = doc.name;
        document.getElementById('file-status').textContent = `ファイル保存済み: ${fileName} (ID: ${fileId})`;

        localStorage.setItem('lastUsedManualFileId', fileId); // ★★★ ここを追加：ファイルIDを保存 ★★★
        lastUsedFileId = fileId; // 変数も更新

        loadManualFromFileId(fileId); // 読み込み処理を共通関数に
    }
}

// ファイルIDを指定してマニュアルを読み込む共通関数
async function loadManualFromFileId(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media' // ファイル内容を取得
        });
        const loadedManuals = response.result;

        if (Array.isArray(loadedManuals)) {
            manuals = loadedManuals;
            localStorage.setItem('manuals', JSON.stringify(manuals));
            displayManuals(currentLadder, currentSearchTerm);
            alert(`マニュアルファイル「${fileId}」を読み込みました。`); // ファイル名を直接表示できないが、IDで確認
            document.getElementById('file-status').textContent = `ファイル読み込み済み: (ID: ${fileId})`; // UIを更新
        } else {
            alert('読み込んだファイルは無効なマニュアル形式です。');
            console.error('Invalid manual format:', loadedManuals);
            // 無効な形式の場合、保存されたファイルIDをクリアすることも検討
            localStorage.removeItem('lastUsedManualFileId');
            lastUsedFileId = null;
        }

    } catch (err) {
        console.error('ファイルの読み込み中にエラーが発生しました:', err);
        alert('ファイルの読み込みに失敗しました。');
        // エラー時は保存されたファイルIDをクリア
        localStorage.removeItem('lastUsedManualFileId');
        lastUsedFileId = null;
        document.getElementById('file-status').textContent = 'ファイル読み込み失敗。Google Driveに接続していません。ボタンをクリックして接続してください。';
    }
}

// マニュアルデータをGoogle Driveに保存する関数
async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = lastUsedFileId; // ローカルストレージに保存されたIDを優先

        if (!fileId) { // まだファイルIDがない場合のみ検索
            const filesResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and mimeType='${mimeType}' and trashed=false`,
                fields: 'files(id, name)',
            });
            const existingFiles = filesResponse.result.files;

            if (existingFiles.length > 0) {
                fileId = existingFiles[0].id;
            }
        }

        const metadata = {
            'name': fileName,
            'mimeType': mimeType,
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        const requestOptions = {
            method: fileId ? 'PATCH' : 'POST',
            path: fileId ? `/upload/drive/v3/files/${fileId}?uploadType=multipart` : '/upload/drive/v3/files?uploadType=multipart',
            headers: {
                'Content-Type': 'multipart/related',
            },
            body: form,
        };

        const response = await gapi.client.request(requestOptions);
        document.getElementById('file-status').textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        localStorage.setItem('lastUsedManualFileId', response.result.id); // ★★★ ここを修正：保存したファイルのIDを保存 ★★★
        lastUsedFileId = response.result.id; // 変数も更新

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの保存に失敗しました。';
    }
}

// DOMContentLoaded イベントリスナーはそのまま
document.addEventListener('DOMContentLoaded', () => {
    // ... 既存のDOM要素取得とイベントリスナー設定 ...
    // initializeGapiClient(); // これはgapiLoadedから呼ばれるように変更

    // Google APIクライアントライブラリのロードはHTMLで行う
    // <script async defer src="https://apis.google.com/js/api.js" onload="gapiLoaded()"></script>
    // <script async defer src="https://accounts.google.com/gsi/client" onload="gisLoaded()"></script>
});

// gapiがロードされたときに呼ばれる関数
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// Google APIクライアントを初期化する関数
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    await gapi.client.load('drive', 'v3');
    console.log('Google API Client for Drive loaded.');
    googlePickerInitialized = true; // 初期化完了フラグ

    // ここで initClient を呼び出して、認証と読み込みを試行
    initClient();
}
