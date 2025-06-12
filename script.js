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

// DOM要素の参照
const manualList = document.getElementById('manual-list');
const manualFormSection = document.getElementById('manual-form-section');
const manualForm = document.getElementById('manual-form');
const manualIdInput = document.getElementById('manual-id');
const manualTitleInput = document.getElementById('manual-title');
const manualBodyInput = document.getElementById('manual-body');
const manualLadderSelect = document.getElementById('manual-ladder');
const formTitle = document.getElementById('form-title');
const searchInput = document.getElementById('search-input');
const manualDetailSection = document.getElementById('manual-detail-section');
const manualDetailTitle = document.getElementById('manual-detail-title');
const manualDetailBody = document.getElementById('manual-detail-body');
const manualDetailLadder = document.getElementById('manual-detail-ladder');
const backToListButton = document.getElementById('back-to-list-button');
const editButton = document.getElementById('edit-detail-button'); // 詳細画面の編集ボタン
const deleteButton = document.getElementById('delete-detail-button'); // 詳細画面の削除ボタン

// Google Drive関連のDOM要素の初期化 (DOMContentLoadedで確実に取得)
document.addEventListener('DOMContentLoaded', () => {
    loadFromDriveButton = document.getElementById('load-from-drive-button');
    saveToDriveButton = document.getElementById('save-to-drive-button');
    fileStatus = document.getElementById('file-status');

    // ローカルストレージから前回のファイルIDを読み込む
    const storedFileId = localStorage.getItem('lastUsedManualFileId');
    if (storedFileId) {
        currentManualsFileId = storedFileId;
        fileStatus.textContent = `ファイル読み込み済み (ID: ${currentManualsFileId.substring(0, 8)}...)`;
    }

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
    loadFromDriveButton.addEventListener('click', handleAuthClick); // 認証を促す
    saveToDriveButton.addEventListener('click', handleAuthClick);   // 認証を促す
});

// Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数
function gapiLoaded() {
    console.log("gapiLoaded called."); // デバッグ用
    gapi.load('client', initializeGapiClient); // 'client' ライブラリをロード
}

// Google Identity Services ライブラリの読み込み完了時に呼び出されるグローバル関数
function gisLoaded() {
    console.log("gisLoaded called."); // デバッグ用
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 後で設定される。即座に認証情報を取得しない
    });
    gisInited = true;
    maybeEnableButtons();
}

// gapiクライアントの初期化
async function initializeGapiClient() {
    console.log("initializeGapiClient called."); // デバッグ用
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

// 両方のライブラリが初期化されたらボタンを有効化する
function maybeEnableButtons() {
    console.log(`maybeEnableButtons: gapiInitialized=${gapiInited}, gisInitialized=${gisInited}`); // デバッグ用
    if (gapiInited && gisInited) {
        loadFromDriveButton.disabled = false;
        saveToDriveButton.disabled = false;
        console.log("Google Drive buttons enabled."); // デバッグ用
    }
}

/**
 * Prompt the user to select a Google Drive file.
 * The Google Picker API is used to allow users to select a file.
 */
function createPicker() {
    // Picker API がロードされたことを示すフラグ
    pickerInitialized = true; 
    console.log("Google Picker API loaded.");
}


// 認証フローを開始し、コールバック関数を決定する
function handleAuthClick(event) {
    // どのボタンがクリックされたかに基づいて、callback関数を切り替える
    if (event.target.id === 'load-from-drive-button') {
        tokenClient.callback = authorizeAndLoadFromDrive;
    } else if (event.target.id === 'save-to-drive-button') {
        tokenClient.callback = authorizeAndSaveToDrive;
    }
    
    // 認証トークンを要求
    if (gapi.client.getToken() === null) {
        // トークンがない場合は認証を要求
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        // 既にトークンがある場合は、直接コールバックを実行
        // ただし、スコープが変わった場合や、ユーザーが明示的に再認証したい場合は
        // revokeAndAuthorize() を呼び出すことも検討する
        tokenClient.callback(gapi.client.getToken());
    }
}


// Google Driveからマニュアルを読み込む関数
async function authorizeAndLoadFromDrive(resp) {
    if (resp.error) {
        // エラー処理（ユーザーがキャンセルした場合など）
        console.error('認証エラー:', resp.error);
        alert('Google Driveへのアクセスが許可されませんでした。');
        return;
    }

    try {
        // Picker API を使用してファイルを選択させる
        const view = new google.picker.View(google.picker.ViewId.DOCS);
        view.setMimeTypes('application/json'); // JSONファイルのみを表示
        const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(gapi.client.getToken().access_token) // 認証トークンを設定
            .setDeveloperKey(API_KEY)
            .setCallback(pickerCallback) // 選択後のコールバック関数
            .build();
        picker.setVisible(true);

    } catch (err) {
        console.error('Google Driveからの読み込み中にエラーが発生しました:', err);
        alert('Google Driveからのマニュアルの読み込みに失敗しました。');
        fileStatus.textContent = 'ファイルの読み込みに失敗しました。';
    }
}

async function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        currentManualsFileId = doc.id;
        fileStatus.textContent = `ファイル読み込み済み: ${doc.name} (ID: ${currentManualsFileId.substring(0, 8)}...)`;
        localStorage.setItem('lastUsedManualFileId', currentManualsFileId); // 選択されたIDを保存

        try {
            const response = await gapi.client.drive.files.get({
                fileId: currentManualsFileId,
                alt: 'media' // ファイルの内容を取得
            });
            manuals = JSON.parse(response.body);
            saveManualsToLocalStorage(); // ローカルストレージにも保存
            renderManuals();
            alert(`マニュアルをGoogle Driveから読み込みました: ${doc.name}`);
        } catch (err) {
            console.error('ファイルの取得中にエラーが発生しました:', err);
            alert('選択されたファイルの読み込みに失敗しました。');
            fileStatus.textContent = 'ファイルの読み込みに失敗しました。';
        }
    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log('Picker was canceled.');
        fileStatus.textContent = 'ファイル選択がキャンセルされました。';
    }
}


// Google Driveにマニュアルを保存する関数
async function authorizeAndSaveToDrive(resp) {
    if (resp.error) {
        console.error('認証エラー:', resp.error);
        alert('Google Driveへのアクセスが許可されませんでした。');
        return;
    }
    saveManualsToDrive();
}


async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = currentManualsFileId; // 現在読み込んでいる/保存しているファイルIDを優先

        // ファイルIDがない場合のみ、Drive内を検索して既存ファイルを探す
        if (!fileId) {
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
            'mimeType': mimeType,
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        const requestOptions = {
            path: `/upload/drive/v3/files/${fileId || ''}`, // ファイルIDがあれば更新、なければ新規作成
            method: fileId ? 'PATCH' : 'POST',
            params: {
                uploadType: 'multipart',
            },
            headers: {
                'Content-Type': 'multipart/related',
            },
            body: form,
        };

        const response = await gapi.client.request(requestOptions);
        fileStatus.textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id.substring(0, 8)}...)`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        // 保存に成功したファイルのIDをローカルストレージに保存する
        localStorage.setItem('lastUsedManualFileId', response.result.id);
        currentManualsFileId = response.result.id; // グローバル変数も更新

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        fileStatus.textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        localStorage.removeItem('lastUsedManualFileId');
        currentManualsFileId = null;
    }
}


// ローカルストレージからマニュアルデータを読み込む
function loadManualsFromLocalStorage() {
    const storedManuals = localStorage.getItem('manuals');
    if (storedManuals) {
        manuals = JSON.parse(storedManuals);
        if (manuals.length > 0) {
            nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
        }
    }
}

// ローカルストレージにマニュアルデータを保存する
function saveManualsToLocalStorage() {
    localStorage.setItem('manuals', JSON.stringify(manuals));
}

// マニュアル一覧を表示する
function renderManuals() {
    manualList.innerHTML = ''; // 一覧をクリア
    manualFormSection.classList.add('hidden'); // フォームを非表示
    manualDetailSection.classList.add('hidden'); // 詳細を非表示
    manualList.style.display = 'flex'; // リストを表示

    const filteredManuals = manuals.filter(manual => {
        const matchesLadder = (currentFilterLadder === 'all' || manual.ladder === currentFilterLadder);
        const matchesSearch = (manual.title.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
                               manual.body.toLowerCase().includes(currentSearchTerm.toLowerCase()));
        return matchesLadder && matchesSearch;
    });

    if (filteredManuals.length === 0) {
        manualList.innerHTML = '<p>表示するマニュアルがありません。</p>';
        return;
    }

    filteredManuals.forEach(manual => {
        const manualItem = document.createElement('div');
        manualItem.classList.add('manual-item');
        manualItem.innerHTML = `
            <h3>${manual.title}</h3>
            <div class="actions">
                <button class="view-button" data-id="${manual.id}">表示</button>
                <button class="edit-button" data-id="${manual.id}">編集</button>
                <button class="delete-button" data-id="${manual.id}">削除</button>
            </div>
        `;
        manualList.appendChild(manualItem);

        // 各ボタンにイベントリスナーを設定
        manualItem.querySelector('.view-button').addEventListener('click', (event) => {
            showManualDetail(event.target.dataset.id);
        });
        manualItem.querySelector('.edit-button').addEventListener('click', (event) => {
            showEditManualForm(event.target.dataset.id);
        });
        manualItem.querySelector('.delete-button').addEventListener('click', (event) => {
            deleteManual(event.target.dataset.id);
        });
    });
}

// 新規マニュアル作成フォームを表示
function addManual() {
    currentManualId = null; // 新規作成モード
    formTitle.textContent = '新規登録';
    manualForm.reset(); // フォームをリセット
    manualIdInput.value = '';
    manualList.style.display = 'none'; // リストを非表示
    manualDetailSection.classList.add('hidden'); // 詳細を非表示
    manualFormSection.classList.remove('hidden'); // フォームを表示
}

// マニュアルを保存
function saveManual(event) {
    event.preventDefault(); // フォームのデフォルト送信を防止

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
        alert('マニュアルを更新しました！');
    } else {
        // 新規マニュアルの追加
        manuals.push({ id: nextManualId++, title, body, ladder });
        alert('新しいマニュアルを登録しました！');
    }
    saveManualsToLocalStorage(); // 保存
    renderManuals(); // 一覧を再表示
}

// フォームをキャンセルして一覧に戻る
function cancelForm() {
    renderManuals(); // 一覧を再表示
}

// マニュアル詳細の表示
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
        renderManuals(); // 一覧を再表示
    }
}

// 新規マニュアルフォームを表示（showEditManualFormからも呼ばれるため、関数化）
function showNewManualForm() {
    currentManualId = null;
    formTitle.textContent = '新規登録';
    manualForm.reset();
    manualIdInput.value = '';
    manualList.style.display = 'none';
    manualDetailSection.classList.add('hidden');
    manualFormSection.classList.remove('hidden');
}
