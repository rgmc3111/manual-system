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

// マニュアルデータを保持する配列とID管理
let manuals = [];
let currentManualId = null;
let nextManualId = 1;
let currentFilterLadder = 'all'; // 現在選択されているラダー（初期値は「すべて」）
let currentSearchTerm = ''; // 現在の検索キーワード

// ローカルストレージから既存のマニュアルデータを読み込む
if (localStorage.getItem('manuals')) {
    manuals = JSON.parse(localStorage.getItem('manuals'));
    if (manuals.length > 0) {
        nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
    }
}

// DOM要素の取得
const manualListDiv = document.getElementById('manual-list'); // ★ここを manual-list に修正★
const manualDetailContainer = document.getElementById('manual-detail-container');
const manualFormContainer = document.getElementById('manual-form-container');
const manualForm = document.getElementById('manual-form');
const searchInput = document.getElementById('search-input');
const backToListButton = document.getElementById('back-to-list-button');
const editButton = document.getElementById('edit-manual-button');
const deleteButton = document.getElementById('delete-manual-button');
const cancelFormButton = document.getElementById('cancel-form-button');

// --- Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数 ---

// gapi.js ライブラリがロードされたときに呼び出される
function gapiLoaded() {
    console.log("gapiLoaded called."); // デバッグ用
    gapi.load('client', initializeGapiClient); // 'client' ライブラリをロードして初期化
}

// gis/client.js ライブラリがロードされたときに呼び出される
function gisLoaded() {
    console.log("gisLoaded called."); // デバッグ用
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // incl_granted_scopes を true に設定する場合のみ必要
    });
    gisInited = true;
    maybeEnableButtons();
}

// Google API クライアントが初期化されたときに呼び出される
async function initializeGapiClient() {
    console.log("initializeGapiClient called."); // デバッグ用
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

// Picker API をロード
// ※ google.load は index.html で jsapi が読み込まれた後に、script.js のどこからでも呼び出し可能
// 今回は script.js のグローバルスコープで呼び出し
google.load('picker', '1', { 'callback': pickerLoaded }); // ★ここに pickerLoaded をコールバックとして指定★

// Picker API のロードが完了したときに呼び出される（google.load のコールバック）
function pickerLoaded() {
    console.log("Picker API loaded."); // デバッグ用
    // Picker API がロードされたことを示すフラグをセット
    // 特に何かする必要はないが、ボタンの有効化などに使う場合はここでフラグを立てる
}


// 両方のAPIが初期化されたらボタンを有効化する
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('load-from-drive-button').disabled = false;
        document.getElementById('save-to-drive-button').disabled = false;
        document.getElementById('file-status').textContent = 'Google Driveに未接続';
    }
}


// Google認証フローを開始する関数 (Load/Save ボタンから呼び出される)
function handleAuthClick(event) {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('load-from-drive-button').textContent = '読み込み中...';
        document.getElementById('save-to-drive-button').textContent = '保存中...';
        document.getElementById('load-from-drive-button').disabled = true;
        document.getElementById('save-to-drive-button').disabled = true;

        if (event.target.id === 'load-from-drive-button') {
            await loadManualsFromDrive();
        } else if (event.target.id === 'save-to-drive-button') {
            await saveManualsToDrive();
        }

        document.getElementById('load-from-drive-button').textContent = 'マニュアルを読み込む (Drive)';
        document.getElementById('save-to-drive-button').textContent = 'マニュアルを保存 (Drive)';
        maybeEnableButtons(); // 認証状態に応じてボタンを再度有効化
    };

    if (gapi.client.getToken() === null) {
        // トークンがない場合、認証を要求
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // トークンがある場合、既存のトークンでcallbackを実行
        tokenClient.callback(gapi.client.getToken());
    }
}


// マニュアルデータをGoogle Driveから読み込む関数
async function loadManualsFromDrive() {
    try {
        const fileId = currentManualsFileId || localStorage.getItem('lastUsedManualFileId');
        let chosenFileId;

        if (fileId) {
            // 以前使用したファイルIDがあればそれを使う
            chosenFileId = fileId;
            document.getElementById('file-status').textContent = `前回のファイル (${chosenFileId}) を読み込み中...`;
            console.log(`Loading previously used file: ${chosenFileId}`);
        } else {
            // ファイルIDがない場合、Picker APIでファイルを選択
            const picker = new google.picker.PickerBuilder()
                .addView(google.picker.ViewId.DOCS)
                .setOAuthToken(gapi.client.getToken().access_token)
                .setDeveloperKey(API_KEY)
                .setCallback((data) => { // Picker API のコールバック
                    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
                        const doc = data[google.picker.Response.DOCUMENTS][0];
                        chosenFileId = doc.id;
                        localStorage.setItem('lastUsedManualFileId', chosenFileId); // 選択されたファイルを保存
                        currentManualsFileId = chosenFileId; // グローバル変数も更新
                        document.getElementById('file-status').textContent = `選択されたファイル: ${doc.name}`;
                        
                        // ファイルが選択されたら、改めてファイルの内容を読み込む
                        fetchFileContent(chosenFileId);
                    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
                        document.getElementById('file-status').textContent = 'ファイルの選択がキャンセルされました。';
                        console.log('Picker was canceled.');
                    }
                })
                .build();
            picker.setVisible(true);
            return; // Picker が開かれるので、この関数はここで一度終了
        }

        if (chosenFileId) {
            await fetchFileContent(chosenFileId);
        }

    } catch (err) {
        console.error('Google Driveからのファイルの読み込み中にエラーが発生しました:', err);
        alert('Google Driveからのファイルの読み込みに失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの読み込みに失敗しました。';
    }
}


// ファイルの内容を実際にDriveからフェッチするヘルパー関数
async function fetchFileContent(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media' // ファイルの内容を取得
        });
        manuals = JSON.parse(response.body);
        localStorage.setItem('manuals', JSON.stringify(manuals));
        nextManualId = manuals.length > 0 ? Math.max(...manuals.map(m => m.id)) + 1 : 1;
        renderManuals();
        document.getElementById('file-status').textContent = `ファイル読み込み済み (ID: ${fileId})`;
        alert('マニュアルをGoogle Driveから読み込みました。');
    } catch (err) {
        console.error('ファイルのコンテンツの取得中にエラーが発生しました:', err);
        alert('ファイルのコンテンツの取得に失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルのコンテンツの取得に失敗しました。';
    }
}


// マニュアルデータをGoogle Driveに保存する関数
async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = currentManualsFileId || localStorage.getItem('lastUsedManualFileId'); // 現在のファイルIDを優先

        if (!fileId) { // ファイルIDがない場合のみ、Drive内を検索して既存ファイルを探す
            console.log('既存のファイルIDがないか、新規作成。Drive内を検索します。');
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
            'mimeType': mimeType,
        };

        let requestOptions;
        if (fileId) {
            // 既存ファイルを更新
            requestOptions = {
                'path': `/upload/drive/v3/files/${fileId}`,
                'method': 'PATCH',
                'params': { 'uploadType': 'multipart' },
                'headers': {
                    'Content-Type': 'application/json'
                },
                'body': content, // ファイルの中身を直接bodyに指定
            };
            // PATCHリクエストの場合、マルチパートフォームデータは不要、Content-Typeをapplication/jsonにする
            requestOptions = {
                'path': `/upload/drive/v3/files/${fileId}?uploadType=media`, // uploadType=media を指定
                'method': 'PATCH',
                'headers': {
                    'Content-Type': mimeType // ファイルの内容のMIMEタイプ
                },
                'body': content,
            };
        } else {
            // 新規ファイルを作成
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: mimeType }));

            requestOptions = {
                'path': '/upload/drive/v3/files',
                'method': 'POST',
                'params': { 'uploadType': 'multipart' },
                'body': form,
            };
        }

        const response = await gapi.client.request(requestOptions);
        document.getElementById('file-status').textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        // 保存に成功したファイルのIDをローカルストレージに保存し、グローバル変数も更新
        localStorage.setItem('lastUsedManualFileId', response.result.id);
        currentManualsFileId = response.result.id;

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        localStorage.removeItem('lastUsedManualFileId');
        currentManualsFileId = null;
    }
}


// --- データの操作関数 ---
function saveManualsToLocalStorage() {
    localStorage.setItem('manuals', JSON.stringify(manuals));
}

function loadManualsFromLocalStorage() {
    const storedManuals = localStorage.getItem('manuals');
    if (storedManuals) {
        manuals = JSON.parse(storedManuals);
        if (manuals.length > 0) {
            nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
        } else {
            nextManualId = 1;
        }
    }
}

// --- UI操作関数 ---
function renderManuals() {
    // 既存のコンテンツをクリア
    manualListDiv.innerHTML = ''; 
    manualListDiv.classList.remove('hidden'); // リストを表示
    manualDetailContainer.classList.add('hidden'); // 詳細を非表示
    manualFormContainer.classList.add('hidden'); // フォームを非表示

    // フィルタリングと検索
    const filteredManuals = manuals.filter(manual => {
        const matchesLadder = (currentFilterLadder === 'all' || manual.ladder === currentFilterLadder);
        const matchesSearch = manual.title.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
                              manual.body.toLowerCase().includes(currentSearchTerm.toLowerCase());
        return matchesLadder && matchesSearch;
    });

    if (filteredManuals.length === 0) {
        manualListDiv.innerHTML = '<p>表示するマニュアルがありません。</p>';
        return;
    }

    filteredManuals.forEach(manual => {
        const manualItem = document.createElement('div');
        manualItem.classList.add('manual-item');
        manualItem.innerHTML = `
            <h3>${manual.title}</h3>
            <p>ラダー分類: ${manual.ladder}</p>
            <button class="view-button" data-id="${manual.id}">表示</button>
        `;
        manualListDiv.appendChild(manualItem);
    });

    // 表示ボタンのイベントリスナーを追加
    document.querySelectorAll('.view-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const manualId = parseInt(event.target.dataset.id);
            showManualDetail(manualId);
        });
    });
    
    document.getElementById('current-ladder-title').textContent = 
        currentFilterLadder === 'all' ? 'すべてのマニュアル' : `ラダー ${currentFilterLadder.replace('ladder', '')} のマニュアル`;

}

function showManualDetail(id) {
    const manual = manuals.find(m => m.id === id);
    if (!manual) return;

    document.getElementById('detail-manual-title').textContent = manual.title;
    document.getElementById('detail-manual-body').innerHTML = manual.body.replace(/\n/g, '<br>'); // 改行を<br>に変換
    document.getElementById('detail-manual-ladder').textContent = manual.ladder;

    editButton.dataset.id = id; // 編集ボタンにIDをセット
    deleteButton.dataset.id = id; // 削除ボタンにIDをセット

    manualListDiv.classList.add('hidden');
    manualFormContainer.classList.add('hidden');
    manualDetailContainer.classList.remove('hidden');
}

function showNewManualForm() {
    document.getElementById('form-title').textContent = '新規登録';
    manualForm.reset();
    document.getElementById('manual-id').value = '';
    manualListDiv.classList.add('hidden');
    manualDetailContainer.classList.add('hidden');
    manualFormContainer.classList.remove('hidden');
}

function showEditManualForm(id) {
    const manual = manuals.find(m => m.id === parseInt(id));
    if (!manual) return;

    document.getElementById('form-title').textContent = '編集';
    document.getElementById('manual-id').value = manual.id;
    document.getElementById('manual-title').value = manual.title;
    document.getElementById('manual-body').value = manual.body;
    document.getElementById('manual-ladder').value = manual.ladder;

    manualListDiv.classList.add('hidden');
    manualDetailContainer.classList.add('hidden');
    manualFormContainer.classList.remove('hidden');
}

function saveManual(event) {
    event.preventDefault(); // フォームのデフォルト送信を防止

    const id = document.getElementById('manual-id').value;
    const title = document.getElementById('manual-title').value;
    const body = document.getElementById('manual-body').value;
    const ladder = document.getElementById('manual-ladder').value;

    if (id) {
        // 既存のマニュアルを更新
        const index = manuals.findIndex(m => m.id === parseInt(id));
        if (index !== -1) {
            manuals[index] = { id: parseInt(id), title, body, ladder };
        }
    } else {
        // 新しいマニュアルを追加
        manuals.push({ id: nextManualId++, title, body, ladder });
    }
    saveManualsToLocalStorage();
    renderManuals(); // 一覧表示に戻る
}

function deleteManual(id) {
    if (confirm('このマニュアルを削除してもよろしいですか？')) {
        manuals = manuals.filter(m => m.id !== parseInt(id));
        saveManualsToLocalStorage();
        renderManuals(); // 一覧表示に戻る
    }
}

function cancelForm() {
    renderManuals(); // フォームをキャンセルして一覧表示に戻る
}


// --- イベントリスナーの初期設定 ---
document.addEventListener('DOMContentLoaded', () => {
    loadFromDriveButton = document.getElementById('load-from-drive-button');
    saveToDriveButton = document.getElementById('save-to-drive-button');
    fileStatus = document.getElementById('file-status');

    loadManualsFromLocalStorage();
    renderManuals();

    // 検索ボックスのイベントリスナー
    searchInput.addEventListener('input', renderManuals);

    // 各ボタンのイベントリスナー
    document.getElementById('new-manual-button').addEventListener('click', showNewManualForm); // 関数名を修正
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
    loadFromDriveButton.addEventListener('click', handleAuthClick);
    saveToDriveButton.addEventListener('click', handleAuthClick);

    // 初期のボタン状態を設定（API初期化までは無効）
    loadFromDriveButton.disabled = true;
    saveToDriveButton.disabled = true;
});
