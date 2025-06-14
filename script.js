// script.js の中で定義する定数
const DRIVE_DATA_FILENAME = 'manual_system_data.json'; // 例: アプリケーション専用のファイル名
let driveFileId = null; // 取得したファイルIDを保持する変数

// Google Drive APIの初期化後や適切なタイミングで実行
async function findOrCreateDriveFile() {
    try {
        // 1. ファイルを名前で検索
        const response = await gapi.client.drive.files.list({
            q: `name='${DRIVE_DATA_FILENAME}' and trashed=false`,
            // spaces: 'appDataFolder', // アプリケーション専用フォルダを使用する場合
            spaces: 'drive',          // 通常のDriveスペースを使用する場合
            fields: 'files(id, name)'
        });

        if (response.result.files && response.result.files.length > 0) {
            // ファイルが見つかった場合
            driveFileId = response.result.files[0].id;
            console.log(`Found file: ${response.result.files[0].name}, ID: ${driveFileId}`);
            // 必要であれば、ここでファイルステータスを更新
            document.getElementById('file-status').textContent = `接続済み: ${DRIVE_DATA_FILENAME}`;
        } else {
            // ファイルが見つからない場合、新規作成する（最初の保存時など）
            // この段階で作成するか、最初の保存時に作成するかは設計によります。
            // ここでは、見つからなかったことを記録しておくだけとします。
            console.log(`File '${DRIVE_DATA_FILENAME}' not found. Will be created on first save.`);
            document.getElementById('file-status').textContent = `Driveに ${DRIVE_DATA_FILENAME} が見つかりません。初回保存時に作成されます。`;
        }
    } catch (error) {
        console.error('Error finding file:', error);
        document.getElementById('file-status').textContent = 'Google Driveファイルの検索中にエラーが発生しました。';
        // エラー処理
    }
}

// マニュアル読み込み処理 (loadFromDriveButton のイベントリスナー内など)
async function loadDataFromDrive() {
    if (!driveFileId) {
        // ファイルIDが未取得なら、まず検索（または検索・作成）
        await findOrCreateDriveFile();
        if (!driveFileId) {
             // それでも見つからない（新規作成もまだ）場合は、読み込むデータがない
            console.log('No file to load from Drive yet.');
            document.getElementById('file-status').textContent = '読み込むファイルがDriveにありません。';
            // UIに「データなし」などを表示
            return []; // 空のデータを返すなど
        }
    }
    // driveFileId を使ってファイル内容を取得
    // const response = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' });
    // ... データをパースして表示 ...
    document.getElementById('file-status').textContent = `Driveから ${DRIVE_DATA_FILENAME} を読み込みました。`;
}

// マニュアル保存処理 (saveToDriveButton のイベントリスナー内など)
async function saveDataToDrive(content) { // content は保存するデータ
    if (!driveFileId) {
        // ファイルIDが未取得なら、まず検索。見つからなければ新規作成。
        try {
            const searchResponse = await gapi.client.drive.files.list({
                q: `name='${DRIVE_DATA_FILENAME}' and trashed=false`,
                spaces: 'drive', // or 'appDataFolder'
                fields: 'files(id)'
            });

            if (searchResponse.result.files && searchResponse.result.files.length > 0) {
                driveFileId = searchResponse.result.files[0].id;
            } else {
                // ファイルが見つからないので新規作成
                const fileMetadata = {
                    'name': DRIVE_DATA_FILENAME,
                    // 'parents': ['appDataFolder'] // appDataFolder を使用する場合
                };
                const createResponse = await gapi.client.drive.files.create({
                    resource: fileMetadata,
                    fields: 'id'
                });
                driveFileId = createResponse.result.id;
                console.log(`Created file ID: ${driveFileId}`);
            }
        } catch (error) {
            console.error('Error ensuring file exists:', error);
            document.getElementById('file-status').textContent = 'Google Driveファイルの準備中にエラーが発生しました。';
            return;
        }
    }

    // driveFileId を使ってファイル内容を更新
    // const boundary = '-------314159265358979323846'; // multipart upload のための境界
    // const metadata = { name: DRIVE_DATA_FILENAME, mimeType: 'application/json' };
    // const requestBody = ... (multipart リクエストボディの構築) ...
    // await gapi.client.request({
    //    path: `/upload/drive/v3/files/${driveFileId}`,
    //    method: 'PATCH',
    //    params: { uploadType: 'multipart' },
    //    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
    //    body: requestBody
    // });
    // ... 保存処理 ...
    document.getElementById('file-status').textContent = `Driveに ${DRIVE_DATA_FILENAME} を保存しました。`;
}
