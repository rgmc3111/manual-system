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
const manualList = document.getElementById('manual-list');
const manualFormSection = document.getElementById('manual-form-section');
const manualForm = document.getElementById('manual-form');
const manualDetailSection = document.getElementById('manual-detail-section');
const manualDetailTitle = document.getElementById('manual-detail-title');
const manualDetailBody = document.getElementById('manual-detail-body');
const manualDetailLadder = document.getElementById('manual-detail-ladder');
const formTitle = document.getElementById('form-title');
const manualIdInput = document.getElementById('manual-id');
const manualTitleInput = document.getElementById('manual-title');
const manualBodyInput = document.getElementById('manual-body');
const manualLadderSelect = document.getElementById('manual-ladder');
const searchInput = document.getElementById('search-input');

// Google Drive関連の要素の初期化（DOMContentLoadedで実行されるが、グローバルに参照できるようにここで宣言）
document.addEventListener('DOMContentLoaded', () => {
    loadFromDriveButton = document.getElementById('load-from-drive-button');
    saveToDriveButton = document.getElementById('save-to-drive-button');
    fileStatus = document.getElementById('file-status');

    // 初期状態ではGoogle Driveボタンを無効にする
    loadFromDriveButton.disabled = true;
    saveToDriveButton.disabled = true;

    // イベントリスナーの追加
    document.getElementById('new-manual-button').addEventListener('click', showNewManualForm);
    manualForm.addEventListener('submit', saveManual);
    document.getElementById('cancel-form-button').addEventListener('click', cancelForm);
    document.getElementById('back-to-list-button').addEventListener('click', () => displayManuals(currentFilterLadder, currentSearchTerm));

    // ナビゲーションアイテムのイベントリスナー
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.id !== 'new-manual-button') { // 新規登録ボタンは除く
            item.addEventListener('click', function() {
                const ladder = this.dataset.ladder;
                currentFilterLadder = ladder;
                renderManuals(); // フィルターを適用して再描画

                // activeクラスの切り替え
                document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
                this.classList.add('active');
            });
        }
    });

    // 検索ボックスのイベントリスナー
    searchInput.addEventListener('input', () => {
        currentSearchTerm = searchInput.value;
        renderManuals(); // 検索キーワードを適用して再描画
    });

    renderManuals(); // 初期表示
});

// Google APIクライアントライブラリの読み込み完了時に呼び出されるグローバル関数
function gapiLoaded() {
    console.log("gapiLoaded called.");
    gapi.load('client', initializeGapiClient); // 'client' ライブラリをロード
}

// Google Identity Services ライブラリの読み込み完了時に呼び出されるグローバル関数
function gisLoaded() {
    console.log("gisLoaded called.");
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 後で設定される
    });
    gisInited = true;
    enableDriveButtons(); // ボタンを有効化
}

async function initializeGapiClient() {
    console.log("Initializing GAPI client...");
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    console.log("GAPI client initialized.");
    enableDriveButtons(); // ボタンを有効化
}

// Google Drive関連ボタンの有効化
function enableDriveButtons() {
    if (gapiInited && gisInited) {
        if (loadFromDriveButton) loadFromDriveButton.disabled = false;
        if (saveToDriveButton) saveToDriveButton.disabled = false;
        console.log("Google Drive buttons enabled.");
    }
}

// 認証処理
function handleAuthClick() {
    if (tokenClient) {
        tokenClient.callback = async (resp) => {
            if (resp.error) {
                console.error('認証エラー:', resp.error);
                alert('Googleアカウントへの接続に失敗しました。');
                return;
            }
            console.log('認証成功:', resp);
            // 認証成功後、ファイルIDが設定されていればそれを使い、なければPickerを起動
            if (currentManualsFileId) {
                loadManualsFromDrive(currentManualsFileId);
            } else {
                createPicker(); // Picker APIをロードしてPickerを起動
            }
        };
        tokenClient.requestAccessToken();
    } else {
        alert('Google APIクライアントが初期化されていません。ページをリロードしてください。');
    }
}

// Google Picker APIをロードする（gisLoaded() とは別で、gapi.loadとは独立して呼び出す）
// HTML <script>タグで google.load('picker', '1', {'callback': createPicker}); で既にロードされているため、
// ここでは直接 createPicker を呼び出さない。
// createPicker関数はPicker APIのロード完了時にコールバックとして呼ばれる。

let pickerApiLoaded = false;
function createPicker() {
    pickerApiLoaded = true;
    console.log("Google Picker API loaded.");
    // Picker APIがロードされたら、ユーザーが「マニュアルを読み込む」ボタンを押した際にPickerが開かれるように
    // handleAuthClick 内で createPicker() を呼び出す代わりに、Picker Builderを直接使う
}


// Google Driveからマニュアルを読み込む処理
async function loadManualsFromDrive(fileId) {
    if (!gapiInited || !gisInited || !gapi.client.getToken()) {
        alert('Google Drive APIが認証されていません。再度「マニュアルを読み込む」をクリックしてください。');
        handleAuthClick(); // 認証プロセスを再開
        return;
    }

    try {
        if (!fileId) {
            console.warn("ファイルIDが指定されていません。Pickerを起動します。");
            showDrivePicker(); // ファイルIDがなければPickerを開く
            return;
        }

        fileStatus.textContent = 'ファイルを読み込み中...';
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media' // ファイルの内容をダウンロード
        });

        manuals = JSON.parse(response.body);
        saveManualsToLocalStorage();
        renderManuals();
        currentManualsFileId = fileId; // 読み込んだファイルのIDを保存
        localStorage.setItem('lastUsedManualFileId', fileId); // ローカルストレージにも保存
        fileStatus.textContent = `ファイル読み込み済み: ${fileId}`;
        alert('Google Driveからマニュアルを読み込みました。');

    } catch (error) {
        console.error('Google Driveからの読み込みエラー:', error);
        fileStatus.textContent = 'ファイルの読み込みに失敗しました。';
        alert('Google Driveからのマニュアルの読み込みに失敗しました。ファイルが存在しないか、アクセス権がありません。');
        // エラー時はファイルIDをクリア
        currentManualsFileId = null;
        localStorage.removeItem('lastUsedManualFileId');
    }
}

// Google Driveにマニュアルを保存する処理
async function saveManualsToDrive() {
    if (!gapiInited || !gisInited || !gapi.client.getToken()) {
        alert('Google Drive APIが認証されていません。再度「マニュアルを保存する」をクリックしてください。');
        handleAuthClick(); // 認証プロセスを再開
        return;
    }

    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        fileStatus.textContent = 'ファイルを保存中...';

        let fileMetadata = {
            'name': fileName,
            'mimeType': mimeType
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        let requestOptions = {
            'uploadType': 'multipart',
            'body': form
        };

        if (currentManualsFileId) {
            // 既存ファイルを更新
            requestOptions.path = `/upload/drive/v3/files/${currentManualsFileId}`;
            requestOptions.method = 'PATCH';
        } else {
            // 新規ファイル作成
            requestOptions.path = '/upload/drive/v3/files';
            requestOptions.method = 'POST';
        }

        const response = await gapi.client.request(requestOptions);
        currentManualsFileId = response.result.id; // 新しいファイルのIDを保存
        localStorage.setItem('lastUsedManualFileId', response.result.id); // ローカルストレージにも保存
        fileStatus.textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        fileStatus.textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        currentManualsFileId = null;
        localStorage.removeItem('lastUsedManualFileId');
    }
}

// Pickerを起動してファイルを選択させる関数
function showDrivePicker() {
    if (!pickerApiLoaded) {
        // Picker APIがまだロードされていない場合は、ロードしてからPickerを起動
        // このケースは本来起こらないはずだが、念のため
        console.warn("Picker API not yet loaded. Attempting to load and retry.");
        google.load('picker', '1', { 'callback': () => {
            pickerApiLoaded = true;
            buildPicker();
        }});
    } else {
        buildPicker();
    }

    function buildPicker() {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
            .setMimeTypes('application/json') // JSONファイルのみを表示
            .setSelectFoldersEnabled(false); // フォルダ選択を無効にする

        const picker = new google.picker.PickerBuilder()
            .addView(view)
            .setOAuthToken(gapi.client.getToken().access_token) // 認証トークンを設定
            .setDeveloperKey(API_KEY)
            .setCallback(pickerCallback)
            .build();
        picker.setVisible(true);
    }
}

// Pickerでのファイル選択後コールバック
function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        const fileId = doc.id;
        const fileName = doc.name;
        console.log(`Pickerで選択されたファイル: ${fileName} (ID: ${fileId})`);
        loadManualsFromDrive(fileId); // 選択されたファイルIDで読み込み
    } else if (data[google.picker.Response.ACTION] === google.picker.Action.CANCEL) {
        console.log("Pickerがキャンセルされました。");
        fileStatus.textContent = 'ファイルの選択がキャンセルされました。';
    }
}


// マニュアルをローカルストレージに保存
function saveManualsToLocalStorage() {
    localStorage.setItem('manuals', JSON.stringify(manuals));
    // nextManualId も保存しておくと、次回ロード時にIDの重複を防げる
    localStorage.setItem('nextManualId', nextManualId);
}

// ローカルストレージからマニュアルを読み込む (初期ロード時のみ)
function loadManualsFromLocalStorage() {
    const storedManuals = localStorage.getItem('manuals');
    if (storedManuals) {
        manuals = JSON.parse(storedManuals);
        // nextManualIdを最新のID + 1に設定
        nextManualId = manuals.length > 0 ? Math.max(...manuals.map(m => m.id)) + 1 : 1;
    }
    const storedFileId = localStorage.getItem('lastUsedManualFileId');
    if (storedFileId) {
        currentManualsFileId = storedFileId;
        fileStatus.textContent = `前回使用ファイル: ${currentManualsFileId.substring(0, 8)}...`; // 短縮表示
    }
}

// マニュアル一覧を表示
function renderManuals() {
    manualList.innerHTML = ''; // 一覧をクリア
    manualDetailSection.classList.add('hidden'); // 詳細を非表示
    manualFormSection.classList.add('hidden'); // フォームを非表示

    // フィルターと検索を適用
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
        const manualItem = document.createElement('li');
        manualItem.className = 'manual-item';
        manualItem.dataset.id = manual.id;

        const title = document.createElement('h3');
        title.textContent = manual.title;
        manualItem.appendChild(title);

        const bodyPreview = document.createElement('p');
        bodyPreview.textContent = manual.body.substring(0, 150) + (manual.body.length > 150 ? '...' : ''); // プレビュー
        manualItem.appendChild(bodyPreview);

        const manualActions = document.createElement('div');
        manualActions.className = 'manual-actions';

        // 表示ボタン
        const viewButton = document.createElement('button');
        viewButton.textContent = '表示';
        viewButton.className = 'view-button'; // クラス名を修正
        viewButton.dataset.id = manual.id;
        viewButton.addEventListener('click', (event) => showManualDetails(event.target.dataset.id));
        manualActions.appendChild(viewButton);

        // 編集ボタン
        const editButton = document.createElement('button');
        editButton.textContent = '編集';
        editButton.className = 'edit-button'; // クラス名を修正
        editButton.dataset.id = manual.id;
        editButton.addEventListener('click', (event) => showEditManualForm(event.target.dataset.id));
        manualActions.appendChild(editButton);

        // 削除ボタン
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '削除';
        deleteButton.className = 'delete-button'; // クラス名を修正
        deleteButton.dataset.id = manual.id;
        deleteButton.addEventListener('click', (event) => deleteManual(event.target.dataset.id));
        manualActions.appendChild(deleteButton);

        manualItem.appendChild(manualActions);
        manualList.appendChild(manualItem);
    });
}

// 新規マニュアル登録フォームの表示
function showNewManualForm() {
    manualFormSection.classList.remove('hidden');
    manualList.innerHTML = ''; // 一覧を非表示にする代わりにクリア
    manualDetailSection.classList.add('hidden'); // 詳細も非表示

    formTitle.textContent = '新規登録';
    manualIdInput.value = '';
    manualTitleInput.value = '';
    manualBodyInput.value = '';
    manualLadderSelect.value = 'all'; // デフォルト値を設定
}

// マニュアルの保存（新規作成または編集）
function saveManual(event) {
    event.preventDefault(); // フォームのデフォルト送信を防止

    const id = manualIdInput.value ? parseInt(manualIdInput.value) : null;
    const title = manualTitleInput.value;
    const body = manualBodyInput.value;
    const ladder = manualLadderSelect.value;

    if (id) {
        // 既存のマニュアルを編集
        const index = manuals.findIndex(manual => manual.id === id);
        if (index !== -1) {
            manuals[index] = { id, title, body, ladder };
            alert('マニュアルを更新しました！');
        }
    } else {
        // 新しいマニュアルを作成
        const newManual = {
            id: nextManualId++,
            title,
            body,
            ladder
        };
        manuals.push(newManual);
        alert('新しいマニュアルを登録しました！');
    }

    saveManualsToLocalStorage(); // 保存
    renderManuals(); // リストを再表示
    cancelForm(); // フォームを非表示に
}

// フォームのキャンセル
function cancelForm() {
    manualFormSection.classList.add('hidden');
    manualForm.reset(); // フォームをリセット
    renderManuals(); // 一覧を再表示
}

// マニュアルの詳細表示
function showManualDetails(id) {
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
        renderManuals(); // リストを再表示
        // もし詳細表示中に削除されたら、詳細表示を隠す
        if (!manualDetailSection.classList.contains('hidden')) {
            manualDetailSection.classList.add('hidden');
        }
    }
}

// 初期データの読み込みと表示
loadManualsFromLocalStorage();
renderManuals();
