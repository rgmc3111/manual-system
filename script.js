// --- Google API 関連の定数（グローバルスコープ） ---
const CLIENT_ID = '214885714842-oqkuk56bfrft1lb4upotd5aeui4di3hl.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBd1ecDNjPc7qKTad4mA0buKBm6PG7xAlc';
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

// DOMContentLoaded イベントリスナーの開始
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const navItems = document.querySelectorAll('.nav-item');
    const newManualButton = document.getElementById('new-manual-button');
    const searchInput = document.getElementById('search-input');

    const mainContentDiv = document.getElementById('main-content');
    const contentListDiv = document.getElementById('content-list');
    const contentDetailDiv = document.getElementById('content-detail');
    const detailTitle = document.getElementById('detail-title');
    const detailBody = document.getElementById('detail-body');
    const editButton = document.getElementById('edit-button');
    const deleteButton = document.getElementById('delete-button');
    const backToListButton = document.getElementById('back-to-list-button');

    const manualFormArea = document.getElementById('manual-form-area');
    const formTitle = document.getElementById('form-title');
    const manualForm = document.getElementById('manual-form');
    const manualIdInput = document.getElementById('manual-id');
    const manualTitleInput = document.getElementById('manual-title');
    const manualBodyInput = document.getElementById('manual-body');
    const manualLadderInput = document.getElementById('manual-ladder');
    const saveManualButton = document.getElementById('save-manual-button');
    const cancelFormButton = document.getElementById('cancel-form-button');

    // Google Drive関連のボタン要素の取得（グローバル変数に代入）
    loadFromDriveButton = document.getElementById('load-from-drive-button');
    saveToDriveButton = document.getElementById('save-to-drive-button');
    fileStatus = document.getElementById('file-status');

    // ローカルストレージからのデータ読み込み、または初期データ
    // Google Drive との連携を考慮し、初期化時にローカルストレージも使う
    let manuals = JSON.parse(localStorage.getItem('manuals')) || [];
    // 'order' プロパティがない場合は初期値を設定 (インデックス順)
    if (manuals.length > 0 && !manuals[0].hasOwnProperty('order')) {
        manuals = manuals.map((m, i) => ({ ...m, order: i }));
        localStorage.setItem('manuals', JSON.stringify(manuals));
    }

    let currentLadder = 'all'; // 現在選択されているラダー分類
    let currentSearchTerm = ''; // 現在の検索キーワード
    
    // --- Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数 ---
    // (これはグローバルスコープにあるのでDOMContentLoadedの外で定義)
    // function gapiLoaded() { /* 変更なし */ }
    // async function initializeGapiClient() { /* 変更なし */ }
    // function gisLoaded() { /* 変更なし */ }
    // function maybeEnableButtons() { /* 変更なし */ }


    // Pickerからのコールバック処理（DOMContentLoadedスコープ内に定義）
    async function pickerCallback(data) {
        if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS][0];
            const fileId = doc.id;
            const fileName = doc.name;
            currentManualsFileId = fileId;    

            fileStatus.textContent = `選択中のファイル: ${fileName}`;
            await loadManualsFromDrive(fileId);
        } else if (data[google.picker.Response.ACTION] == google.picker.Action.CANCEL) {
            fileStatus.textContent = "ファイルの選択がキャンセルされました。";
        }
    }

    // --- Google Drive からマニュアルを読み込む ---
    async function loadManualsFromDrive(fileId) {
        if (!gapi.client.getToken()) {
            console.warn("Attempted to load from Drive without authentication. Initiating auth.");
            await handleAuthClick(); // 認証を試みる
            if (!gapi.client.getToken()) { // 再度確認
                alert('Google Driveに接続されていません。');
                return;
            }
        }
        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media',    
            });
            manuals = response.result;    
            // 読み込んだマニュアルにorderプロパティがない場合は初期値を設定
            if (manuals.length > 0 && !manuals[0].hasOwnProperty('order')) {
                manuals = manuals.map((m, i) => ({ ...m, order: i }));
            }
            localStorage.setItem('manuals', JSON.stringify(manuals)); // ローカルストレージにも保存
            displayManuals(currentLadder, currentSearchTerm);
            alert('マニュアルをGoogle Driveから読み込みました。');
        } catch (err) {
            console.error('Error loading manuals from Drive:', err);
            alert('Google Driveからのマニュアル読み込みに失敗しました。\n' + (err.result?.error?.message || err.message));
            manuals = [];    
            localStorage.removeItem('manuals'); // エラー時はローカルストレージをクリア
            displayManuals(currentLadder, currentSearchTerm);
            fileStatus.textContent = "読み込みエラーが発生しました。";
        }
    }

    // --- Google Drive にマニュアルを保存する ---
    async function saveManualsToDrive() {
        if (!gapi.client.getToken()) {
            console.warn("Attempted to save to Drive without authentication. Initiating auth.");
            await handleAuthClick(); // 認証を試みる
            if (!gapi.client.getToken()) { // 再度確認
                alert('Google Driveに接続されていません。');
                return;
            }
        }

        const fileContent = JSON.stringify(manuals, null, 4);    
        const mimeType = 'application/json';

        try {
            if (currentManualsFileId) {
                // 既存ファイルを更新
                const boundary = '-------314159265358979323846';
                const delimiter = "\r\n--" + boundary + "\r\n";
                const closeDelimiter = "\r\n--" + boundary + "--";

                const multipartRequestBody =
                    delimiter +
                    'Content-Type: application/json\r\n\r\n' +
                    JSON.stringify({
                        name: 'manual_data.json',    
                        mimeType: mimeType
                    }) +
                    delimiter +
                    'Content-Type: ' + mimeType + '\r\n\r\n' +
                    fileContent +
                    closeDelimiter;

                await gapi.client.request({
                    path: '/upload/drive/v3/files/' + currentManualsFileId,
                    method: 'PATCH',
                    params: { uploadType: 'multipart' },
                    headers: {
                        'Content-Type': 'multipart/related; boundary="' + boundary + '"'
                    },
                    body: multipartRequestBody
                });
                alert('マニュアルをGoogle Drive上の既存ファイルに保存しました。');
            } else {
                // 新規ファイルを作成
                const fileMetadata = {
                    'name': 'manual_data.json',
                    'mimeType': mimeType
                };
                
                const response = await gapi.client.drive.files.create({
                    resource: fileMetadata,
                    media: {
                        mimeType: mimeType,
                        body: new Blob([fileContent], { type: mimeType })
                    },
                    fields: 'id'
                });
                currentManualsFileId = response.result.id;    
                fileStatus.textContent = `ファイル保存済み: manual_data.json (ID: ${currentManualsFileId})`;
                alert('マニュアルを新しいGoogle Driveファイルに保存しました。');
            }
        } catch (err) {
            console.error('Error saving manuals to Drive:', err);
            alert('Google Driveへのマニュアル保存に失敗しました。\n' + (err.result?.error?.message || err.message));
            fileStatus.textContent = "保存エラーが発生しました。";
        }
    }

    // マニュアル一覧を表示する関数
    function displayManuals(filterLadder, searchTerm = '') {
        contentListDiv.innerHTML = '';    
        const ul = document.createElement('ul');
        ul.id = 'manual-list-ul';    

        let filteredManuals = manuals.filter(manual => {
            const matchesLadder = filterLadder === 'all' || manual.ladder === filterLadder;
            const matchesSearch = searchTerm === '' ||
                                  manual.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  manual.body.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesLadder && matchesSearch;
        });

        filteredManuals.sort((a, b) => a.order - b.order);

        if (filteredManuals.length === 0) {
            ul.innerHTML = '<p>表示するマニュアルがありません。</p>';
        } else {
            filteredManuals.forEach(manual => {
                const li = document.createElement('li');
                li.dataset.id = manual.id;    

                const manualInfoDiv = document.createElement('div');
                manualInfoDiv.classList.add('manual-info');

                const titleSpan = document.createElement('span');
                titleSpan.classList.add('manual-title-item');
                titleSpan.textContent = manual.title;
                manualInfoDiv.appendChild(titleSpan);

                if (filterLadder === 'all' && manual.ladder && manual.ladder !== 'all') {
                    const ladderDisplaySpan = document.createElement('span');
                    ladderDisplaySpan.classList.add('manual-ladder-display');
                    const displayLadderText = manual.ladder.replace('ladder', 'ラダー');
                    ladderDisplaySpan.textContent = `[${displayLadderText}]`;
                    manualInfoDiv.appendChild(ladderDisplaySpan);
                }

                manualInfoDiv.addEventListener('click', () => showManualDetail(manual.id));    

                const sortButtonsDiv = document.createElement('div');
                sortButtonsDiv.classList.add('sort-buttons');

                const upButton = document.createElement('button');
                upButton.classList.add('sort-button', 'up');
                upButton.innerHTML = '<i class="fas fa-arrow-up"></i>';
                upButton.title = '上に移動';
                upButton.addEventListener('click', (e) => {
                    e.stopPropagation();    
                    moveManual(manual.id, -1);
                });

                const downButton = document.createElement('button');
                downButton.classList.add('sort-button', 'down');
                downButton.innerHTML = '<i class="fas fa-arrow-down"></i>';
                downButton.title = '下に移動';
                downButton.addEventListener('click', (e) => {
                    e.stopPropagation();    
                    moveManual(manual.id, 1);
                });

                sortButtonsDiv.appendChild(upButton);
                sortButtonsDiv.appendChild(downButton);

                li.appendChild(manualInfoDiv);
                li.appendChild(sortButtonsDiv);
                ul.appendChild(li);
            });
        }
        contentListDiv.appendChild(ul);

        mainContentDiv.classList.remove('hidden');
        contentListDiv.classList.remove('hidden');
        contentDetailDiv.classList.add('hidden');
        manualFormArea.classList.add('hidden');
    }

    // マニュアルの順序を入れ替える関数
    function moveManual(id, direction) {    
        let displayedManuals = manuals.filter(manual => {
            const matchesLadder = currentLadder === 'all' || manual.ladder === currentLadder;
            const matchesSearch = currentSearchTerm === '' ||
                                      manual.title.toLowerCase().includes(currentSearchTerm.toLowerCase()) ||
                                      manual.body.toLowerCase().includes(currentSearchTerm.toLowerCase());
            return matchesLadder && matchesSearch;
        }).sort((a, b) => a.order - b.order);    

        const currentManualIndexInDisplayed = displayedManuals.findIndex(m => m.id === id);
        if (currentManualIndexInDisplayed === -1) return;    

        const newIndexInDisplayed = currentManualIndexInDisplayed + direction;

        if (newIndexInDisplayed < 0 || newIndexInDisplayed >= displayedManuals.length) {
            return;
        }

        const [movedManual] = displayedManuals.splice(currentManualIndexInDisplayed, 1);
        displayedManuals.splice(newIndexInDisplayed, 0, movedManual);

        displayedManuals.forEach((m, i) => {
            const originalManual = manuals.find(om => om.id === m.id);
            if (originalManual) {
                originalManual.order = i;
            }
        });

        manuals.sort((a, b) => a.order - b.order);    

        localStorage.setItem('manuals', JSON.stringify(manuals)); // ローカルストレージに保存
        saveManualsToDrive(); // Google Drive に自動保存
        displayManuals(currentLadder, currentSearchTerm);
    }

    // マニュアル詳細を表示する関数
    function showManualDetail(id) {
        const manual = manuals.find(m => m.id === id);
        if (!manual) {
            alert('指定されたマニュアルが見つかりません。');
            displayManuals(currentLadder, currentSearchTerm);
            return;
        }

        detailTitle.textContent = manual.title;
        detailBody.textContent = manual.body;
        editButton.dataset.id = manual.id;
        deleteButton.dataset.id = manual.id;

        contentListDiv.classList.add('hidden');
        contentDetailDiv.classList.remove('hidden');
        mainContentDiv.classList.remove('hidden');
        manualFormArea.classList.add('hidden');
    }

    // マニュアルの保存（新規登録/編集）
    function saveManual(event) {
        event.preventDefault();

        const id = manualIdInput.value;
        const title = manualTitleInput.value.trim();
        const body = manualBodyInput.value.trim();
        const ladder = manualLadderInput.value;

        if (!title || !body) {
            alert('タイトルと本文は必須です。');
            return;
        }

        if (id) {    
            const index = manuals.findIndex(m => m.id === id);
            if (index !== -1) {
                manuals[index].title = title;
                manuals[index].body = body;
                manuals[index].ladder = ladder;
            }
        } else {    
            const newManual = {
                id: Date.now().toString(),    
                title,
                body,
                ladder,
                order: manuals.length > 0 ? Math.max(...manuals.map(m => m.order)) + 1 : 0
            };
            manuals.push(newManual);
        }

        localStorage.setItem('manuals', JSON.stringify(manuals)); // ローカルストレージに保存
        saveManualsToDrive(); // Google Drive に自動保存
        alert('マニュアルを保存しました。');
        displayManuals(currentLadder, currentSearchTerm);
    }

    // マニュアルの削除
    function deleteManual(id) {
        if (!confirm('本当にこのマニュアルを削除しますか？')) {
            return;
        }
        manuals = manuals.filter(m => m.id !== id);
        manuals.forEach((m, i) => m.order = i);    

        localStorage.setItem('manuals', JSON.stringify(manuals)); // ローカルストレージを更新
        saveManualsToDrive(); // Google Drive に自動保存
        alert('マニュアルを削除しました。');
        displayManuals(currentLadder, currentSearchTerm);
    }

    // フォーム表示と初期化（新規登録用）
    function showNewManualForm() {
        formTitle.textContent = '新規登録';
        manualIdInput.value = '';
        manualTitleInput.value = '';
        manualBodyInput.value = '';
        manualLadderInput.value = 'all';    

        mainContentDiv.classList.add('hidden');
        manualFormArea.classList.remove('hidden');
    }

    // フォーム表示と既存データ設定（編集用）
    function showEditManualForm(id) {
        const manualToEdit = manuals.find(m => m.id === id);
        if (!manualToEdit) {
            alert('編集するマニュアルが見つかりません。');
            displayManuals(currentLadder, currentSearchTerm);
            return;
        }
        formTitle.textContent = 'マニュアル編集';
        manualIdInput.value = manualToEdit.id;
        manualTitleInput.value = manualToEdit.title;
        manualBodyInput.value = manualToEdit.body;
        manualLadderInput.value = manualToEdit.ladder;

        mainContentDiv.classList.add('hidden');
        manualFormArea.classList.remove('hidden');
    }

    // --- イベントリスナー設定 ---

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            if (item.id === 'new-manual-button') {
                showNewManualForm();
            } else {
                currentLadder = item.dataset.ladder;
                currentSearchTerm = searchInput.value;
                displayManuals(currentLadder, currentSearchTerm);
            }
        });
    });

    backToListButton.addEventListener('click', () => {
        displayManuals(currentLadder, currentSearchTerm);
    });

    searchInput.addEventListener('input', () => {
        currentSearchTerm = searchInput.value;
        displayManuals(currentLadder, currentSearchTerm);
    });

    manualForm.addEventListener('submit', saveManual);

    cancelFormButton.addEventListener('click', () => {
        displayManuals(currentLadder, currentSearchTerm);
    });

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

    // Google Drive 関連のボタンイベント
    // クリック時にまず認証を試み、成功したらPickerを表示
    loadFromDriveButton.addEventListener('click', async () => {
        await handleAuthClick();
        if (gapi.client.getToken()) {
            createPicker(); // 認証が完了したらPickerを表示
        }
    });
    saveToDriveButton.addEventListener('click', saveManualsToDrive); // saveManualsToDrive内で認証を確認

    // 初期表示
    displayManuals('all');
}); // DOMContentLoaded の閉じタグ


// --- Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gapiLoaded() {
    console.log("gapiLoaded called."); // デバッグ用
    gapi.load('client', initializeGapiClient); // 'client' ライブラリのみロード
}

async function initializeGapiClient() {
    console.log("initializeGapiClient called."); // デバッグ用
    await gapi.client.init({
        apiKey: API_KEY,    
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    maybeEnableButtons();
}

// --- Google Identity Services JavaScriptライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gisLoaded() {
    console.log("gisLoaded called."); // デバッグ用
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                gapi.client.setToken(tokenResponse);
                gisInited = true;
                maybeEnableButtons();
                if (fileStatus) { 
                    fileStatus.textContent = "Google Driveに接続済み。マニュアルファイルを選択してください。";
                }
            } else {
                console.error('Failed to get access token:', tokenResponse);
                if (fileStatus) { 
                    fileStatus.textContent = "Google Driveへの接続に失敗しました。";
                }
            }
        },
    });
    gisInited = true;
    maybeEnableButtons();
}

// ボタンの有効化判定
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        // DOM要素がロードされているか確認
        if (loadFromDriveButton && saveToDriveButton && fileStatus) {
            loadFromDriveButton.disabled = false;
            saveToDriveButton.disabled = false;
            fileStatus.textContent = "Google Driveに接続していません。ボタンをクリックして接続してください。";    
        }
    }
}

// 認証フローを開始/確認
async function handleAuthClick() {
    if (!gisInited) {
        if (fileStatus) {
            fileStatus.textContent = "API初期化中...しばらくお待ちください。";
        }
        // gisLoadedが呼び出されるまで待機するが、タイムアウトも考慮すべき
        // ここでは簡易的にreturn
        return; 
    }
    // トークンがないか、有効期限が短い場合に新しいトークンを要求
    if (!gapi.client.getToken() || gapi.client.getToken().expires_in < 60) {    
        try {
            await tokenClient.requestAccessToken();
            // トークン取得成功後の処理はcallbackで実行される
        } catch (error) {
            console.error("Authentication failed:", error);
            if (fileStatus) {
                fileStatus.textContent = "Google Driveへの接続に失敗しました。";
            }
        }
    } else {
        if (fileStatus) {
            fileStatus.textContent = "Google Driveに接続済み。マニュアルファイルを選択してください。";
        }
    }
}

// Pickerインスタンスを構築する関数 (google.loadのcallbackとして呼び出される)
function createPicker() {
    console.log("createPicker called."); // デバッグ用
    // Pickerを表示する前に認証状態を再度確認
    if (!gapiInited || !gapi.client.getToken()) {
        if (fileStatus) {
            fileStatus.textContent = "Google Driveに接続していません。先に認証が必要です。";
        }
        // handleAuthClick(); // ここで認証を促すのではなく、ボタンクリック時に認証を完了させてからPickerを呼び出す
        return;
    }

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json'); // JSONファイルのみを表示

    const picker = new google.picker.PickerBuilder()
        .setAppId(CLIENT_ID.split('.')[0])    
        .setOAuthToken(gapi.client.getToken().access_token)
        .addView(view)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

// ★重要: google.load を DOMContentLoaded の外に移動 (Picker APIをロード) ★
// Google Visualization API と Picker API をロード
// これにより、DOMContentLoaded 待たずに Picker モジュールのロードが開始される
google.load('picker', '1', { 'callback': createPicker });
