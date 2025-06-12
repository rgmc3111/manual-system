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
    let manuals = JSON.parse(localStorage.getItem('manuals')) || [];
    // 'order' プロパティがない場合は初期値を設定 (インデックス順)
    if (manuals.length > 0 && !manuals[0].hasOwnProperty('order')) {
        manuals = manuals.map((m, i) => ({ ...m, order: i }));
        localStorage.setItem('manuals', JSON.stringify(manuals));
    }

    let currentLadder = 'all'; 
    let currentSearchTerm = ''; 
    
    // Pickerからのコールバック処理
    async function pickerCallback(data) {
        console.log("[pickerCallback] Picker data:", data);
        if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS][0];
            const fileId = doc.id;
            const fileName = doc.name;
            
            console.log(`[pickerCallback] File picked: ID=${fileId}, Name=${fileName}`);
            // Pickerで選択されたファイルのIDを currentManualsFileId に設定し、ローカルストレージにも保存
            currentManualsFileId = fileId;    
            localStorage.setItem('manualsFileId', currentManualsFileId); 

            fileStatus.textContent = `選択中のファイル: ${fileName}`;
            await loadManualsFromDrive(fileId); // Pickerで選択したIDを渡す
        } else if (data[google.picker.Response.ACTION] == google.picker.Action.CANCEL) {
            console.log("[pickerCallback] Picker cancelled.");
            fileStatus.textContent = "ファイルの選択がキャンセルされました。";
            alert("Google Driveからのマニュアル読み込みをキャンセルしました。"); // キャンセル時のアラート
            // Pickerキャンセル後も、現在の状態（おそらく空のリスト）を表示する
            displayManuals(currentLadder, currentSearchTerm);
        }
    }

    // --- Google Drive からマニュアルを読み込む ---
    async function loadManualsFromDrive(fileIdToLoad) {
        console.log(`[loadManualsFromDrive] called with fileIdToLoad: ${fileIdToLoad}, currentManualsFileId: ${currentManualsFileId}`);

        // 認証状態を再チェックし、必要であれば認証を促す
        if (!gapi.client.getToken()) {
            console.warn("[loadManualsFromDrive] Attempted to load from Drive without authentication. Initiating auth.");
            // 認証が完了するまで待つ
            const authSuccess = await handleAuthClick(); 
            if (!authSuccess || !gapi.client.getToken()) {
                alert('Google Driveに接続されていません。マニュアルの読み込みを続行できません。');
                fileStatus.textContent = "Google Driveに接続されていません。";
                console.error("[loadManualsFromDrive] Authentication failed or cancelled, cannot load.");
                return;
            }
        }
        
        // fileIdToLoad が指定されていない場合は currentManualsFileId を使用
        const targetFileId = fileIdToLoad || currentManualsFileId;

        if (!targetFileId) {
            console.log("[loadManualsFromDrive] No targetFileId found. Opening Picker for user selection.");
            fileStatus.textContent = "読み込むファイルが特定できません。マニュアルを読み込むボタンでファイルを選択してください。";
            createPicker(); // ファイルIDがない場合は直接Pickerを開く
            return;
        }

        console.log(`[loadManualsFromDrive] Attempting to load file with ID: ${targetFileId}`);

        try {
            const response = await gapi.client.drive.files.get({
                fileId: targetFileId,
                alt: 'media',    
            });
            console.log("[loadManualsFromDrive] Drive API response received:", response);

            // JSONパースが失敗する可能性があるためtry-catchで囲む
            try {
                // ここで response.body が期待通り文字列であることを確認
                if (typeof response.body !== 'string' || !response.body.trim()) {
                    console.warn("[loadManualsFromDrive] Response body is empty or not a string. Assuming invalid JSON.", response.body);
                    throw new Error("Empty or invalid JSON body from Drive.");
                }
                manuals = JSON.parse(response.body); // response.result ではなく response.body を使う
                console.log("[loadManualsFromDrive] JSON parsed successfully:", manuals);
            } catch (parseError) {
                console.error('[loadManualsFromDrive] Error parsing JSON from Drive:', parseError, 'Response body:', response.body);
                alert('Google Driveから読み込んだデータが不正な形式です。このファイルは利用できません。');
                manuals = []; // 不正な場合はデータをクリア
                // 不正なファイルを指定した場合は、currentManualsFileIdもクリアして再選択を促す
                currentManualsFileId = null;
                localStorage.removeItem('manualsFileId');
                displayManuals(currentLadder, currentSearchTerm);
                createPicker(); // 不正なファイルの場合もPickerを開いて再選択を促す
                return;
            }
            
            // 読み込んだマニュアルにorderプロパティがない場合は初期値を設定
            if (manuals.length > 0 && !manuals[0].hasOwnProperty('order')) {
                manuals = manuals.map((m, i) => ({ ...m, order: i }));
            }
            localStorage.setItem('manuals', JSON.stringify(manuals)); 
            displayManuals(currentLadder, currentSearchTerm);
            fileStatus.textContent = `マニュアルをGoogle Driveから読み込みました: ${targetFileId}`;
            alert('マニュアルをGoogle Driveから読み込みました。');

            // 成功した場合は currentManualsFileId を設定し直す
            currentManualsFileId = targetFileId;
            localStorage.setItem('manualsFileId', currentManualsFileId);

        } catch (err) {
            console.error('[loadManualsFromDrive] Error loading manuals from Drive:', err);
            // エラーオブジェクトの構造を詳しくログに出力
            if (err.result) {
                console.error("[loadManualsFromDrive] Drive API error result:", err.result);
            } else if (err.message) {
                console.error("[loadManualsFromDrive] Generic error message:", err.message);
            }

            // 404 Not Found (ファイルが見つからない) エラーの場合の特別な処理を強化
            // err.result が存在しない場合や、エラーコードが404でなくても、ファイルが見つからない状況に対応するため、
            // エラーメッセージの内容で判断することも検討
            if (err.result && err.result.error && err.result.error.code === 404) {
                console.log("[loadManualsFromDrive] Caught 404 error: File not found.");
                alert('Google Drive上のマニュアルファイルが見つかりません。別のファイルを選択するか、新しいファイルを作成してください。');
                fileStatus.textContent = "ファイルが見つかりません。Pickerで既存ファイルを選択するか、新規作成してください。";
                // ファイルが見つからなかった場合は、既存のIDをクリアし、Pickerを自動的に開く
                currentManualsFileId = null;
                localStorage.removeItem('manualsFileId');
                manuals = []; // データもクリアする
                displayManuals(currentLadder, currentSearchTerm); // リストをクリアして表示
                createPicker(); // 自動でPickerを開いてファイル選択を促す
            } else if (err.message && err.message.includes('File not found')) { // 404コードがないがメッセージで判断する場合
                console.log("[loadManualsFromDrive] Caught 'File not found' message in error. Proceeding as 404.");
                alert('Google Drive上のマニュアルファイルが見つかりません。別のファイルを選択するか、新しいファイルを作成してください。');
                fileStatus.textContent = "ファイルが見つかりません。Pickerで既存ファイルを選択するか、新規作成してください。";
                currentManualsFileId = null;
                localStorage.removeItem('manualsFileId');
                manuals = []; // データもクリアする
                displayManuals(currentLadder, currentSearchTerm);
                createPicker();
            }
            else {
                alert('Google Driveからのマニュアル読み込みに失敗しました。\n' + (err.result?.error?.message || err.message || "不明なエラー"));
                fileStatus.textContent = "読み込みエラーが発生しました。新しいファイルを作成するか、既存ファイルを選択してください。";
                currentManualsFileId = null;
                localStorage.removeItem('manualsFileId');
                manuals = []; // データもクリアする
                displayManuals(currentLadder, currentSearchTerm); // リストをクリアして表示
            }
        }
    }

    // --- Google Drive にマニュアルを保存する ---
    async function saveManualsToDrive() {
        console.log("[saveManualsToDrive] called. currentManualsFileId:", currentManualsFileId);
        // 保存時も認証状態をチェックし、必要であれば認証を促す
        if (!gapi.client.getToken()) {
            console.warn("[saveManualsToDrive] Attempted to save to Drive without authentication. Initiating auth.");
            const authSuccess = await handleAuthClick(); 
            if (!authSuccess || !gapi.client.getToken()) { 
                alert('Google Driveに接続されていません。マニュアルの保存を続行できません。');
                fileStatus.textContent = "Google Driveに接続されていません。";
                console.error("[saveManualsToDrive] Authentication failed or cancelled, cannot save.");
                return;
            }
        }

        const fileContent = JSON.stringify(manuals, null, 4);    
        const mimeType = 'application/json';
        console.log("[saveManualsToDrive] File content ready. Length:", fileContent.length);

        try {
            if (currentManualsFileId) {
                console.log("[saveManualsToDrive] Updating existing file with ID:", currentManualsFileId);
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
                fileStatus.textContent = `マニュアルをGoogle Drive上の既存ファイルに保存しました: ${currentManualsFileId}`;
                alert('マニュアルをGoogle Drive上の既存ファイルに保存しました。');
                console.log("[saveManualsToDrive] File updated successfully.");
            } else {
                console.log("[saveManualsToDrive] Creating new file.");
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
                localStorage.setItem('manualsFileId', currentManualsFileId); // 新規作成時にもIDを保存
                fileStatus.textContent = `新しいマニュアルファイルをGoogle Driveに保存しました (ID: ${currentManualsFileId})`;
                alert('マニュアルを新しいGoogle Driveファイルに保存しました。');
                console.log("[saveManualsToDrive] New file created successfully. ID:", currentManualsFileId);
            }
        } catch (err) {
            console.error('[saveManualsToDrive] Error saving manuals to Drive:', err);
            if (err.result) {
                console.error("[saveManualsToDrive] Drive API error result:", err.result);
            } else if (err.message) {
                console.error("[saveManualsToDrive] Generic error message:", err.message);
            }
            alert('Google Driveへのマニュアル保存に失敗しました。\n' + (err.result?.error?.message || err.message || "不明なエラー"));
            fileStatus.textContent = "保存エラーが発生しました。";
        }
    }

    // マニュアル一覧を表示する関数
    function displayManuals(filterLadder, searchTerm = '') {
        console.log(`[displayManuals] called. Filter: ${filterLadder}, Search: ${searchTerm}. Manuals count: ${manuals.length}`);
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
            // マニュアルがゼロの場合に、Google Driveからの読み込みを促すメッセージ
            if (gapiInited && gisInited && gapi.client.getToken()) {
                if (currentManualsFileId) {
                    fileStatus.textContent = `現在、ファイル (ID: ${currentManualsFileId}) が選択されていますが、マニュアルがありません。新規登録するか、このファイルが正しいか確認してください。`;
                    console.log("[displayManuals] File ID exists but no manuals found.");
                } else {
                    fileStatus.textContent = "マニュアルがありません。Google Driveから読み込むか、新規登録してGoogle Driveに保存してください。";
                    console.log("[displayManuals] No file ID and no manuals found.");
                }
            } else {
                fileStatus.textContent = "マニュアルがありません。Google Driveに接続してください。";
                console.log("[displayManuals] Not connected to Drive and no manuals found.");
            }
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
                    createPicker(); // 別のファイルを選択
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
    saveToDriveButton.addEventListener('click', saveManualsToDrive); 

    // 初期表示
    displayManuals('all');

}); // DOMContentLoaded の閉じタグ


// --- Google API クライアントライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gapiLoaded() {
    console.log("[gapiLoaded] called."); // デバッグ用
    gapi.load('client', initializeGapiClient); // 'client' ライブラリのみロード
}

async function initializeGapiClient() {
    console.log("[initializeGapiClient] called."); // デバッグ用
    await gapi.client.init({
        apiKey: API_KEY,    
        discoveryDocs: DISCOVERY_DOCS,
    });
    gapiInited = true;
    console.log("[initializeGapiClient] GAPI client initialized.");
    maybeEnableButtons();
}

// --- Google Identity Services JavaScriptライブラリの読み込み完了時に呼び出されるグローバル関数 ---
function gisLoaded() {
    console.log("[gisLoaded] called."); // デバッグ用
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
            console.log("[gisLoaded] Token client callback received.", tokenResponse);
            if (tokenResponse && tokenResponse.access_token) {
                gapi.client.setToken(tokenResponse);
                gisInited = true;
                console.log("[gisLoaded] GIS token set. Access Token:", tokenResponse.access_token);
                // トークン取得後、ボタンの状態を更新
                maybeEnableButtons();
                if (fileStatus) { 
                    fileStatus.textContent = "Google Driveに接続済み。";
                    if (currentManualsFileId) {
                         fileStatus.textContent += ` 以前のファイル (ID: ${currentManualsFileId}) が選択されています。`;
                    } else {
                         fileStatus.textContent += " マニュアルファイルを選択するか、新規に作成してください。";
                    }
                }
            } else {
                console.error('[gisLoaded] Failed to get access token or token response invalid:', tokenResponse);
                if (fileStatus) { 
                    fileStatus.textContent = "Google Driveへの接続に失敗しました。";
                }
                gisInited = false; // 認証失敗時は初期化状態をfalseに
            }
        },
    });
    gisInited = true; // initTokenClientの完了で初期化済みとマーク
    console.log("[gisLoaded] GIS client initialized.");
    maybeEnableButtons();
}

// ボタンの有効化判定と初期ファイル特定
function maybeEnableButtons() {
    console.log("[maybeEnableButtons] called. gapiInited:", gapiInited, "gisInited:", gisInited);
    if (gapiInited && gisInited) {
        // DOM要素がロードされているか確認
        if (loadFromDriveButton && saveToDriveButton && fileStatus) {
            loadFromDriveButton.disabled = false;
            saveToDriveButton.disabled = false;
            if (gapi.client.getToken()) { // トークンが実際に存在し有効かチェック
                console.log("[maybeEnableButtons] Google Drive authenticated. Token exists.");
                if (currentManualsFileId) {
                    fileStatus.textContent = `Google Driveに接続済み。以前のファイル (ID: ${currentManualsFileId}) を読み込み中...`;
                    console.log("[maybeEnableButtons] currentManualsFileId exists. Attempting auto-load.");
                    // ローカルストレージにファイルIDがあれば、自動でそのファイルを読み込もうとする
                    // 失敗した場合は loadManualsFromDrive 内で適切なエラーハンドリングとPicker呼び出しが行われる
                    loadManualsFromDrive(currentManualsFileId); 
                } else {
                    fileStatus.textContent = "Google Driveに接続済み。マニュアルファイルを選択するか、新規に作成してください。";
                    console.log("[maybeEnableButtons] No currentManualsFileId. Prompting user to select/create.");
                }
            } else {
                fileStatus.textContent = "Google Driveに接続していません。ボタンをクリックして接続してください。";    
                console.log("[maybeEnableButtons] Google Drive not authenticated. No valid token.");
            }
        } else {
            console.warn("[maybeEnableButtons] DOM elements (buttons/status) not yet available. Retrying soon.");
            // DOMContentLoaded 内で呼ばれているため、通常はすぐに要素が利用可能になるはずだが、念のため遅延再試行
            // setTimeout(maybeEnableButtons, 100); 
        }
    }
}

// 認証フローを開始/確認
async function handleAuthClick() {
    console.log("[handleAuthClick] called.");
    if (!gisInited) {
        fileStatus.textContent = "Google API初期化中...しばらくお待ちください。";
        console.warn("[handleAuthClick] GIS not inited yet. Cannot request token.");
        return false; // 認証開始できない
    }

    // すでに有効なトークンがあるかチェック
    const currentToken = gapi.client.getToken();
    if (currentToken && currentToken.expires_in > 60) {    
        console.log("[handleAuthClick] Existing access token is valid.");
        fileStatus.textContent = "Google Driveに接続済み。";
        return true; // 認証済み
    }

    console.log("[handleAuthClick] Requesting new access token.");
    try {
        // requestAccessToken は promise を返さないので、カスタムプロミスでラップして完了を待つ
        return new Promise((resolve, reject) => {
            tokenClient.callback = (tokenResponse) => {
                console.log("[handleAuthClick] tokenClient.callback received:", tokenResponse);
                if (tokenResponse && tokenResponse.access_token) {
                    gapi.client.setToken(tokenResponse);
                    gisInited = true; // 認証が成功したらGIS初期化済みとする
                    console.log("[handleAuthClick] Access token obtained successfully.");
                    resolve(true); // 認証成功
                } else {
                    console.error("[handleAuthClick] Failed to get access token:", tokenResponse);
                    alert("Google Driveへの接続に失敗しました。再度お試しください。");
                    fileStatus.textContent = "Google Driveへの接続に失敗しました。";
                    reject(false); // 認証失敗
                }
            };
            tokenClient.requestAccessToken({prompt: 'consent'}); // prompt: 'consent' を追加し、常に同意を求める
        });
    } catch (error) {
        console.error("[handleAuthClick] Authentication process error:", error);
        if (fileStatus) {
            fileStatus.textContent = "Google Driveへの接続に失敗しました。";
        }
        return false; // 認証失敗
    }
}

// Pickerインスタンスを構築する関数 (google.loadのcallbackとして呼び出される)
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
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
    console.log("[createPicker] Picker built and set visible.");
}

// ★重要: google.load は DOMContentLoaded の外に配置 (Picker APIをロード) ★
google.load('picker', '1', { 'callback': createPicker });
