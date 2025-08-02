// 共通定数のインポート
import { ACTION_EXPLORE } from '../shared/constants.js';

// 探索処理を開始
onExecute();

/**
 * メイン実行関数
 * Webページ上で問い合わせフォーム（textarea）やコンタクトリンクを探索する
 */
async function onExecute() {
    // 1秒待機（ページ読み込み完了を待つ）
    await new Promise(resolve => setTimeout(resolve, 1000));

    let currentUrl = window.location.href;
    let currentDocument = document;

    try {
        // ====================================
        // メインドキュメントでtextarea探索
        // ====================================
        
        let textareas = document.getElementsByTagName('textarea');
        let visibleTextareas = [];

        // 表示されているtextareaのみを抽出
        for (let i = 0; i < textareas.length; i++) {
            let textarea = textareas[i];
            if (textarea.style.display !== 'none') {
                visibleTextareas.push(textarea);
            }
        }

        // ====================================
        // iframe内での探索（メインで見つからない場合）
        // ====================================
        
        if (visibleTextareas.length === 0) {
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
        // 最終的なtextarea確認
        // ====================================
        
        let finalTextareas = currentDocument.getElementsByTagName('textarea');
        let finalVisibleTextareas = [];

        for (let i = 0; i < finalTextareas.length; i++) {
            let textarea = finalTextareas[i];
            if (textarea.style.display !== 'none') {
                finalVisibleTextareas.push(textarea);
            }
        }

        // textareaが見つかった場合は現在のページにフォームありと判定
        if (finalVisibleTextareas.length > 0) {
            chrome.runtime.sendMessage({
                action: ACTION_EXPLORE,
                success: true,
                currentForm: true,
                contactLink: ""
            });
            return;
        }

        // ====================================
        // コンタクトリンクの探索
        // ====================================
        
        let links = currentDocument.getElementsByTagName('a');
        let contactLinks = [];

        // URL内にコンタクト関連のキーワードが含まれるリンクを探索
        let urlBasedContactLinks = Array.from(links).filter(link => {
            return link.href && typeof link.href === 'string' && (
                link.href.includes('inq') ||
                link.href.includes('Inq') ||
                link.href.includes('INQ') ||
                link.href.includes('contact') ||
                link.href.includes('Contact') ||
                link.href.includes('CONTACT')
            );
        });

        // テキスト内にコンタクト関連のキーワードが含まれるリンクを探索
        let textBasedContactLinks = Array.from(links).filter(link => {
            return link.innerText && typeof link.innerText === 'string' && (
                link.innerText.includes('問い合') ||
                link.innerText.includes('問合') ||
                link.innerText.includes('CONTACT') ||
                link.innerText.includes('Contact')
            );
        });

        // 全てのコンタクトリンクを統合
        contactLinks.push(...urlBasedContactLinks);
        contactLinks.push(...textBasedContactLinks);

        // ====================================
        // コンタクトリンクの処理
        // ====================================
        
        if (contactLinks.length > 0) {
            // 最後のリンクから順番にチェック
            for (let i = 0; i < contactLinks.length; i++) {
                let contactLink = contactLinks[contactLinks.length - i - 1];

                // 末尾のスラッシュを削除（URL比較のため）
                if (contactLink.href.endsWith('/')) {
                    contactLink.href = contactLink.href.slice(0, -1);
                }
                if (currentUrl.endsWith('/')) {
                    currentUrl = currentUrl.slice(0, -1);
                }

                // 現在のURLと異なり、かつHTTPで始まるリンクを返す
                if (currentUrl !== contactLink.href && contactLink.href.startsWith('http')) {
                    chrome.runtime.sendMessage({
                        action: ACTION_EXPLORE,
                        success: true,
                        currentForm: false,
                        contactLink: contactLink.href
                    });
                    return;
                }
            }

            // 条件に合うリンクが見つからなかった場合
            chrome.runtime.sendMessage({
                action: ACTION_EXPLORE,
                success: false,
                currentForm: false,
                contactLink: "",
                message: "contactLink.href.startsWith('http') is false"
            });
            return;
        }

        // コンタクトリンクが全く見つからなかった場合
        chrome.runtime.sendMessage({
            action: ACTION_EXPLORE,
            success: false,
            currentForm: false,
            contactLink: "",
            message: "contactLinks.length === 0"
        });

    } catch (error) {
        // エラーが発生した場合
        chrome.runtime.sendMessage({
            action: ACTION_EXPLORE,
            success: false,
            currentForm: false,
            contactLink: "",
            message: error.message
        });
    }
}