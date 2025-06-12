// script.js の全てのコードをこの内容で置き換えてください

// Google API クライアント ID と API キー
// ★★★ ここにあなたの正しい値を入力してください ★★★
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com'; // あなたのクライアントID
const API_KEY = 'AIzaSyBd1ecDNjPc7qKTad4mA0buKBm6PG7xAlc'; // あなたのAPIキー

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // drive.fileスコープを使用

let tokenClient; // Google Identity Servicesのためのトークンクライアント
let gapiInitialized = false; // gapiライブラリが初期化されたか
let gisInitialized = false;  // gisライブラリが初期化されたか
let pickerInitialized = false; // Google Picker APIが初期化されたか

// マニュアルデータを保持する配列とID管理
let manuals = [];
let currentManualId = null;
let nextManualId = 1;

// ローカルストレージから既存のマニュアルデータを読み込む
if (localStorage.getItem('manuals')) {
    manuals = JSON.parse(localStorage.getItem('manuals'));
    if (manuals.length > 0) {
        nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
    }
}

// Google Driveに保存された前回のファイルIDをローカルストレージから取得
// ★★★ これが重要です。前回保存したファイルIDを記憶します。 ★★★
let lastUsedFileId = localStorage.getItem('lastUsedManualFileId');


// DOM要素のキャッシュ (DOMContentLoadedより前に定義)
// ★★★ index.html のIDに合わせて修正済み。以前のバックアップコードではIDが違っていました。 ★★★
const contentList = document.getElementById('content-list');
const searchInput = document.getElementById('search-input');
const manualFormArea = document.getElementById('manual-form-area');
const manualForm = document.getElementById('manual-form');
const manualIdInput = document.getElementById('manual-id');
const manualTitleInput = document.getElementById('manual-title');
const manualBodyTextarea = document.getElementById('manual-body');
const manualLadderSelect = document.getElementById('manual-ladder');
const formTitle = document.getElementById('form-title');
const fileStatusElement = document.getElementById('file-status');
const contentDetail = document.getElementById('content-detail');


// --- Google API 初期化関連関数 ---

// gapi.js がロードされたときに自動的に呼び出される関数 (index.htmlのonload属性で指定)
function gapiLoaded() {
    console.log('gapi.js loaded.');
    gapi.load('client', initializeGapiClient);
}

// Google API クライアントを初期化する関数
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: DISCOVERY_DOCS,
        });
        await gapi.client.load('drive', 'v3');
        gapiInitialized = true;
        console.log('Google API Client for Drive loaded and initialized.');
        checkAllApisLoaded(); // 全てのAPIがロードされたかチェック
    } catch (err) {
        console.error('Failed to initialize gapi client:', err);
        fileStatusElement.textContent = 'Google APIの初期化に失敗しました。';
    }
}

// gis.js がロードされたときに自動的に呼び出される関数 (index.htmlのonload属性で指定)
function gisLoaded() {
    console.log('gis.js loaded.');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                gapi.client.setToken(tokenResponse);
                fileStatusElement.textContent = 'Google Driveに接続済み。';
                // 認証成功時のみボタンを有効化
                document.getElementById('load-from-drive-button').disabled = false;
                document.getElementById('save-to-drive-button').disabled = false;
                console.log('Access token obtained and set.');

                // ★自動読み込みを試みるロジック★
                // 認証が成功したら、前回使用したファイルIDがあれば自動で読み込みを試みる
                if (lastUsedFileId) {
                    console.log(`前回使用したファイルID (${lastUsedFileId}) があります。自動的に読み込みを試みます。`);
                    loadManualFromFileId(lastUsedFileId);
                } else {
                    console.log('前回使用したファイルIDはありません。手動での読み込みを待機します。');
                }

            } else {
                console.error('アクセストークンの取得に失敗しました。');
                fileStatusElement.textContent = 'Google Driveへの接続に失敗しました。(認証エラー)';
                // 認証失敗時はボタンを無効化
                document.getElementById('load-from-drive-button').disabled = true;
                document.getElementById('save-to-drive-button').disabled = true;
            }
        },
        error_callback: (err) => {
            console.error('GIS init error:', err);
            fileStatusElement.textContent = 'Google Driveへの接続に失敗しました。(認証エラー)';
        }
    });
    gisInitialized = true;
    console.log('Google Identity Services client initialized.');
    checkAllApisLoaded(); // 全てのAPIがロードされたかチェック
}

// Google Picker API がロードされたときに自動的に呼び出される関数 (index.htmlのgoogle.loadで指定)
function pickerLoaded() {
    console.log('Google Picker API loaded.');
    pickerInitialized = true;
    checkAllApisLoaded(); // 全てのAPIがロードされたかチェック
}

// 全ての必要なAPIがロードされたかチェックし、必要な初期化を行う関数
function checkAllApisLoaded() {
    if (gapiInitialized && gisInitialized && pickerInitialized) {
        console.log('All required Google APIs (gapi, gis, picker) are loaded and initialized. All set up.');
        // この時点で全ての依存関係が解決されているはず
        // 認証を促すために一度トークンリクエストをトリガーすることも可能だが、
        // ユーザーの操作でトリガーする方がUXは良い場合が多い。
        // 自動ログインしたい場合はここで tokenClient.requestAccessToken() を呼ぶ。
    }
}


// --- Google Drive 連携機能関連関数 ---

// 「マニュアルを読み込む (Drive)」ボタンクリック時の処理
async function authorizeAndLoadFromDrive() {
    if (!gapiInitialized || !gisInitialized || !pickerInitialized) {
        alert('Google APIの初期化が完了していません。しばらくお待ちください。');
        return;
    }
    // トークンをリクエストし、コールバック関数でPickerを開く
    tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse); // 取得したトークンを設定
            console.log('Access token obtained for loading. Opening Picker...');
            createPicker(); // Pickerを開く
        } else {
            console.error('アクセストークンの取得に失敗しました。');
            alert('Google Driveへの接続に失敗しました。(認証エラー)');
        }
    };
    tokenClient.requestAccessToken({ prompt: 'consent' }); // 初回または権限変更を促す
}

// 「マニュアルを保存 (Drive)」ボタンクリック時の処理
async function authorizeAndSaveToDrive() {
    if (!gapiInitialized || !gisInitialized || !pickerInitialized) {
        alert('Google APIの初期化が完了していません。しばらくお待ちください。');
        return;
    }
    // トークンをリクエストし、コールバック関数で保存処理を呼び出す
    tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse); // 取得したトークンを設定
            console.log('Access token obtained for saving. Saving manuals...');
            saveManualsToDrive(); // マニュアルをGoogle Driveに保存
        } else {
            console.error('アクセストークンの取得に失敗しました。');
            alert('Google Driveへの接続に失敗しました。(認証エラー)');
        }
    };
    tokenClient.requestAccessToken({ prompt: 'consent' }); // 初回または権限変更を促す
}

// Google Picker API を使用してファイルを選択する関数
function createPicker() {
    if (!pickerInitialized) {
        console.error('Google Picker API is not initialized yet.');
        alert('Google Picker APIの準備ができていません。しばらくお待ちください。');
        return;
    }
    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json'); // JSONファイルのみを表示
    view.setQuery('manual_data.json'); // "manual_data.json" のみを検索結果に表示 (オプション)

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN) // ナビゲーションを非表示
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED) // 複数選択を許可しない (デフォルトで単一選択)
        .addView(view)
        .setOAuthToken(gapi.auth.getToken().access_token) // 認証トークンを設定
        .setDeveloperKey(API_KEY) // APIキーを設定 (Picker API 用)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

// Pickerでファイルが選択されたときのコールバック関数
async function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        const fileId = doc.id;
        const fileName = doc.name;
        fileStatusElement.textContent = `ファイル選択済み: ${fileName} (ID: ${fileId})`;

        // ★★★ 選択されたファイルのIDをローカルストレージに保存する ★★★
        localStorage.setItem('lastUsedManualFileId', fileId);
        lastUsedFileId = fileId; // グローバル変数も更新

        loadManualFromFileId(fileId); // 選択されたファイルを読み込む
    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log('Picker was cancelled.');
        fileStatusElement.textContent = 'ファイル選択をキャンセルしました。';
    }
}

// Google Driveから特定のファイルIDのマニュアルを読み込む関数
async function loadManualFromFileId(fileId) {
    if (!fileId) {
        console.warn("ファイルIDが指定されていません。");
        fileStatusElement.textContent = 'ファイルが選択されていません。';
        return;
    }
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media', // ファイルの内容を取得
        });
        manuals = JSON.parse(response.body); // 応答のボディをJSONとしてパース
        localStorage.setItem('manuals', JSON.stringify(manuals)); // ローカルストレージにも保存
        renderManuals(); // マニュアルを画面に表示
        alert('マニュアルをGoogle Driveから読み込みました。');
        console.log('Manuals loaded from Drive:', manuals);
        fileStatusElement.textContent = `ファイル読み込み済み: (ID: ${fileId})`;
    } catch (err) {
        console.error('Google Driveからのファイルの読み込み中にエラーが発生しました:', err);
        alert('Google Driveからのファイルの読み込みに失敗しました。');
        fileStatusElement.textContent = 'ファイルの読み込みに失敗しました。';
        // 読み込み失敗時は保存されたファイルIDをクリア
        localStorage.removeItem('lastUsedManualFileId');
        lastUsedFileId = null;
    }
}

// マニュアルデータをGoogle Driveに保存する関数
async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2); // マニュアルデータをJSON文字列に変換
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = lastUsedFileId; // ★★★ ローカルストレージに保存されたIDを優先 ★★★

        if (!fileId) { // lastUsedFileId がない場合のみ、Drive内を検索して既存ファイルを探す
            console.log('lastUsedFileId がありません。Drive内で既存のファイルを探します。');
            const filesResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and mimeType='${mimeType}' and trashed=false`, // ファイル名とMIMEタイプで検索
                fields: 'files(id, name)', // IDと名前のみ取得
            });
            const existingFiles = filesResponse.result.files;

            if (existingFiles.length > 0) {
                fileId = existingFiles[0].id; // 見つかった最初のファイルのIDを使用
                console.log(`既存のファイルIDが見つかりました: ${fileId}`);
            } else {
                console.log('既存のファイルは見つかりませんでした。新しいファイルを作成します。');
            }
        } else {
            console.log(`lastUsedFileId を使用してファイルを更新します: ${fileId}`);
        }

        const metadata = {
            'name': fileName,
            'mimeType': mimeType,
            // 'parents': ['appDataFolder'] // アプリ固有の隠しフォルダに保存したい場合
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        const requestOptions = {
            method: fileId ? 'PATCH' : 'POST', // fileIdがあれば更新(PATCH)、なければ新規作成(POST)
            path: fileId ? `/upload/drive/v3/files/${fileId}?uploadType=multipart` : '/upload/drive/v3/files?uploadType=multipart',
            headers: {
                'Content-Type': 'multipart/related',
            },
            body: form,
        };

        const response = await gapi.client.request(requestOptions);
        fileStatusElement.textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        // ★★★ 保存に成功したファイルのIDをローカルストレージに保存する ★★★
        localStorage.setItem('lastUsedManualFileId', response.result.id);
        lastUsedFileId = response.result.id; // グローバル変数も更新
    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        fileStatusElement.textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        localStorage.removeItem('lastUsedManualFileId');
        lastUsedFileId = null;
    }
}


// --- UI 操作関連関数 ---

// マニュアルリストを表示する関数
function renderManuals() {
    if (!contentList) {
        console.error("Error: Element with ID 'content-list' not found. Cannot render manuals.");
        return;
    }

    contentList.innerHTML = '';

    const searchTerm = searchInput.value.toLowerCase();
    const filteredManuals = manuals.filter(manual => {
        const matchesSearch = searchTerm === '' ||
                              manual.title.toLowerCase().includes(searchTerm) ||
                              manual.body.toLowerCase().includes(searchTerm);
        const matchesLadder = currentFilterLadder === 'all' || manual.ladder === currentFilterLadder;
        return matchesSearch && matchesLadder;
    });

    if (filteredManuals.length === 0) {
        contentList.innerHTML = '<p class="no-manuals">表示するマニュアルがありません。</p>';
        return;
    }

    filteredManuals.forEach(manual => {
        const manualDiv = document.createElement('div');
        manualDiv.classList.add('manual-item');
        manualDiv.innerHTML = `
            <h3>${manual.title}</h3>
            <p>${manual.body.substring(0, 100)}...</p>
            <div class="manual-actions">
                <button class="edit-button" data-id="${manual.id}">編集</button>
                <button class="delete-button" data-id="${manual.id}">削除</button>
                <button class="detail-button" data-id="${manual.id}">詳細</button>
            </div>
        `;
        manualDiv.querySelector('.edit-button').addEventListener('click', () => editManual(manual.id));
        manualDiv.querySelector('.delete-button').addEventListener('click', () => deleteManual(manual.id));
        manualDiv.querySelector('.detail-button').addEventListener('click', () => showDetail(manual.id));
        contentList.appendChild(manualDiv);
    });
}

// 新規登録ボタンクリック時の処理
function addManual() {
    currentManualId = null; // 新規登録のためIDをリセット
    manualForm.reset(); // フォームをリセット
    formTitle.textContent = '新規登録';
    manualFormArea.classList.remove('hidden');
    contentList.classList.add('hidden');
    document.getElementById('search-area').classList.add('hidden');
    document.querySelector('nav').classList.add('hidden');
}

// フォームの保存ボタンクリック時の処理 (新規登録と編集の両方)
function saveManual(event) {
    event.preventDefault(); // フォームのデフォルト送信を防ぐ

    const title = manualTitleInput.value.trim();
    const body = manualBodyTextarea.value.trim();
    const ladder = manualLadderSelect.value;

    if (!title || !body) {
        alert('タイトルと本文は必須です。');
        return;
    }

    if (currentManualId === null) { // 新規登録
        const newManual = {
            id: nextManualId++,
            title: title,
            body: body,
            ladder: ladder
        };
        manuals.push(newManual);
    } else { // 編集
        const index = manuals.findIndex(m => m.id === currentManualId);
        if (index !== -1) {
            manuals[index].title = title;
            manuals[index].body = body;
            manuals[index].ladder = ladder;
        }
    }

    saveManualsToLocalStorage(); // ローカルストレージに保存
    renderManuals(); // リストを更新

    manualFormArea.classList.add('hidden');
    contentList.classList.remove('hidden');
    document.getElementById('search-area').classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden');
    alert('マニュアルを保存しました。');
}

// マニュアル編集ボタンクリック時の処理
function editManual(id) {
    currentManualId = id;
    const manualToEdit = manuals.find(manual => manual.id === id);

    if (manualToEdit) {
        formTitle.textContent = '編集';
        manualIdInput.value = manualToEdit.id;
        manualTitleInput.value = manualToEdit.title;
        manualBodyTextarea.value = manualToEdit.body;
        manualLadderSelect.value = manualToEdit.ladder;

        manualFormArea.classList.remove('hidden');
        contentList.classList.add('hidden');
        document.getElementById('search-area').classList.add('hidden');
        document.querySelector('nav').classList.add('hidden');
    }
}

// マニュアル削除ボタンクリック時の処理
function deleteManual(id) {
    if (confirm('本当にこのマニュアルを削除しますか？')) {
        manuals = manuals.filter(manual => manual.id !== id);
        saveManualsToLocalStorage();
        renderManuals();
        alert('マニュアルを削除しました。');
    }
}

// マニュアル詳細表示ボタンクリック時の処理
function showDetail(id) {
    const manual = manuals.find(m => m.id === id);
    if (manual) {
        if (!contentDetail) {
            console.error("Error: Element with ID 'content-detail' not found. Cannot show detail.");
            return;
        }
        contentDetail.innerHTML = `
            <h2>${manual.title}</h2>
            <p><strong>ラダー分類:</strong> ${manual.ladder === 'all' ? 'すべて（分類なし）' : manual.ladder}</p>
            <p class="manual-detail-body">${manual.body}</p>
            <button id="back-to-list-button-detail">リストに戻る</button>
        `;
        contentDetail.classList.remove('hidden');
        contentList.classList.add('hidden');
        document.getElementById('search-area').classList.add('hidden');
        document.querySelector('nav').classList.add('hidden');

        document.getElementById('back-to-list-button-detail').addEventListener('click', backToList);
    }
}


// フォームのキャンセルボタンクリック時または詳細表示からリストに戻るボタンクリック時
function cancelForm() {
    manualFormArea.classList.add('hidden');
    contentList.classList.remove('hidden');
    document.getElementById('search-area').classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden');
    renderManuals(); // 変更を破棄してリストを再描画
}

function backToList() {
    contentDetail.classList.add('hidden');
    manualFormArea.classList.add('hidden');
    contentList.classList.remove('hidden');
    document.getElementById('search-area').classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden');
    renderManuals();
}


// ローカルストレージへの保存と読み込み
function saveManualsToLocalStorage() {
    localStorage.setItem('manuals', JSON.stringify(manuals));
}

function loadManualsFromLocalStorage() {
    const storedManuals = localStorage.getItem('manuals');
    if (storedManuals) {
        manuals = JSON.parse(storedManuals);
        if (manuals.length > 0) {
            nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
        }
    }
}


// --- 初期表示とイベントリスナーの設定 ---
let currentFilterLadder = 'all'; // 現在選択されているラダー分類

document.addEventListener('DOMContentLoaded', () => {
    // ローカルストレージからマニュアルを読み込み、表示
    loadManualsFromLocalStorage();
    renderManuals();

    // 検索ボックスのイベントリスナー
    searchInput.addEventListener('input', renderManuals);

    // 各ボタンのイベントリスナー
    document.getElementById('new-manual-button').addEventListener('click', addManual);
    manualForm.addEventListener('submit', saveManual); // フォーム送信で保存
    document.getElementById('cancel-form-button').addEventListener('click', cancelForm);

    // ナビゲーションアイテムのイベントリスナー
    document.querySelectorAll('.nav-item').forEach(item => {
        // 新規登録ボタンはnav-itemクラスも持つが、個別処理
        if (item.id !== 'new-manual-button') {
            item.addEventListener('click', function() {
                const ladder = this.dataset.ladder;
                currentFilterLadder = ladder;
                renderManuals();

                // activeクラスの切り替え
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
            });
        }
    });

    // Google Drive関連のボタンのイベントリスナー
    document.getElementById('load-from-drive-button').addEventListener('click', authorizeAndLoadFromDrive);
    document.getElementById('save-to-drive-button').addEventListener('click', authorizeAndSaveToDrive);

    // 初期のボタン状態を設定（API初期化までは無効）
    document.getElementById('load-from-drive-button').disabled = true;
    document.getElementById('save-to-drive-button').disabled = true;
    fileStatusElement.textContent = 'Google Driveに接続中...';
});
