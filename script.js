// script.js の先頭付近、定数定義の後に追記

// APIキーとクライアントIDは、あなたの実際の値に置き換えてください
const API_KEY = 'YOUR_API_KEY'; // あなたのAPIキー
const CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com'; // あなたのクライアントID
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.appfolder https://www.googleapis.com/auth/drive.file';

let tokenClient;
let googlePickerInitialized = false;
let gapiInitialized = false; // gapiクライアントの初期化状態を追跡するフラグ

// ... (existing code: manuals, currentManualId, nextManualId などはそのまま) ...
let manuals = []; // マニュアルデータを保持する配列
let currentManualId = null;
let nextManualId = 1;
// localStorageから既存のマニュアルデータを読み込む
if (localStorage.getItem('manuals')) {
    manuals = JSON.parse(localStorage.getItem('manuals'));
    if (manuals.length > 0) {
        nextManualId = Math.max(...manuals.map(m => m.id)) + 1;
    }
}
// スライダー関連の要素を定義
const slider = document.getElementById('manual-slider');
const sliderValue = document.getElementById('slider-value');

// グローバルスコープ（または適切なスコープ）に定義されていることを前提とします
let lastUsedFileId = localStorage.getItem('lastUsedManualFileId'); // ローカルストレージから前回のファイルIDを取得


// gapiがロードされたときに呼ばれる関数
function gapiLoaded() {
    console.log('gapi loaded.');
    gapi.load('client', initializeGapiClient);
}

// Google APIクライアントを初期化する関数
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    await gapi.client.load('drive', 'v3');
    gapiInitialized = true; // gapiが初期化されたことを示すフラグ
    console.log('Google API Client for Drive loaded and initialized.');
    checkBothApisLoaded();
}

// gisがロードされたときに呼ばれる関数
function gisLoaded() {
    console.log('gis loaded.');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                gapi.client.setToken(tokenResponse);
                document.getElementById('file-status').textContent = 'Google Driveに接続済み。';
                // ボタンの有効化
                document.getElementById('load-from-drive-button').disabled = false;
                document.getElementById('save-to-drive-button').disabled = false;
                console.log('Access token obtained and set.');

                // ここで自動読み込みを試みる (前回pickerCallbackでIDを保存していれば)
                if (lastUsedFileId) {
                    console.log(`前回使用したファイルID (${lastUsedFileId}) があります。自動的に読み込みを試みます。`);
                    loadManualFromFileId(lastUsedFileId);
                } else {
                    console.log('前回使用したファイルIDはありません。手動での読み込みを待機します。');
                }
            } else {
                console.error('アクセストークンの取得に失敗しました。');
                document.getElementById('file-status').textContent = 'Google Driveへの接続に失敗しました。';
                // ボタンの無効化
                document.getElementById('load-from-drive-button').disabled = true;
                document.getElementById('save-to-drive-button').disabled = true;
            }
        },
        error_callback: (err) => {
            console.error('GIS init error:', err);
            document.getElementById('file-status').textContent = 'Google Driveへの接続に失敗しました。(認証エラー)';
        }
    });
    console.log('Google Identity Servicesクライアントが初期化されました。');
    googlePickerInitialized = true; // gisが初期化されたことを示すフラグ
    checkBothApisLoaded();
}

// 両方のAPIがロードされたかチェックし、必要な初期化を行う関数
function checkBothApisLoaded() {
    if (gapiInitialized && googlePickerInitialized) {
        console.log('Both gapi and gis are loaded. All set up.');
        // ここで既にボタンのイベントリスナーが設定されていることを確認
        // initializeGapiClient() と gisLoaded() のコールバック内でボタンが有効化されるため、
        // ここで改めてイベントリスナーを設定する必要はありません。
    }
}

// 認証フローを開始し、読み込みボタンを有効化する関数
async function authorizeAndLoadFromDrive() {
    if (!gapiInitialized || !googlePickerInitialized) {
        alert('Google APIの初期化が完了していません。しばらくお待ちください。');
        return;
    }
    // オフラインアクセスが必要な場合は prompt: 'consent' を追加
    tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse);
            console.log('Access token obtained for loading.');
            createPicker(); // Pickerを開く
        } else {
            console.error('アクセストークンの取得に失敗しました。');
            alert('Google Driveへの接続に失敗しました。(認証エラー)');
        }
    };
    tokenClient.requestAccessToken({ prompt: 'consent' }); // 初回または権限変更時
}

// 認証フローを開始し、保存ボタンを有効化する関数
async function authorizeAndSaveToDrive() {
    if (!gapiInitialized || !googlePickerInitialized) {
        alert('Google APIの初期化が完了していません。しばらくお待ちください。');
        return;
    }
    tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
            gapi.client.setToken(tokenResponse);
            console.log('Access token obtained for saving.');
            saveManualsToDrive(); // 保存処理を開始
        } else {
            console.error('アクセストークンの取得に失敗しました。');
            alert('Google Driveへの接続に失敗しました。(認証エラー)');
        }
    };
    tokenClient.requestAccessToken({ prompt: 'consent' }); // 初回または権限変更時
}


// Google Picker API を使用してファイルを選択する関数
function createPicker() {
    if (!googlePickerInitialized) {
        alert('Google Picker APIの初期化が完了していません。しばらくお待ちください。');
        return;
    }

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json'); // JSONファイルのみを表示
    view.setQuery('manual_data.json'); // manual_data.json のみを検索結果に表示 (オプション)

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN) // ナビゲーションを非表示
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED) // 複数選択を許可しない (デフォルトで単一選択)
        .addView(view)
        .setOAuthToken(gapi.auth.getToken().access_token)
        .setDeveloperKey(API_KEY)
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
        document.getElementById('file-status').textContent = `ファイル選択済み: ${fileName} (ID: ${fileId})`;

        // ★★★ ここで選択されたファイルのIDをローカルストレージに保存する ★★★
        localStorage.setItem('lastUsedManualFileId', fileId);
        lastUsedFileId = fileId; // グローバル変数も更新

        loadManualFromFileId(fileId); // 読み込み処理を共通関数に
    }
}

// Google Driveから特定のファイルIDのマニュアルを読み込む関数
async function loadManualFromFileId(fileId) {
    if (!fileId) {
        console.warn("ファイルIDが指定されていません。");
        document.getElementById('file-status').textContent = 'ファイルが選択されていません。';
        return;
    }
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media', // ファイルの内容を取得
        });
        manuals = JSON.parse(response.body);
        localStorage.setItem('manuals', JSON.stringify(manuals));
        renderManuals();
        alert('マニュアルをGoogle Driveから読み込みました。');
        console.log('Manuals loaded from Drive:', manuals);
    } catch (err) {
        console.error('Google Driveからのファイルの読み込み中にエラーが発生しました:', err);
        alert('Google Driveからのファイルの読み込みに失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの読み込みに失敗しました。';
        // 読み込み失敗時は保存されたファイルIDをクリア
        localStorage.removeItem('lastUsedManualFileId');
        lastUsedFileId = null;
    }
}

// ... (saveManualsToDrive 関数は以前提供した内容と同じでOK) ...
// アップロードされているscript.jsの内容はsaveManualsToDrive関数から始まっていますが
// この新しい構造では、上記で定義された saveManualsToDrive 関数を使用してください。


// DOMContentLoaded イベントリスナー: ボタン以外の初期化処理
document.addEventListener('DOMContentLoaded', () => {
    loadManualsFromLocalStorage();
    renderManuals();

    // イベントリスナーのセットアップ
    document.getElementById('search-input').addEventListener('input', renderManuals);
    document.getElementById('add-manual-button').addEventListener('click', addManual); // 新規登録ボタン
    document.getElementById('save-manual-button').addEventListener('click', saveManual);
    document.getElementById('cancel-form-button').addEventListener('click', cancelForm);
    document.getElementById('back-to-list-button').addEventListener('click', backToList);

    // ナビゲーションアイテムのイベントリスナー
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const ladder = this.dataset.ladder;
            currentFilterLadder = ladder;
            renderManuals();

            // activeクラスの切り替え
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // スライダーのイベントリスナー
    slider.addEventListener('input', (e) => {
        const value = e.target.value;
        sliderValue.textContent = value;
        // マニュアルの並べ替え（ここでは仮に何もしない）
        // filterAndDisplayManuals();
    });

    // Google Drive関連のボタンのイベントリスナーは、
    // APIの初期化が完了した時点で gisLoaded() のコールバック内で設定されるため、
    // ここで重複して設定する必要はありません。
    // document.getElementById('load-from-drive-button').addEventListener('click', authorizeAndLoadFromDrive);
    // document.getElementById('save-to-drive-button').addEventListener('click', authorizeAndSaveToDrive);
});

// ... (renderManuals, addManual, saveManual, editManual, deleteManual, showDetail, cancelForm, backToList, loadManualsFromLocalStorage, saveManualsToLocalStorage など、その他の既存の関数はそのまま) ...
