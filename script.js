// TODO: ご自身のGoogle Cloud Consoleで取得した認証情報を設定してください
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com'; // あなたのクライアントIDに置き換えてください
const API_KEY = 'AIzaSyBd1ecDNjPc7qKTad4mA0buKBm6PG7xAlc';     // あなたのAPIキーに置き換えてください
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // アプリケーションが必要とするスコープ

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Drive関連ボタンのイベントリスナー (認証後に有効化される)
document.getElementById('load-from-drive-button').addEventListener('click', () => loadDataFromDrive());
document.getElementById('save-to-drive-button').addEventListener('click', () => {
    // 現在のマニュアルデータをJSON文字列として保存する
    // `manuals` はアプリケーション内でマニュアルデータを保持している配列を想定
    if (typeof manuals !== 'undefined') {
        saveDataToDrive(JSON.stringify(manuals));
    } else {
        console.error('マニュアルデータ(manuals配列)が見つかりません。');
        document.getElementById('file-status').textContent = '保存するマニュアルデータがありません。';
    }
});

// Google API Client Libraryがロードされた後に呼び出される
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

// Google Identity Services Libraryがロードされた後に呼び出される
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // トークン取得時のコールバックは、requestAccessToken内で処理
    });
    gisInited = true;
    maybeEnableDriveButtons();
}

// GAPIクライアントを初期化
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;
        maybeEnableDriveButtons();
    } catch (error) {
        console.error('Error initializing GAPI client:', error);
        document.getElementById('file-status').textContent = 'Google APIクライアントの初期化に失敗しました。';
    }
}

// 認証状態を確認し、Drive関連ボタンを有効化する
function maybeEnableDriveButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('load-from-drive-button').disabled = false;
        document.getElementById('save-to-drive-button').disabled = false;
        document.getElementById('file-status').textContent = 'Google Driveに接続準備完了。操作ボタンで認証してください。';
        // 必要であれば、自動的に既存ファイルを探す処理をここに入れることも可能
        // findOrCreateDriveFile().then(id => { if(id) { /* ファイルが見つかった場合の処理 */ }});
    }
}

// 認証を要求し、アクセストークンを取得する
async function requestAccessToken() {
    return new Promise((resolve, reject) => {
        // 既存のトークンを確認 (gapi.client.getToken() はGIS OAuth2では直接使われない場合がある)
        // GISでは、tokenClient.requestAccessToken() を呼び出すとコールバックでトークンが渡される
        if (gapi.client.getToken() && gapi.client.getToken().access_token) { // GISがトークンをgapi.clientにセットする場合
             resolve(gapi.client.getToken());
             return;
        }

        tokenClient.callback = (resp) => {
            if (resp.error) {
                reject(resp);
            } else {
                // GISライブラリがgapi.clientにトークンを設定することが期待される
                // gapi.client.setToken(resp); // 明示的にセットする場合
                console.log('Access token acquired.');
                document.getElementById('file-status').textContent = 'Google Driveに認証済み。';
                resolve(resp); // トークンレスポンスを解決
            }
        };
        tokenClient.requestAccessToken({prompt: 'consent'}); // 認証プロンプトを表示
    });
}

// --- Google Drive ファイル操作 ---
const DRIVE_DATA_FILENAME = 'manual_system_data.json'; // 例: アプリケーション専用のファイル名
let driveFileId = null; // 取得したファイルIDを保持する変数

// Google Drive APIの初期化後や適切なタイミングで実行
async function findOrCreateDriveFile() {
    try {
        await requestAccessToken(); // ★認証を要求/確認
        // 1. ファイルを名前で検索
        const response = await gapi.client.drive.files.list({
            q: `name='${DRIVE_DATA_FILENAME}' and trashed=false`,
            driveFileId = response.result.files[0].id'
            console.log(`Found file: ${response.result.files[0].name}, ID: ${driveFileId}`);
            // 必要であれば、ここでファイルステータスを更新
            document.getElementById('file-status').textContent = `Driveファイル確認済み: ${DRIVE_DATA_FILENAME}`;
            return driveFileId;
        } else {
            // ファイルが見つからない場合、新規作成する（最初の保存時など）
            // この段階で作成するか、最初の保存時に作成するかは設計によります。
            // ここでは、見つからなかったことを記録しておくだけとします。
            console.log(`File '${DRIVE_DATA_FILENAME}' not found. Will be created on first save.`);
            document.getElementById('file-status').textContent = `Driveに ${DRIVE_DATA_FILENAME} が見つかりません。初回保存時に作成されます。`;
            return null;
        }
    } catch (error) {
        console.error('Error finding file:', error);
        document.getElementById('file-status').textContent = 'Google Driveファイルの検索中にエラーが発生しました。';
        if (error.result && error.result.error && error.result.error.message) {
            document.getElementById('file-status').textContent += ` 詳細: ${error.result.error.message}`;
        }
        throw error;
    }
}

// マニュアル読み込み処理 (loadFromDriveButton のイベントリスナー内など)
async function loadDataFromDrive() {
    try {
        await requestAccessToken(); // ★認証を要求/確認

        if (!driveFileId) {
            await findOrCreateDriveFile(); // findOrCreateDriveFile内で認証は済んでいる
        }

        if (!driveFileId) {
            console.log('No file to load from Drive yet.');
            document.getElementById('file-status').textContent = '読み込むファイルがDriveにありません。';
            if (typeof manuals !== 'undefined' && typeof renderManuals === 'function') {
                manuals = [];
                renderManuals();
            }
            return []; // 空のデータを返すなど
        }

        const response = await gapi.client.drive.files.get({
            fileId: driveFileId,
            alt: 'media'
        });

        console.log('File content loaded from Drive.');
        document.getElementById('file-status').textContent = `Driveから ${DRIVE_DATA_FILENAME} を読み込みました。`;

        let loadedData = [];
        if (typeof response.result === 'string') { // Driveからの応答が文字列の場合
            try {
                loadedData = JSON.parse(response.result);
            } catch (e) {
                console.error("Failed to parse JSON from Drive:", e);
                document.getElementById('file-status').textContent = 'Driveから読み込んだデータの形式が不正です。';
                return [];
            }
        } else if (typeof response.result === 'object' && response.result !== null) { // 既にオブジェクトの場合
            loadedData = response.result;
        }

        if (typeof manuals !== 'undefined' && typeof renderManuals === 'function') {
            manuals = Array.isArray(loadedData) ? loadedData : []; // データが配列であることを期待
            renderManuals(); // マニュアル一覧を再描画
        }
        return loadedData;

    } catch (error) {
        console.error('Error loading data from Drive:', error);
        document.getElementById('file-status').textContent = 'Driveからのデータ読み込み中にエラーが発生しました。';
        if (error.result && error.result.error && error.result.error.message) {
            document.getElementById('file-status').textContent += ` 詳細: ${error.result.error.message}`;
        }
        if (typeof manuals !== 'undefined' && typeof renderManuals === 'function') {
            manuals = [];
            renderManuals();
        }
        return [];
    }
}

// マニュアル保存処理 (saveToDriveButton のイベントリスナー内など)
async function saveDataToDrive(contentString) { // contentString はJSON文字列化されたデータ
    try {
        await requestAccessToken(); // ★認証を要求/確認

        // ファイルIDが未取得、またはファイルが存在しないか確認するために毎回検索・作成ロジックを通す
        // (findOrCreateDriveFile はファイルIDを返すので、それを利用しても良い)
        try {
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${DRIVE_DATA_FILENAME}' and trashed=false`,
                // ファイルが見つからないので新規作成
                const fileMetadata = {
                    'name': DRIVE_DATA_FILENAME,
                    'mimeType': 'application/json' // 新規作成時にMIMEタイプを指定
                    // 'parents': ['appDataFolder'] // appDataFolder を使用する場合
                };
                const createResponse = await gapi.client.drive.files.create({
                    fields: 'id'
                });
                driveFileId = createResponse.result.id;
                console.log(`Created file in Drive: ${DRIVE_DATA_FILENAME}, ID: ${driveFileId}`);
            }
        } catch (error) {
            console.error('Error ensuring file exists:', error);
            document.getElementById('file-status').textContent = 'Google Driveファイルの準備中にエラーが発生しました。';
            if (error.result && error.result.error && error.result.error.message) {
                document.getElementById('file-status').textContent += ` 詳細: ${error.result.error.message}`;
            }
            return;
        }

        // ファイル内容を更新 (multipart upload)
        const boundary = '-------314159265358979323846'; // 任意の境界文字列
        const delimiter = `\r\n--${boundary}\r\n`;
        const close_delim = `\r\n--${boundary}--`;

        const metadata = {
            name: DRIVE_DATA_FILENAME, // ファイル名を指定（既存ファイルの場合は上書きされる）
            mimeType: 'application/json'
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' + // メタデータのContent-Type
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' + // 保存するデータのContent-Type
            contentString + // 保存するJSON文字列
            close_delim;

        const request = gapi.client.request({
            path: `/upload/drive/v3/files/${driveFileId}`,
            method: 'PATCH',
            params: { uploadType: 'multipart' },
            headers: {
                'Content-Type': `multipart/related; boundary="${boundary}"`
            },
            body: multipartRequestBody
        });

        await request;
        console.log('Data saved to Drive.');
        document.getElementById('file-status').textContent = `Driveに ${DRIVE_DATA_FILENAME} を保存しました。`;

    } catch (error) {
        console.error('Error saving data to Drive:', error);
        document.getElementById('file-status').textContent = 'Driveへのデータ保存中にエラーが発生しました。';
        if (error.result && error.result.error && error.result.error.message) {
            document.getElementById('file-status').textContent += ` 詳細: ${error.result.error.message}`;
        }
    }
}

// --------------------------------------------------------------------------------
// 以下に、マニュアル登録システムの他のJavaScriptコード（UI操作、ローカルデータ管理など）が続く想定です。
// 例: manuals 配列の定義、renderManuals 関数の定義、フォーム処理など
// let manuals = [];
// function renderManuals() { /* ... */ }
// etc.
// --------------------------------------------------------------------------------
