// 定数定義（ES6インポートの代替）
const ACTION_RECHECK = "recheck";

// reCAPTCHA確認処理を開始
onExecute();

/**
 * メイン実行関数
 * ページ上でreCAPTCHAの存在を確認し、結果をbackground.jsに送信する
 */
async function onExecute() {
    // 500ms待機（ページ読み込み完了を待つ）
    await new Promise(resolve => setTimeout(resolve, 500));

    let currentDocument = document;

    try {
        // ====================================
        // ドキュメント探索（textarea基準）
        // ====================================
        
        let textareas = document.getElementsByTagName('textarea');

        // メインドキュメントにtextareaがない場合はiframe内を探索
        if (textareas.length === 0) {
            let iframes = document.getElementsByTagName('iframe');
            
            for (let i = 0; i < iframes.length; i++) {
                let iframe = iframes[i];
                try {
                    let iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                    let iframeTextareas = iframeDocument.getElementsByTagName('textarea');
                    
                    if (iframeTextareas.length > 0) {
                        currentDocument = iframeDocument;
                        break;
                    }
                } catch (iframeError) {
                    // iframe アクセスエラーを無視
                }
            }
        }

        // ====================================
        // reCAPTCHA検出処理
        // ====================================
        
        /**
         * reCAPTCHAを検出する
         * @param {Document} doc - 検索対象のドキュメント
         * @returns {Object} reCAPTCHA検出結果
         */
        function detectRecaptcha(doc) {
            // reCAPTCHA v2の検出（DOM要素ベース）
            const hasRecaptchaElement = doc.querySelector('.g-recaptcha') !== null ||
                                       doc.querySelector('iframe[src*="google.com/recaptcha"]') !== null;

            // reCAPTCHA v3の検出（スクリプトベース）
            const hasRecaptchaScript = doc.querySelector('script[src*="recaptcha/api.js"]') !== null ||
                                      typeof grecaptcha !== 'undefined';

            // reCAPTCHA Enterpriseの検出
            const hasEnterpriseScript = doc.querySelector('script[src*="enterprise.js"]') !== null;

            return {
                v2: hasRecaptchaElement,
                v3: hasRecaptchaScript,
                enterprise: hasEnterpriseScript,
                exists: hasRecaptchaElement || hasRecaptchaScript || hasEnterpriseScript
            };
        }

        // reCAPTCHA検出実行
        const recaptchaInfo = detectRecaptcha(currentDocument);
        const hasRecaptcha = recaptchaInfo.exists;

        // ====================================
        // 結果送信
        // ====================================
        
        chrome.runtime.sendMessage({
            action: ACTION_RECHECK,
            isRecaptcha: hasRecaptcha,
            message: "Success",
            detail: ""
        });

    } catch (error) {
        // エラー時のメッセージ送信
        chrome.runtime.sendMessage({
            action: ACTION_RECHECK,
            isRecaptcha: false,
            message: "Error",
            detail: error.message
        });
    }
}