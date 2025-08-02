/**
 * URL処理モジュール
 * Service Worker環境でのURL処理機能を管理
 * 
 * このモジュールはWebページの探索、フォーム検出、URL処理を行います
 */

// ====================================
// 定数（一時的にインライン定義）
// ====================================

const FORM_TIMEOUT = 5000; // 5秒
const URL_PROCESSING_TIMEOUT = 90000; // 90秒
const ACTION_EXPLORE = "explore";
const TIMEOUT_MESSAGE_TEMPLATE = (seconds) => `処理タイムアウト（${seconds}秒経過）`;

// ====================================
// URL処理関数
// ====================================

/**
 * ページの読み込み完了を待機する
 * @param {number} tabId - タブID
 * @returns {Promise<void>}
 */
async function waitForPageLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(id, changeInfo) {
            if (id === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                setTimeout(resolve, 1000);
            }
        });
        
        // 5秒でタイムアウト
        setTimeout(() => {
            resolve();
        }, FORM_TIMEOUT);
    });
}

/**
 * URLに移動してスクリプトを実行する（タイムアウト付き）
 * @param {number} tabId - タブID
 * @param {string} url - URL
 * @param {Array} sentUrlList - 送信済みURLリスト
 * @param {Array} excludeDomains - 除外ドメインリスト
 * @returns {Promise<Object>} 処理結果
 */
async function navigateAndExecuteScript(tabId, url, sentUrlList, excludeDomains) {
    return Promise.race([
        executeUrlProcessing(tabId, url, sentUrlList, excludeDomains),
        new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    url: url,
                    result: "失敗",
                    contact: "",
                    reason: TIMEOUT_MESSAGE_TEMPLATE(URL_PROCESSING_TIMEOUT / 1000)
                });
            }, URL_PROCESSING_TIMEOUT);
        })
    ]);
}

/**
 * URL処理のメイン処理
 * @param {number} tabId - タブID
 * @param {string} url - URL
 * @param {Array} sentUrlList - 送信済みURLリスト
 * @param {Array} excludeDomains - 除外ドメインリスト
 * @returns {Promise<Object>} 処理結果
 */
async function executeUrlProcessing(tabId, url, sentUrlList, excludeDomains) {
    // 停止チェック（グローバル停止制御を使用）
    if (globalThis.StopControl && globalThis.StopControl.isStoppingState()) {
        return {
            url: url,
            result: "停止",
            contact: "",
            reason: "ユーザーによって停止されました"
        };
    }

    // URLとタグを分離
    let parts = url.split(',');
    url = parts[0];
    let tags = parts.slice(1);

    // 除外ドメインチェック
    if (excludeDomains && excludeDomains.length > 0) {
        for (let i = 0; i < excludeDomains.length; i++) {
            if (excludeDomains[i] !== "" && url.includes(excludeDomains[i])) {
                return {
                    url: url,
                    result: "失敗",
                    contact: "",
                    reason: "除外ドメインのため送信しない"
                };
            }
        }
    }

    // ページに移動
    await chrome.tabs.update(tabId, { url: url });
    await waitForPageLoad(tabId);

    //探索スクリプトを実行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/explore.js"]
    });

    // 探索結果を待機
    let exploreResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === ACTION_EXPLORE) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: false,
                currentForm: false,
                contactLink: "",
                message: "Timeout"
            });
        }, FORM_TIMEOUT);
    });

    let originalResult = exploreResult;

    // コンタクトリンクが見つかった場合は再度チェック
    if (exploreResult.success && !exploreResult.currentForm && exploreResult.contactLink) {
        await chrome.tabs.update(tabId, { url: exploreResult.contactLink });
        await waitForPageLoad(tabId);

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content-scripts/explore.js"]
        });

        exploreResult = await new Promise(resolve => {
            chrome.runtime.onMessage.addListener(function listener(message, sender) {
                if (sender.tab.id === tabId && message.action === ACTION_EXPLORE) {
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(message);
                }
            });

            setTimeout(() => {
                resolve(originalResult);
            }, FORM_TIMEOUT);
        });
    }

    let tab = await chrome.tabs.get(tabId);
    let currentUrl = tab.url;

    if (exploreResult.success) {
        let contactUrl = exploreResult.currentForm ? currentUrl : exploreResult.contactLink;

        // 除外ドメインチェック（コンタクトURL）
        if (excludeDomains && excludeDomains.length > 0) {
            for (let i = 0; i < excludeDomains.length; i++) {
                if (excludeDomains[i] !== "" && contactUrl.includes(excludeDomains[i])) {
                    return {
                        url: url,
                        result: "失敗",
                        contact: contactUrl,
                        reason: "除外ドメインのため送信しない"
                    };
                }
            }
        }

        // 重複送信チェック
        if (sentUrlList.includes(contactUrl)) {
            return {
                url: url,
                result: "失敗",
                contact: contactUrl,
                reason: "重複送信のため送信しない"
            };
        }
    } else {
        return {
            url: url,
            result: "失敗",
            contact: "",
            reason: "問い合わせフォームが見つかりませんでした"
        };
    }

    // フォーム送信処理（グローバルフォーム処理機能を使用）
    if (exploreResult.currentForm) {
        return await globalThis.FormProcessor.processFormSubmission(tabId, url, currentUrl, tags);
    } else {
        await chrome.tabs.update(tabId, { url: exploreResult.contactLink });
        await waitForPageLoad(tabId);
        return await globalThis.FormProcessor.processFormSubmission(tabId, url, exploreResult.contactLink, tags);
    }
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.UrlProcessor = {
        waitForPageLoad,
        navigateAndExecuteScript,
        executeUrlProcessing
    };
}