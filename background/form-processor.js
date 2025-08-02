/**
 * フォーム処理モジュール
 * Service Worker環境でのフォーム送信処理機能を管理
 * 
 * このモジュールはWebフォームの自動入力、送信、確認処理を行います
 */

// ====================================
// 定数（一時的にインライン定義）
// ====================================

const FORM_TIMEOUT = 5000; // 5秒
const SEND_TIMEOUT = 10000; // 10秒
const RECAPTCHA_TIMEOUT = 40000; // 40秒
const ACTION_SEND = "send";

// ====================================
// フォーム処理関数
// ====================================

/**
 * フォーム送信処理
 * @param {number} tabId - タブID
 * @param {string} originalUrl - 元のURL
 * @param {string} contactUrl - コンタクトURL
 * @param {Array} tags - タグ
 * @returns {Promise<Object>} 処理結果
 */
async function processFormSubmission(tabId, originalUrl, contactUrl, tags) {
    // reCAPTCHAチェック
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/recheck.js"]
    });

    let recheckResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "recheck") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                isRecaptcha: false,
                message: "Timeout"
            });
        }, FORM_TIMEOUT);
    });

    // 送信スクリプトを実行
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/send.js"]
    }, () => {
        chrome.tabs.sendMessage(tabId, {
            action: "tags",
            tags: tags
        });
    });

    let sendResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === ACTION_SEND) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        // reCAPTCHAがある場合とない場合のタイムアウト設定
        let timeout = recheckResult.isRecaptcha ? RECAPTCHA_TIMEOUT : SEND_TIMEOUT;
        setTimeout(() => {
            resolve({
                success: true,
                message: ""
            });
        }, timeout);
    });

    if (!sendResult.success) {
        return {
            url: originalUrl,
            result: "失敗",
            contact: contactUrl,
            reason: sendResult.message
        };
    }

    // 確認処理
    await chrome.tabs.get(tabId);
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content-scripts/confirm.js"]
    });

    let confirmResult = await new Promise(resolve => {
        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "confirm") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: true,
                message: ""
            });
        }, 10000);
    });

    return {
        url: originalUrl,
        result: confirmResult.success ? "成功" : "失敗",
        contact: contactUrl,
        reason: confirmResult.success ? "成功" : confirmResult.message
    };
}

/**
 * フォーム要素の検出と分析
 * @param {number} tabId - タブID
 * @returns {Promise<Object>} フォーム分析結果
 */
async function analyzeForm(tabId) {
    return new Promise(resolve => {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content-scripts/explore.js"]
        });

        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "explore") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: false,
                currentForm: false,
                contactLink: "",
                message: "Form analysis timeout"
            });
        }, FORM_TIMEOUT);
    });
}

/**
 * reCAPTCHA検出処理
 * @param {number} tabId - タブID
 * @returns {Promise<Object>} reCAPTCHA検出結果
 */
async function detectRecaptcha(tabId) {
    return new Promise(resolve => {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content-scripts/recheck.js"]
        });

        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "recheck") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                isRecaptcha: false,
                message: "reCAPTCHA detection timeout"
            });
        }, FORM_TIMEOUT);
    });
}

/**
 * フォーム送信確認処理
 * @param {number} tabId - タブID
 * @returns {Promise<Object>} 送信確認結果
 */
async function confirmSubmission(tabId) {
    return new Promise(resolve => {
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content-scripts/confirm.js"]
        });

        chrome.runtime.onMessage.addListener(function listener(message, sender) {
            if (sender.tab.id === tabId && message.action === "confirm") {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(message);
            }
        });

        setTimeout(() => {
            resolve({
                success: true,
                message: "Confirmation timeout - assuming success"
            });
        }, 10000);
    });
}

// ====================================
// Service Worker向けエクスポート
// ====================================

// Service Worker環境ではグローバルスコープに関数を配置
if (typeof globalThis !== 'undefined') {
    globalThis.FormProcessor = {
        processFormSubmission,
        analyzeForm,
        detectRecaptcha,
        confirmSubmission
    };
}