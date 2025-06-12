// ... (変更なし) ...

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
    // ... (既存のDOM要素の取得と変数定義は変更なし) ...

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
        if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
            const doc = data[google.picker.Response.DOCUMENTS][0];
            const fileId = doc.id;
            const fileName = doc.name;
            
            // Pickerで選択されたファイルのIDを currentManualsFileId に設定し、ローカルストレージにも保存
            currentManualsFileId = fileId;    
            localStorage.setItem('manualsFileId', currentManualsFileId); 

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
            await handleAuthClick(); 
            if (!gapi.client.getToken()) {
                alert('Google Driveに接続されていません。');
                fileStatus.textContent = "Google Driveに接続されていません。";
                return;
            }
        }
        
        // Pickerで選択されたファイルIDと currentManualsFileId が異なる場合、currentManualsFileIdを更新
        if (fileId && fileId !== currentManualsFileId) {
            currentManualsFileId = fileId;
            localStorage.setItem('manualsFileId', currentManualsFileId);
        } else if (!fileId && currentManualsFileId) {
            // fileIdが渡されず、currentManualsFileIdが存在する場合、それを使用
            fileId = currentManualsFileId;
        } else if (!fileId && !currentManualsFileId) {
            // どちらも存在しない場合、エラーまたはPickerを促す
            fileStatus.textContent = "読み込むファイルが特定できません。マニュアルを読み込むボタンでファイルを選択してください。";
            return;
        }


        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media',    
            });
            // JSONパースが失敗する可能性があるためtry-catchで囲む
            try {
                manuals = JSON.parse(response.body); // response.result ではなく response.body を使う
            } catch (parseError) {
                console.error('Error parsing JSON from Drive:', parseError);
                alert('Google Driveから読み込んだデータが不正な形式です。');
                manuals = []; // 不正な場合はデータをクリア
            }
            
            // 読み込んだマニュアルにorderプロパティがない場合は初期値を設定
            if (manuals.length > 0 && !manuals[0].hasOwnProperty('order')) {
                manuals = manuals.map((m, i) => ({ ...m, order: i }));
            }
            localStorage.setItem('manuals', JSON.stringify(manuals)); 
            displayManuals(currentLadder, currentSearchTerm);
            fileStatus.textContent = `マニュアルをGoogle Driveから読み込みました: ${fileId}`;
            alert('マニュアルをGoogle Driveから読み込みました。');
        } catch (err) {
            console.error('Error loading manuals from Drive:', err);
            alert('Google Driveからのマニュアル読み込みに失敗しました。\n' + (err.result?.error?.message || err.message));
            manuals = [];    
            localStorage.removeItem('manuals'); 
            // currentManualsFileId もクリアして、次回は新規作成または選択を促す
            currentManualsFileId = null;
            localStorage.removeItem('manualsFileId');
            displayManuals(currentLadder, currentSearchTerm);
            fileStatus.textContent = "読み込みエラーが発生しました。新しいファイルを作成するか、既存ファイルを選択してください。";
        }
    }

    // --- Google Drive にマニュアルを保存する ---
    async function saveManualsToDrive() {
        if (!gapi.client.getToken()) {
            console.warn("Attempted to save to Drive without authentication. Initiating auth.");
            await handleAuthClick(); 
            if (!gapi.client.getToken()) { 
                alert('Google Driveに接続されていません。');
                fileStatus.textContent = "Google Driveに接続されていません。";
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
                fileStatus.textContent = `マニュアルをGoogle Drive上の既存ファイルに保存しました: ${currentManualsFileId}`;
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
                localStorage.setItem('manualsFileId', currentManualsFileId); // 新規作成時にもIDを保存
                fileStatus.textContent = `新しいマニュアルファイルをGoogle Driveに保存しました (ID: ${currentManualsFileId})`;
                alert('マニュアルを新しいGoogle Driveファイルに保存しました。');
            }
        } catch (err) {
            console.error('Error saving manuals to Drive:', err);
            alert('Google Driveへのマニュアル保存に失敗しました。\n' + (err.result?.error?.message || err.message));
            fileStatus.textContent = "保存エラーが発生しました。";
        }
    }

    // ... (moveManual, showManualDetail, saveManual, deleteManual, showNewManualForm, showEditManualForm は変更なし) ...

    // --- イベントリスナー設定 ---

    // ... (既存の navItems, backToListButton, searchInput, manualForm, cancelFormButton, editButton, deleteButton のイベントリスナーは変更なし) ...

    // Google Drive 関連のボタンイベント
    loadFromDriveButton.addEventListener('click', async () => {
        await handleAuthClick(); // まず認証
        if (gapi.client.getToken()) {
            if (currentManualsFileId) {
                // 既にファイルIDがある場合、確認ダイアログ
                if (confirm(`以前使用したファイル (ID: ${currentManualsFileId}) を読み込みますか？\n「キャンセル」で別のファイルを選択できます。`)) {
                    await loadManualsFromDrive(currentManualsFileId);
                } else {
                    createPicker(); // 別のファイルを選択
                }
            } else {
                createPicker(); // ファイルIDがない場合はPickerを開く
            }
        }
    });
    saveToDriveButton.addEventListener('click', saveManualsToDrive); 

    // 初期表示
    displayManuals('all');

    // アプリケーション起動時に、もし認証済みでファイルIDがローカルストレージにあれば自動読み込みを試みる
    // ただし、この部分はgapiLoaded/gisLoadedの後に実行されるべきなので、maybeEnableButtons()内から呼び出すのがより安全
    // または、認証が完了した時点でこのロジックを実行する
    // 現在のコードではmaybeEnableButtons()でボタンを活性化しているため、その後にユーザーが操作するのを待つ
    // より積極的な自動読み込みを望むなら、maybeEnableButtons()の最後に loadManualsFromDrive を呼ぶ
    // 例:
    // if (gapiInited && gisInited && gapi.client.getToken() && currentManualsFileId) {
    //     loadManualsFromDrive(currentManualsFileId);
    // }
}); // DOMContentLoaded の閉じタグ

// ... (gapiLoaded, initializeGapiClient, gisLoaded, maybeEnableButtons は変更なし) ...

// 認証フローを開始/確認
async function handleAuthClick() {
    if (!gisInited) {
        fileStatus.textContent = "Google API初期化中...しばらくお待ちください。";
        // 必要に応じて、gisLoadedが呼び出されるまで待機するメカニズムを追加
        return; 
    }
    // トークンがないか、有効期限が短い場合に新しいトークンを要求
    if (!gapi.client.getToken() || gapi.client.getToken().expires_in < 60) {    
        try {
            await tokenClient.requestAccessToken();
            // トークン取得成功後の処理はcallbackで実行される (gisLoaded内のcallback)
        } catch (error) {
            console.error("Authentication failed:", error);
            if (fileStatus) {
                fileStatus.textContent = "Google Driveへの接続に失敗しました。";
            }
        }
    } else {
        // 既にトークンがある場合
        if (fileStatus) {
            fileStatus.textContent = "Google Driveに接続済み。";
        }
    }
}

// Pickerインスタンスを構築する関数 (google.loadのcallbackとして呼び出される)
function createPicker() {
    console.log("createPicker called."); 
    if (!gapiInited || !gapi.client.getToken()) {
        fileStatus.textContent = "Google Driveに接続していません。認証が必要です。";
        return;
    }

    const view = new google.picker.View(google.picker.ViewId.DOCS);
    view.setMimeTypes('application/json'); 

    const picker = new google.picker.PickerBuilder()
        .setAppId(CLIENT_ID.split('.')[0])    
        .setOAuthToken(gapi.client.getToken().access_token)
        .addView(view)
        .setCallback(pickerCallback)
        .build();
    picker.setVisible(true);
}

// ★重要: google.load は DOMContentLoaded の外に配置 (Picker APIをロード) ★
google.load('picker', '1', { 'callback': createPicker });
