// 確認処理を開始
onExecute();

/**
 * メイン実行関数
 * 問い合わせフォームの確認ページで送信ボタンをクリックする処理
 */
async function onExecute() {
    // 1秒待機
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // ====================================
        // textareaの確認処理
        // ====================================
        
        // 全てのtextareaを取得
        let textareas = document.getElementsByTagName('textarea');
        let visibleTextareas = [];

        // 表示されているtextareaのみを抽出
        for (let i = 0; i < textareas.length; i++) {
            let textarea = textareas[i];
            if (textarea.style.display !== 'none') {
                visibleTextareas.push(textarea);
            }
        }

        // 表示されているtextareaがある場合
        if (visibleTextareas.length > 0) {
            let lastTextarea = visibleTextareas[visibleTextareas.length - 1];
            
            // 最後のtextareaに値が入っている場合はエラー
            if (lastTextarea.value !== '') {
                chrome.runtime.sendMessage({
                    action: "confirm",
                    success: false,
                    message: "対応できない問い合わせフォームです",
                    detail: "textareaTagAfter.value !== ''"
                });
                return;
            }
        }

        // ====================================
        // 送信ボタンの検索処理
        // ====================================

        // テキストベースのボタン（span, button）を検索
        let textButtons = document.querySelectorAll('span, button');
        let textSubmitButtons = Array.from(textButtons).filter(button => 
            button.innerText && (
                button.innerText.includes('送信') ||
                button.innerText.includes('送 信') ||
                button.innerText.includes('送　信') ||
                button.innerText.includes('はい') ||
                button.innerText.includes('OK') ||
                button.innerText.includes('同意する') ||
                button.innerText.includes('続行')
            )
        );

        // input要素のボタンを検索
        let inputButtons = document.querySelectorAll('input[type="submit"], input[type="button"]');
        let inputSubmitButtons = Array.from(inputButtons).filter(button =>
            button.value && (
                button.value.includes('送信') ||
                button.value.includes('送 信') ||
                button.value.includes('送　信') ||
                button.value.includes('問い合') ||
                button.value.includes('問合') ||
                button.value.includes('はい') ||
                button.value.includes('OK') ||
                button.value.includes('同意する') ||
                button.value.includes('続行')
            )
        );

        // 画像ボタンを検索
        let imageButtons = document.querySelectorAll('input[type="image"]');
        let imageSubmitButtons = Array.from(imageButtons).filter(button =>
            button.alt && (
                button.alt.includes('送信') ||
                button.alt.includes('確認') ||
                button.alt.includes('はい') ||
                button.alt.includes('OK') ||
                button.alt.includes('同意する') ||
                button.alt.includes('続行')
            )
        );

        // 全ての送信ボタンを統合
        let allSubmitButtons = [].concat(
            Array.from(textSubmitButtons),
            Array.from(imageSubmitButtons),
            Array.from(inputSubmitButtons)
        );

        // ====================================
        // ボタンクリック処理
        // ====================================

        // 送信ボタンが見つからない場合は成功として処理
        if (allSubmitButtons.length === 0) {
            chrome.runtime.sendMessage({
                action: "confirm",
                success: true,
                message: "",
                detail: ""
            });
            return;
        }

        // 最後のボタンをクリック
        let targetButton = allSubmitButtons[allSubmitButtons.length - 1];
        targetButton.click();

        // 5秒待機（送信処理完了を待つ）
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 成功メッセージを送信
        chrome.runtime.sendMessage({
            action: "confirm",
            success: true,
            message: "",
            detail: ""
        });

    } catch (error) {
        // エラー時のメッセージ送信
        chrome.runtime.sendMessage({
            action: "confirm",
            success: false,
            message: "対応できない問い合わせフォームです",
            detail: error.message
        });
    }
}