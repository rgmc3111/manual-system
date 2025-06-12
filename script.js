// script.js の全てのコードをこの内容で置き換えてください

// Google API クライアント ID と API キー
// ★★★ ここにあなたの正しい値を入力してください ★★★
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com'; // あなたのクライアントID
const API_KEY = 'AIzaSyBd1ecDNjPc7qKTad4mA0buKBm6PG7xAlc'; // あなたのAPIキー

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';    

// --- グローバル変数 ---
let gapiInited = false;
let gisInited = false;
let tokenClient;
let currentManualsFileId = null; // 現在読み込んでいる/保存しているGoogle Drive上のファイルID

let loadFromDriveButton;
let saveToDriveButton;
let fileStatus;

// ★重要: google.load を DOMContentLoaded の外に移動 (Picker APIをロード) ★
// Google Visualization API と Picker API をロード
// これにより、DOMContentLoaded 待たずに Picker モジュールのロードが開始される
google.load('picker', '1', { 'callback': createPicker }); 

// --- Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gapiLoaded() {
    console.log("gapiLoaded called."); // デバッグ用
    gapi.load('client', initializeGapiClient); // 'client' ライブラリをロード
}

// --- Google Identity Services (GIS) ライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gisLoaded() {
    console.log("gisLoaded called."); // デバッグ用
    tokenClient = google.accounts.oauth2.initCodeClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.code) {
                // Exchange the authorization code for an access token
                // In a real application, this exchange would happen on a backend server
                // For simplicity, we are simulating it on the client side.
                // This is NOT secure for production.
                fetch('https://www.googleapis.com/oauth2/v4/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        code: resp.code,
                        client_id: CLIENT_ID,
                        client_secret: API_KEY, // This should be securely stored on a server
                        redirect_uri: 'http://localhost', // Must match your registered redirect URI
                        grant_type: 'authorization_code',
                    }),
                })
                .then(response => response.json())
                .then(tokens => {
                    gapi.client.setToken(tokens);
                    console.log("Access token obtained:", tokens.access_token);
                    // 認証成功後、ボタンを有効化
                    loadFromDriveButton.disabled = false;
                    saveToDriveButton.disabled = false;
                })
                .catch(error => {
                    console.error('Error exchanging code for tokens:', error);
                    alert('認証中にエラーが発生しました。開発者ツールで詳細を確認してください。');
                });
            } else {
                console.warn("Authorization code not received.");
            }
        },
    });
    gisInited = true;
    maybeEnableButtons();
}

function createPicker() {
    console.log("Picker API loaded."); // デバッグ用
    pickerInitialized = true;
    maybeEnableButtons();
}

function initializeGapiClient() {
    console.log("Initializing GAPI client..."); // デバッグ用
    gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    }).then(() => {
        gapiInited = true;
        console.log("GAPI client initialized."); // デバッグ用
        maybeEnableButtons();
    }).catch(err => {
        console.error("Error initializing GAPI client:", err);
        alert('Google APIクライアントの初期化に失敗しました。');
    });
}

function maybeEnableButtons() {
    if (gapiInited && gisInited && pickerInitialized) {
        loadFromDriveButton.disabled = false;
        saveToDriveButton.disabled = false;
        console.log("Google Drive buttons enabled."); // デバッグ用
    }
}

async function handleAuthClick() {
    if (!gapi.client.getToken()) {
        // No access token found, so prompt for user consent
        tokenClient.callback = async (resp) => {
            if (resp.error) {
                throw (resp);
            }
            // Upon receiving the response, you can enable the buttons
            loadFromDriveButton.disabled = false;
            saveToDriveButton.disabled = false;
            console.log("Authentication successful, tokens set.");
        };
        tokenClient.requestAccessToken();
    } else {
        // Access token already exists, proceed directly
        console.log("Access token already exists. Proceeding...");
    }
}

// マニュアルデータを保持する配列とID管理
let manuals = [];
let currentManualId = null;
let nextManualId = 1;
let currentFilterLadder = 'all'; // 現在選択されているラダー（初期値は「すべて」）
let currentSearchTerm = ''; // 現在の検索キーワード

// DOM要素の取得
const manualList = document.getElementById('manual-list');
const manualDetailSection = document.getElementById('manual-detail-section');
const manualFormSection = document.getElementById('manual-form-section');
const formTitle = document.getElementById('form-title');
const manualIdInput = document.getElementById('manual-id');
const manualTitleInput = document.getElementById('manual-title');
const manualBodyInput = document.getElementById('manual-body');
const manualLadderSelect = document.getElementById('manual-ladder');
const manualForm = document.getElementById('manual-form');
const backToListButton = document.getElementById('back-to-list-button');
const searchInput = document.getElementById('search-input');
const cancelFormButton = document.getElementById('cancel-form-button');

// 新しく追加された詳細表示用の要素
const manualDetailTitle = document.getElementById('manual-detail-title');
const manualDetailBody = document.getElementById('manual-detail-body');
const manualDetailLadder = document.getElementById('manual-detail-ladder');
const editButton = document.getElementById('edit-detail-button');
const deleteButton = document.getElementById('delete-detail-button');

// Google Drive関連ボタン
loadFromDriveButton = document.getElementById('load-from-drive-button');
saveToDriveButton = document.getElementById('save-to-drive-button');
fileStatus = document.getElementById('file-status');


// ローカルストレージから既存のマニュアルデータを読み込む
function loadManualsFromLocalStorage() {
    if (localStorage.getItem('manuals')) {
        manuals = JSON.parse(localStorage.getItem('manuals'));
        if (manuals.length > 0) {
            nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
        }
    }
    // Google Driveから最後に使用したファイルIDを読み込む
    currentManualsFileId = localStorage.getItem('lastUsedManualFileId');
    if (currentManualsFileId) {
        fileStatus.textContent = `現在読み込み中のファイルID: ${currentManualsFileId}`;
    } else {
        fileStatus.textContent = 'Google Driveファイルは選択されていません。';
    }
}

// マニュアルデータをローカルストレージに保存する
function saveManualsToLocalStorage() {
    localStorage.setItem('manuals', JSON.stringify(manuals));
}

// マニュアル一覧を表示する
function renderManuals() {
    manualList.innerHTML = ''; // リストをクリア
    manualFormSection.classList.add('hidden'); // フォームを非表示
    manualDetailSection.classList.add('hidden'); // 詳細を非表示
    manualList.classList.remove('hidden'); // リストを表示

    const filteredManuals = manuals.filter(manual => {
        const matchesLadder = currentFilterLadder === 'all' || manual.ladder === currentFilterLadder;
        const matchesSearch = manual.title.includes(currentSearchTerm) || manual.body.includes(currentSearchTerm);
        return matchesLadder && matchesSearch;
    });

    if (filteredManuals.length === 0) {
        manualList.innerHTML = '<p>表示するマニュアルがありません。</p>';
        return;
    }

    filteredManuals.forEach(manual => {
        const li = document.createElement('li');
        li.classList.add('manual-item');
        li.innerHTML = `
            <h3>${manual.title}</h3>
            <p>${manual.body.substring(0, 100)}...</p>
            <span class="ladder-tag">${manual.ladder === 'all' ? '分類なし' : manual.ladder}</span>
            <div class="manual-actions">
                <button data-id="${manual.id}" class="view-button">詳細</button>
            </div>
        `;
        li.querySelector('.view-button').addEventListener('click', () => showManualDetail(manual.id));
        manualList.appendChild(li);
    });
}

// 新規マニュアル作成フォームを表示する
function showNewManualForm() {
    manualList.classList.add('hidden'); // リストを非表示
    manualDetailSection.classList.add('hidden'); // 詳細を非表示
    manualFormSection.classList.remove('hidden'); // フォームを表示

    formTitle.textContent = '新規登録';
    manualIdInput.value = ''; // 新規作成時はIDをクリア
    manualTitleInput.value = '';
    manualBodyInput.value = '';
    manualLadderSelect.value = 'all'; // 初期値
}

// マニュアルを新規追加または更新する
function saveManual(event) {
    event.preventDefault(); // フォームのデフォルト送信を防ぐ

    const id = manualIdInput.value;
    const title = manualTitleInput.value;
    const body = manualBodyInput.value;
    const ladder = manualLadderSelect.value;

    if (id) {
        // 既存マニュアルの更新
        const index = manuals.findIndex(m => m.id == id);
        if (index !== -1) {
            manuals[index] = { id: parseInt(id), title, body, ladder };
        }
    } else {
        // 新規マニュアルの追加
        const newManual = {
            id: nextManualId++,
            title,
            body,
            ladder
        };
        manuals.push(newManual);
    }
    saveManualsToLocalStorage(); // 保存
    renderManuals(); // リストを再描画
    alert('マニュアルを保存しました！');
}

// フォームをキャンセルしてリストに戻る
function cancelForm() {
    renderManuals();
}

// マニュアル詳細を表示する
function showManualDetail(id) {
    const manual = manuals.find(m => m.id == id);
    if (manual) {
        manualDetailTitle.textContent = manual.title;
        manualDetailBody.textContent = manual.body;
        manualDetailLadder.textContent = `ラダー分類: ${manual.ladder === 'all' ? 'すべて（分類なし）' : manual.ladder}`;

        // 詳細画面の編集・削除ボタンにIDを設定
        document.getElementById('edit-detail-button').dataset.id = manual.id;
        document.getElementById('delete-detail-button').dataset.id = manual.id;


        manualList.innerHTML = ''; // リストを非表示にする
        manualFormSection.classList.add('hidden'); // フォームを非表示
        manualDetailSection.classList.remove('hidden'); // 詳細を表示
    }
}

// マニュアル編集フォームの表示
function showEditManualForm(id) {
    const manual = manuals.find(m => m.id == id);
    if (manual) {
        showNewManualForm(); // 新規フォームと同じ関数でUIをリセット
        formTitle.textContent = 'マニュアル編集';
        manualIdInput.value = manual.id;
        manualTitleInput.value = manual.title;
        manualBodyInput.value = manual.body;
        manualLadderSelect.value = manual.ladder;
    }
}

// マニュアルの削除
function deleteManual(id) {
    if (confirm('このマニュアルを本当に削除しますか？')) {
        manuals = manuals.filter(manual => manual.id != id);
        saveManualsToLocalStorage(); // 保存
        alert('マニュアルを削除しました。');
        renderManuals(); // リストを再描画
    }
}

// Google Driveへのファイルの保存
async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = currentManualsFileId; // ローカルストレージに保存されたIDを優先

        if (!fileId) { // ファイルIDがない場合のみ、Drive内を検索して既存ファイルを探す
            console.log('currentManualsFileId がありません。Drive内で既存のファイルを探します。');
            const filesResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and mimeType='${mimeType}' and trashed=false`,
                fields: 'files(id, name)',
            });
            const existingFiles = filesResponse.result.files;

            if (existingFiles.length > 0) {
                fileId = existingFiles[0].id; // 見つかった最初のファイルのIDを使用
                console.log(`既存のファイルIDが見つかりました: ${fileId}`);
            } else {
                console.log('既存のファイルは見つかりませんでした。新規作成します。');
            }
        }

        const metadata = {
            'name': fileName,
            'mimeType': mimeType
        };

        let requestOptions;
        if (fileId) {
            // 既存ファイルを更新
            requestOptions = {
                'path': `/upload/drive/v3/files/${fileId}`,
                'method': 'PATCH',
                'params': { 'uploadType': 'multipart' },
                'headers': {
                    'Content-Type': 'application/json',
                },
                'body': {
                    metadata: metadata,
                    media: {
                        mimeType: mimeType,
                        body: content
                    }
                }
            };
        } else {
            // 新規ファイルを作成
            requestOptions = {
                'path': '/upload/drive/v3/files',
                'method': 'POST',
                'params': { 'uploadType': 'multipart' },
                'headers': {
                    'Content-Type': 'application/json',
                },
                'body': {
                    metadata: metadata,
                    media: {
                        mimeType: mimeType,
                        body: content
                    }
                }
            };
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('media', new Blob([content], { type: mimeType }));

        requestOptions = {
            'path': requestOptions.path,
            'method': requestOptions.method,
            'params': requestOptions.params,
            'headers': {
                'Content-Type': undefined, // FormDataを使用する場合はContent-Typeを自動設定させるためにundefinedにする
            },
            body: form,
        };

        const response = await gapi.client.request(requestOptions);
        document.getElementById('file-status').textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        // ★★★ 保存に成功したファイルのIDをローカルストレージに保存する ★★★
        localStorage.setItem('lastUsedManualFileId', response.result.id);
        currentManualsFileId = response.result.id; // グローバル変数も更新

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        localStorage.removeItem('lastUsedManualFileId');
        currentManualsFileId = null;
    }
}

// Google Driveからファイルを読み込む関数
async function loadManualsFromDrive() {
    try {
        let fileId = currentManualsFileId;

        if (!fileId) {
            // Picker APIを使用してユーザーにファイルを選択させる
            await showPicker();
            // showPicker() の後、pickerCallbackで currentManualsFileId がセットされるはず
            fileId = currentManualsFileId; 
        }

        if (!fileId) {
            alert('読み込むファイルが選択されていません。');
            return;
        }

        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        manuals = JSON.parse(response.body);
        saveManualsToLocalStorage();
        nextManualId = manuals.length > 0 ? Math.max(...manuals.map(m => m.id)) + 1 : 1;
        renderManuals();
        document.getElementById('file-status').textContent = `ファイル読み込み済み: ${fileId}`;
        alert('Google Driveからマニュアルを読み込みました！');

    } catch (err) {
        console.error('Google Driveからのファイルの読み込み中にエラーが発生しました:', err);
        alert('Google Driveからのファイルの読み込みに失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの読み込みに失敗しました。';
        // 読み込み失敗時はファイルIDをクリアし、次回は再選択を促す
        localStorage.removeItem('lastUsedManualFileId');
        currentManualsFileId = null;
    }
}

// Google Picker APIの表示
async function showPicker() {
    return new Promise((resolve, reject) => {
        const view = new google.picker.View(google.picker.ViewId.DOCS);
        view.setMimeTypes('application/json'); // JSONファイルのみを表示

        const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(gapi.client.getToken().access_token)
            .setDeveloperKey(API_KEY)
            .setCallback(pickerCallback)
            .build();
        picker.setVisible(true);
        // Picker が閉じられたときに resolve されるようにする
        picker.Lh.addEventListener('click', (e) => { // Picker の背景クリックで閉じるイベント
            if (e.target.classList.contains('picker-dialog-bg')) {
                resolve();
            }
        });
    });
}

// Pickerでファイルが選択された時のコールバック
function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        const fileId = doc.id;
        const fileName = doc.name;
        
        currentManualsFileId = fileId; // 選択されたファイルのIDをグローバル変数に保存
        localStorage.setItem('lastUsedManualFileId', fileId); // ローカルストレージにも保存
        fileStatus.textContent = `選択されたファイル: ${fileName} (ID: ${fileId})`;
        console.log('Pickerでファイルが選択されました:', fileId);
        // ファイル選択後、自動的に読み込み処理を続ける
        loadManualsFromDrive(); 
    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log('Pickerがキャンセルされました。');
        fileStatus.textContent = 'ファイルの選択がキャンセルされました。';
    }
}


// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
    loadManualsFromLocalStorage();
    renderManuals();

    // 検索ボックスのイベントリスナー
    searchInput.addEventListener('input', renderManuals);

    // 各ボタンのイベントリスナー
    document.getElementById('new-manual-button').addEventListener('click', showNewManualForm);
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

    // 詳細表示ボタンのイベントリスナー（renderManuals関数内で設定されるため、ここでは不要）
    // editButton と deleteButton のイベントリスナーは detail-actions に配置したボタンに直接設定
    editButton.addEventListener('click', (event) => {
        const manualId = event.target.dataset.id;
        if (manualId) {
            showEditManualForm(manualId);
        }
    });

    deleteButton.addEventListener('click', (event) => {
        const manualId = event.target.dataset.id;
        if (manualId) {
            deleteManual(manualId);
        }
    });

    // Google Drive関連のボタンのイベントリスナーは、
    // APIの初期化が完了した時点で handleAuthClick に設定されます。
    // ※今回は handleAuthClick に直接イベントリスナーを登録
    loadFromDriveButton.addEventListener('click', async () => {
        await handleAuthClick(); // まず認証を試みる
        if (gapi.client.getToken()) { // 認証が成功したら
            loadManualsFromDrive();
        }
    });
    saveToDriveButton.addEventListener('click', async () => {
        await handleAuthClick(); // まず認証を試みる
        if (gapi.client.getToken()) { // 認証が成功したら
            saveManualsToDrive();
        }
    });

    // 初期のボタン状態を設定（API初期化までは無効）
    loadFromDriveButton.disabled = true;
    saveToDriveButton.disabled = true;
});
