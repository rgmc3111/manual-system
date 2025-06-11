// script.js の該当箇所を以下のように修正してください

// この変数はグローバルスコープ（または適切なスコープ）に定義されていることを前提とします
let lastUsedFileId = localStorage.getItem('lastUsedManualFileId'); // ローカルストレージから前回のファイルIDを取得

// ... (他の関数や定義はそのまま) ...

// マニュアルデータをGoogle Driveに保存する関数
async function saveManualsToDrive() {
    const content = JSON.stringify(manuals, null, 2);
    const fileName = 'manual_data.json';
    const mimeType = 'application/json';

    try {
        let fileId = lastUsedFileId; // ★★★ ローカルストレージに保存されたIDを優先 ★★★

        if (!fileId) { // ファイルIDがない場合のみ、Drive内を検索して既存ファイルを探す
            console.log('lastUsedFileId がありません。Drive内で既存のファイルを探します。');
            const filesResponse = await gapi.client.drive.files.list({
                q: `name='${fileName}' and mimeType='${mimeType}' and trashed=false`,
                fields: 'files(id, name)',
            });
            const existingFiles = filesResponse.result.files;

            if (existingFiles.length > 0) {
                fileId = existingFiles[0].id; // 見つかった最初のファイルのIDを使用
                console.log(`既存のファイルIDが見つかりました: ${fileId}`);
            } else {
                console.log('既存のファイルは見つかりませんでした。新しいファイルを作成します。');
            }
        } else {
            console.log(`lastUsedFileId を使用してファイルを更新します: ${fileId}`);
        }

        const metadata = {
            'name': fileName,
            'mimeType': mimeType,
        };

        const form = new FormData();
        // 更新時でもメタデータを送信する必要がある (name/mimeTypeが必須かはAPIによるが、念のため)
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        const requestOptions = {
            method: fileId ? 'PATCH' : 'POST', // fileIdがあれば更新(PATCH)、なければ新規作成(POST)
            path: fileId ? `/upload/drive/v3/files/${fileId}?uploadType=multipart` : '/upload/drive/v3/files?uploadType=multipart',
            headers: {
                'Content-Type': 'multipart/related',
            },
            body: form,
        };

        const response = await gapi.client.request(requestOptions);
        document.getElementById('file-status').textContent = `ファイル保存済み: ${response.result.name} (ID: ${response.result.id})`;
        alert(`マニュアルをGoogle Driveに保存しました: ${response.result.name}`);

        // ★★★ 保存に成功したファイルのIDをローカルストレージに保存する ★★★
        localStorage.setItem('lastUsedManualFileId', response.result.id);
        lastUsedFileId = response.result.id; // グローバル変数も更新

    } catch (err) {
        console.error('Google Driveへのファイルの保存中にエラーが発生しました:', err);
        alert('Google Driveへのファイルの保存に失敗しました。');
        document.getElementById('file-status').textContent = 'ファイルの保存に失敗しました。';
        // エラー時は保存されたファイルIDをクリアし、次回は新規作成を試みる
        localStorage.removeItem('lastUsedManualFileId');
        lastUsedFileId = null;
    }
}

// ... (pickerCallback 関数も以前の提案通り、選択されたファイルのIDを保存するようにする) ...
/*
async function pickerCallback(data) {
    if (data[google.picker.Response.ACTION] === google.picker.Action.PICKED) {
        const doc = data[google.picker.Response.DOCUMENTS][0];
        const fileId = doc.id;
        const fileName = doc.name;
        document.getElementById('file-status').textContent = `ファイル保存済み: ${fileName} (ID: ${fileId})`;

        localStorage.setItem('lastUsedManualFileId', fileId); // ★★★ ここを追加：ファイルIDを保存 ★★★
        lastUsedFileId = fileId; // 変数も更新

        loadManualFromFileId(fileId); // 読み込み処理を共通関数に
    }
}
*/
