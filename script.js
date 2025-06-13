// --- Google API 関連の定数（グローバルスコープ） ---
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBd1ecDNjPc7qKTad4mA0buKBm6PG7xAlc';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// --- グローバル変数 ---
let gapiInited = false;
let gisInited = false;
let tokenClient;
// currentManualsFileId の初期値はローカルストレージから読み込む
let currentManualsFileId = localStorage.getItem('manualsFileId') || null;

let loadFromDriveButton;
let saveToDriveButton;
let fileStatus;

// DOMContentLoaded イベントリスナーの開始
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const navItems = document.querySelectorAll('.nav-item');
    const newManualButton = document.getElementById('new-manual-button');
    const searchInput = document.getElementById('search-input');

    const mainContentDiv = document.getElementById('main-content');
    const contentListDiv = document.getElementById('content-list');
    const contentDetailDiv = document.getElementById('content-detail');
    const manualFormDiv = document.getElementById('manual-form-div');

    const manualIdInput = document.getElementById('manual-id');
    const manualTitleInput = document.getElementById('manual-title');
    const manualBodyTextarea = document.getElementById('manual-body');
    const manualLadderSelect = document.getElementById('manual-ladder');
    const saveManualButton = document.getElementById('save-manual-button');
    const cancelFormButton = document.getElementById('cancel-form-button');

    const formTitle = document.getElementById('form-title');

    loadFromDriveButton = document.getElementById('load-from-drive-button');
    saveToDriveButton = document.getElementById('save-to-drive-button');
    fileStatus = document.getElementById('file-status');

    // マニュアルデータ (グローバル変数として定義)
    let manuals = [];
    let currentSelectedLadder = 'all'; // 現在選択されているラダー分類

    // 初期表示設定
    showContentList();
    loadManuals(); // ローカルストレージからマニュアルを読み込む

    // --- イベントリスナーの登録 ---

    // ナビゲーションアイテムのクリックイベント
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            currentSelectedLadder = item.dataset.ladder || 'all';
            displayManuals(manuals, currentSelectedLadder);
            showContentList(); // ナビゲーションクリックでリストに戻る
            // 新規登録ボタンがクリックされた場合は、activeクラスを保持しない
            if (item.id === 'new-manual-button') {
                item.classList.remove('active');
            }
        });
    });

    // 新規登録ボタンのクリックイベント
    newManualButton.addEventListener('click', () => {
        resetForm();
        formTitle.textContent = '新規登録';
        showForm();
        // 新規登録ボタンがクリックされたときは、他のnav-itemのactiveを解除
        navItems.forEach(nav => nav.classList.remove('active'));
        // 新規登録ボタン自身にはactiveクラスを付けない
        newManualButton.classList.remove('active');
    });


    // 検索入力の変更イベント
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        const filteredManuals = manuals.filter(manual =>
            manual.title.toLowerCase().includes(query) ||
            manual.body.toLowerCase().includes(query)
        );
        displayManuals(filteredManuals, currentSelectedLadder); // 検索結果を現在のラダー分類で表示
    });

    // フォームの送信イベント (保存)
    document.getElementById('manual-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveManual();
    });

    // フォームのキャンセルボタン
    cancelFormButton.addEventListener('click', () => {
        showContentList();
        displayManuals(manuals, currentSelectedLadder); // キャンセルしたら現在のラダーでリストを再表示
    });

    // --- Google Drive連携ボタンのイベントリスナー ---
    loadFromDriveButton.addEventListener('click', async () => {
        console.log("[loadFromDriveButton] clicked. Initiating auth check.");
        // 認証を試み、認証が完了するまで待つ
        const authSuccess = await handleAuthClick();

        if (authSuccess && gapi.client.getToken()) {
            console.log("[loadFromDriveButton] Authentication successful. Checking file ID.");
            if (currentManualsFileId) {
                // 既にファイルIDがある場合、確認ダイアログ
                console.log(`[loadFromDriveButton] currentManualsFileId exists: ${currentManualsFileId}. Prompting user.`);
                if (confirm(`以前使用したファイル (ID: ${currentManualsFileId}) を読み込みますか？\n「キャンセル」で別のファイルを選択できます。`)) {
                    // ここでロードを試みるが、失敗した場合は loadManualsFromDrive 内で Picker が自動的に開かれるようにする
                    await loadManualsFromDrive(currentManualsFileId);
                } else {
                    console.log("[loadFromDriveButton] User chose to select another file. Opening Picker.");
                    // ユーザーが「キャンセル」を選んだ場合、Pickerを開く
                    createPicker();
                }
            } else {
                // ファイルIDがない場合はPickerを直接開く
                console.log("[loadFromDriveButton] No currentManualsFileId. Opening Picker directly.");
                createPicker();
            }
        } else {
            console.log("[loadFromDriveButton] Authentication failed or not granted. Cannot proceed with Drive actions.");
            alert("Google Driveへの接続が必要です。もう一度『マニュアルを読み込む』ボタンをクリックして認証を完了してください。");
            fileStatus.textContent = "Google Driveに接続していません。";
        }
    });


    saveToDriveButton.addEventListener('click', async () => {
        console.log("[saveToDriveButton] clicked. Initiating auth check.");
        // 認証を試み、認証が完了するまで待つ
        const authSuccess = await handleAuthClick();

        if (authSuccess && gapi.client.getToken()) {
            console.log("[saveToDriveButton] Authentication successful. Saving manuals to Drive.");
            await saveManualsToDrive();
        } else {
            console.log("[saveToDriveButton] Authentication failed or not granted. Cannot proceed with Drive actions.");
            alert("Google Driveへの接続が必要です。もう一度『マニュアルを保存』ボタンをクリックして認証を完了してください。");
            fileStatus.textContent = "Google Driveに接続していません。";
        }
    });


    // --- マニュアル表示・管理関数 ---

    // マニュアルをローカルストレージから読み込む
    function loadManuals() {
        const storedManuals = localStorage.getItem('manuals');
        if (storedManuals) {
            manuals = JSON.parse(storedManuals);
        } else {
            manuals = []; // データがない場合は空の配列で初期化
        }
        displayManuals(manuals, currentSelectedLadder);
    }

    // マニュアルをローカルストレージに保存する
    function saveManuals() {
        localStorage.setItem('manuals', JSON.stringify(manuals));
    }

    // マニュアルのリスト表示
    function displayManuals(manualsToDisplay, filterLadder = 'all') {
        contentListDiv.innerHTML = '';
        let filteredCount = 0; // フィルタリングされたマニュアルの数をカウント

        manualsToDisplay.forEach(manual => {
            if (filterLadder === 'all' || manual.ladder === filterLadder) {
                filteredCount++;
                const manualItem = document.createElement('div');
                manualItem.classList.add('manual-item');
                manualItem.innerHTML = `
                    <h3>${manual.title}</h3>
                    <p class="manual-ladder-tag">${getLadderDisplayName(manual.ladder)}</p>
                    <div class="manual-actions">
                        <button class="view-button" data-id="${manual.id}"><i class="fas fa-eye"></i></button>
                        <button class="edit-button" data-id="${manual.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-button" data-id="${manual.id}"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                contentListDiv.appendChild(manualItem);
            }
        });

        // フィルタリングされたマニュアルがない場合のメッセージ
        if (filteredCount === 0 && searchInput.value === '') {
            contentListDiv.innerHTML = '<p class="no-manuals-message">まだマニュアルがありません。「新規登録」から作成してください。</p>';
        } else if (filteredCount === 0 && searchInput.value !== '') {
            contentListDiv.innerHTML = '<p class="no-manuals-message">検索条件に一致するマニュアルは見つかりませんでした。</p>';
        }


        // 各ボタンにイベントリスナーを追加
        document.querySelectorAll('.view-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                viewManual(id);
            });
        });

        document.querySelectorAll('.edit-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                editManual(id);
            });
        });

        document.querySelectorAll('.delete-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                deleteManual(id);
            });
        });
    }

    // ラダー分類の表示名を返すヘルパー関数
    function getLadderDisplayName(ladderValue) {
        switch (ladderValue) {
            case 'ladder1': return 'ラダー1';
            case 'ladder2': return 'ラダー2';
            case 'ladder3': return 'ラダー3';
            case 'ladder4': return 'ラダー4';
            case 'ladder5': return 'ラダー5';
            case 'all': return 'すべて（分類なし）';
            default: return '未分類';
        }
    }


    // マニュアルの保存
    function saveManual() {
        const id = manualIdInput.value;
        const title = manualTitleInput.value;
        const body = manualBodyTextarea.value;
        const ladder = manualLadderSelect.value;
        const timestamp = new Date().toISOString(); // ISO 8601形式でタイムスタンプを保存

        if (id) {
            // 既存のマニュアルを更新
            const index = manuals.findIndex(m => m.id === id);
            if (index !== -1) {
                manuals[index] = { ...manuals[index], title, body, ladder, updated_at: timestamp };
                alert('マニュアルが更新されました！');
            }
        } else {
            // 新しいマニュアルを追加
            const newManual = {
                id: crypto.randomUUID(), // ユニークなIDを生成
                title,
                body,
                ladder,
                created_at: timestamp,
                updated_at: timestamp
            };
            manuals.push(newManual);
            alert('新しいマニュアルが登録されました！');
        }
        saveManuals();
        displayManuals(manuals, currentSelectedLadder); // 保存後に現在のラダー分類でリストを再表示
        showContentList(); // 保存後リストに戻る
    }

    // マニュアルの表示 (詳細)
    function viewManual(id) {
        const manual = manuals.find(m => m.id === id);
        if (manual) {
            contentDetailDiv.innerHTML = `
                <h2>${manual.title}</h2>
                <p class="manual-ladder-tag">${getLadderDisplayName(manual.ladder)}</p>
                <div class="manual-body-content">${manual.body.replace(/\n/g, '<br>')}</div>
                <p class="timestamp">作成日時: ${new Date(manual.created_at).toLocaleString()}</p>
                <p class="timestamp">最終更新: ${new Date(manual.updated_at).toLocaleString()}</p>
                <div class="detail-actions">
                    <button id="edit-detail-button" data-id="${manual.id}"><i class="fas fa-edit"></i> 編集</button>
                    <button id="delete-detail-button" data-id="${manual.id}"><i class="fas fa-trash-alt"></i> 削除</button>
                    <button id="back-to-list-button"><i class="fas fa-arrow-alt-circle-left"></i> リストに戻る</button>
                </div>
            `;
            showContentDetail();

            // 詳細表示画面からの編集・削除・戻るボタン
            document.getElementById('edit-detail-button').addEventListener('click', (e) => {
                editManual(e.currentTarget.dataset.id);
            });
            document.getElementById('delete-detail-button').addEventListener('click', (e) => {
                deleteManual(e.currentTarget.dataset.id);
            });
            document.getElementById('back-to-list-button').addEventListener('click', () => {
                showContentList();
                displayManuals(manuals, currentSelectedLadder);
            });
        }
    }

    // マニュアルの編集
    function editManual(id) {
        const manual = manuals.find(m => m.id === id);
        if (manual) {
            manualIdInput.value = manual.id;
            manualTitleInput.value = manual.title;
            manualBodyTextarea.value = manual.body;
            manualLadderSelect.value = manual.ladder;
            formTitle.textContent = 'マニュアル編集';
            showForm();
        }
    }

    // マニュアルの削除
    function deleteManual(id) {
        if (confirm('本当にこのマニュアルを削除しますか？')) {
            manuals = manuals.filter(m => m.id !== id);
            saveManuals();
            displayManuals(manuals, currentSelectedLadder);
            showContentList(); // 削除後リストに戻る
            alert('マニュアルが削除されました。');
        }
    }

    // フォームのリセット
    function resetForm() {
        manualIdInput.value = '';
        manualTitleInput.value = '';
        manualBodyTextarea.value = '';
        manualLadderSelect.value = 'all'; // デフォルト値を「すべて（分類なし）」に設定
    }

    // --- 画面表示切り替え関数 ---
    function showContentList() {
        contentListDiv.classList.remove('hidden');
        contentDetailDiv.classList.add('hidden');
        manualFormDiv.classList.add('hidden');
    }

    function showContentDetail() {
        contentListDiv.classList.add('hidden');
        contentDetailDiv.classList.remove('hidden');
        manualFormDiv.classList.add('hidden');
    }

    function showForm() {
        contentListDiv.classList.add('hidden');
        contentDetailDiv.classList.add('hidden');
        manualFormDiv.classList.remove('hidden');
    }
});


// --- Google API 関連の関数 ---

// GAPIクライアントライブラリが読み込まれたときに呼び出される
function gapiLoaded() {
    console.log("[gapiLoaded] GAPI client loaded.");
    gapi.load('client:picker', initializeGapiClient); // pickerライブラリもロード
}

// GAPIクライアントの初期化
async function initializeGapiClient() {
    console.log("[initializeGapiClient] Initializing GAPI client...");
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    console.log("[initializeGapiClient] GAPI client initialized.");
    maybeEnableButtons(); // 初期化が完了したらボタンを有効にするかチェック
}

// GISライブラリが読み込まれたときに呼び出される
function gisLoaded() {
    console.log("[gisLoaded] GIS client loaded.");
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // トークンが取得されたときに呼び出される関数は後で設定
    });
    gisInited = true;
    console.log("[gisLoaded] GIS client initialized.");
    maybeEnableButtons(); // 初期化が完了したらボタンを有効にするかチェック
}

// 認証ハンドラ
async function handleAuthClick() {
    console.log("[handleAuthClick] Authentication attempt initiated.");
    if (!gapiInited || !gisInited) {
        console.warn("[handleAuthClick] GAPI or GIS not initialized yet. Cannot authenticate.");
        fileStatus.textContent = "Google Drive連携機能の読み込み中です...";
        alert("Google Drive連携機能がまだ読み込まれていません。しばらく待ってから再度お試しください。");
        return false;
    }

    return new Promise((resolve) => {
        tokenClient.callback = async (resp) => {
            console.log("[handleAuthClick] Token response received:", resp);
            if (resp.error) {
                console.error("[handleAuthClick] Authentication error:", resp.error);
                fileStatus.textContent = `認証エラー: ${resp.error}`;
                alert(`Google Driveへの認証に失敗しました: ${resp.error}`);
                resolve(false);
            } else {
                console.log("[handleAuthClick] Authentication successful.");
                localStorage.setItem('googleDriveAccessToken', resp.access_token); // トークンをローカルストレージに保存
                maybeEnableButtons();
                resolve(true);
            }
        };

        // 既にトークンがあれば、そのトークンで直接callbackを実行
        const existingToken = localStorage.getItem('googleDriveAccessToken');
        if (existingToken) {
            console.log("[handleAuthClick] Found existing token. Attempting to use it.");
            gapi.client.setToken({ access_token: existingToken });
            tokenClient.callback({ access_token: existingToken }); // callbackを直接呼び出す
            // すでに認証済みなので、resolve(true)
            resolve(true); // 即座に解決
            return;
        }

        // トークンがない場合、リクエスト
        console.log("[handleAuthClick] No existing token. Requesting new token.");
        if (tokenClient) {
            tokenClient.requestAccessToken();
        } else {
            console.error("[handleAuthClick] tokenClient is not initialized.");
            alert("Google認証クライアントの初期化に失敗しました。");
            resolve(false);
        }
    });
}


// ボタンの有効/無効を切り替える
function maybeEnableButtons() {
    console.log("[maybeEnableButtons] Checking button status.");
    if (gapiInited && gisInited && gapi.client.getToken()) {
        loadFromDriveButton.disabled = false;
        saveToDriveButton.disabled = false;
        console.log("[maybeEnableButtons] Buttons enabled.");
        if (currentManualsFileId) {
            fileStatus.textContent = `Google Driveに接続済み。選択中のファイル: ID ${currentManualsFileId.substring(0, 8)}...`;
            console.log(`[maybeEnableButtons] Current file ID loaded: ${currentManualsFileId}`);
        } else {
            fileStatus.textContent = "Google Driveに接続済み。現在、マニュアルファイルが選択されていません。「マニュアルを読み込む」ボタンから既存ファイルを選択するか、新規作成してください。";
            console.log("[maybeEnableButtons] No currentManualsFileId. User needs to select or create a file.");
            // ここで createPicker() を自動的に呼び出すのは避ける。
            // ユーザーが「マニュアルを読み込む」ボタンをクリックしたときにPickerを開くようにする。
        }
    } else {
        loadFromDriveButton.disabled = true;
        saveToDriveButton.disabled = true;
        fileStatus.textContent = "Google Driveに接続していません。";
        console.log("[maybeEnableButtons] Buttons disabled.");
    }
}


// Pickerを生成する (ユーザーがファイルを選択または新規作成できるようにするCallbackとして呼び出される)
function createPicker() {
    console.log("[createPicker] called.");
    // Pickerを生成する前に、認証が完了しているか再度確認
    if (!gapiInited || !gapi.client.getToken()) {
        fileStatus.textContent = "Pickerを開くにはGoogle Driveへの認証が必要です。";
        console.warn("[createPicker] Cannot create picker: Not authenticated or GAPI client not initialized.");
        alert("Pickerを開くにはGoogle Driveへの認証が必要です。");
        // 認証を促す
        handleAuthClick().then(success => {
            if (success) {
                console.log("[createPicker] Auth successful after prompt, attempting to create picker again.");
                // 認証成功後、再度Picker作成を試みる（少し遅延させて安定させる）
                setTimeout(createPicker, 500);
            }
        });
        return;
    }

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json'); // JSONファイルのみを表示

    // ファイル名で絞り込みたい場合 (オプション)
    // view.setQuery('manual_data.json'); // これを有効にすると、ユーザーは manual_data.json のみを検索できる

    const picker = new google.picker.PickerBuilder()
        .setAppId(CLIENT_ID.split('.')[0])
        .setOAuthToken(gapi.client.getToken().access_token)
        .addView(view)
        .setDeveloperKey(API_KEY)
        .setCallback(pickerCallback)
        .build();

    picker.setVisible(true);
}

// Pickerのコールバック関数
async function pickerCallback(data) {
    console.log("[pickerCallback] Picker data received:", data);
    if (data.action === google.picker.Action.PICKED) {
        const file = data.docs[0];
        console.log("[pickerCallback] File picked:", file);
        currentManualsFileId = file.id;
        localStorage.setItem('manualsFileId', file.id);
        fileStatus.textContent = `Google Driveに接続済み。選択中のファイル: ID ${file.id.substring(0, 8)}...`;
        alert(`ファイル「${file.name}」が選択されました。\nこのファイルからマニュアルを読み込みます。`);
        await loadManualsFromDrive(file.id);
    } else if (data.action === google.picker.Action.CANCEL) {
        console.log("[pickerCallback] Picker canceled.");
        fileStatus.textContent = "Google Driveファイル選択がキャンセルされました。";
    }
}


// Google Driveからマニュアルを読み込む
async function loadManualsFromDrive(fileId) {
    console.log(`[loadManualsFromDrive] Loading manual from Drive with ID: ${fileId}`);
    fileStatus.textContent = `Google Driveからファイルを読み込み中...`;
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media' // ファイルの内容を取得
        });
        console.log("[loadManualsFromDrive] File content response:", response);
        const driveManuals = response.result; // resultにファイルの内容（JSONオブジェクト）が含まれる

        if (Array.isArray(driveManuals)) {
            manuals = driveManuals;
            saveManuals(); // ローカルストレージにも保存
            displayManuals(manuals, currentSelectedLadder);
            alert('Google Driveからマニュアルが正常に読み込まれました！');
            fileStatus.textContent = `Google Driveに接続済み。選択中のファイル: ID ${fileId.substring(0, 8)}...`;
        } else {
            console.error("[loadManualsFromDrive] Unexpected data format from Drive:", driveManuals);
            alert('Google Driveから読み込んだデータ形式が不正です。');
            fileStatus.textContent = "読み込みエラー: データ形式が不正です。";
            // 不正なデータの場合は、currentManualsFileIdをクリアしてPickerを再度開くかユーザーに促す
            currentManualsFileId = null;
            localStorage.removeItem('manualsFileId');
            createPicker(); // 不正な場合はPickerを再度開いて選択を促す
        }
    } catch (error) {
        console.error('[loadManualsFromDrive] Error loading manual from Drive:', error);
        fileStatus.textContent = `読み込みエラー: ${error.message || error.status}`;
        alert(`Google Driveからのマニュアル読み込みに失敗しました: ${error.message || error.status}`);
        // エラーが発生した場合、ファイルIDをクリアして再度選択できるようにする
        currentManualsFileId = null;
        localStorage.removeItem('manualsFileId');
        // Pickerを再度開いて選択を促す
        createPicker();
    }
}

// Google Driveにマニュアルを保存する
async function saveManualsToDrive() {
    console.log("[saveManualsToDrive] Saving manuals to Drive.");
    fileStatus.textContent = `Google Driveにファイルを保存中...`;
    try {
        const fileContent = JSON.stringify(manuals, null, 2); // 整形して保存
        const metadata = {
            'name': 'manual_data.json',
            'mimeType': 'application/json',
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('media', new Blob([fileContent], { type: 'application/json' }));

        let request;
        if (currentManualsFileId) {
            // 既存ファイルを更新
            console.log(`[saveManualsToDrive] Updating existing file: ${currentManualsFileId}`);
            request = gapi.client.request({
                path: '/upload/drive/v3/files/' + currentManualsFileId,
                method: 'PATCH',
                params: { uploadType: 'multipart' },
                headers: {
                    'Content-Type': 'multipart/related'
                },
                body: form
            });
        } else {
            // 新規ファイルを作成
            console.log("[saveManualsToDrive] Creating new file.");
            request = gapi.client.request({
                path: '/upload/drive/v3/files',
                method: 'POST',
                params: { uploadType: 'multipart' },
                headers: {
                    'Content-Type': 'multipart/related'
                },
                body: form
            });
        }

        const response = await request;
        console.log("[saveManualsToDrive] Save response:", response);

        // 新規作成時のみファイルIDを保存
        if (!currentManualsFileId && response.result.id) {
            currentManualsFileId = response.result.id;
            localStorage.setItem('manualsFileId', currentManualsFileId);
        }

        alert('Google Driveにマニュアルが正常に保存されました！');
        fileStatus.textContent = `Google Driveに接続済み。選択中のファイル: ID ${currentManualsFileId.substring(0, 8)}...`;

    } catch (error) {
        console.error('[saveManualsToDrive] Error saving manual to Drive:', error);
        fileStatus.textContent = `保存エラー: ${error.message || error.status}`;
        alert(`Google Driveへのマニュアル保存に失敗しました: ${error.message || error.status}`);
    }
}
