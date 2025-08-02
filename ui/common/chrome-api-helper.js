/**
 * Chrome API操作ヘルパーモジュール
 * UI関連ファイルで共通的に使用されるChrome API操作を統一化
 * 
 * このモジュールはタブ操作、ストレージ操作、メッセージングの安全な操作を提供します
 */

import { logError, showToast } from './error-handler.js';

// ====================================
// タブ操作
// ====================================

/**
 * 指定URLのタブを検索する
 * @param {string} url - 検索するURL（ワイルドカード対応）
 * @returns {Promise<Array>} タブの配列
 */
export async function findTabs(url) {
    try {
        const tabs = await chrome.tabs.query({ url });
        return tabs || [];
    } catch (error) {
        logError(error, 'findTabs');
        return [];
    }
}

/**
 * 新しいタブを作成する
 * @param {string} url - 作成するタブのURL
 * @param {Object} options - タブ作成オプション
 * @returns {Promise<Object|null>} 作成されたタブオブジェクト
 */
export async function createTab(url, options = {}) {
    try {
        const tabOptions = {
            url,
            active: true,
            ...options
        };
        
        const tab = await chrome.tabs.create(tabOptions);
        return tab;
    } catch (error) {
        logError(error, 'createTab');
        showToast('タブの作成に失敗しました', 'error');
        return null;
    }
}

/**
 * 既存のタブを更新する
 * @param {number} tabId - タブID
 * @param {Object} updateProperties - 更新プロパティ
 * @returns {Promise<Object|null>} 更新されたタブオブジェクト
 */
export async function updateTab(tabId, updateProperties) {
    try {
        const tab = await chrome.tabs.update(tabId, updateProperties);
        return tab;
    } catch (error) {
        logError(error, 'updateTab');
        showToast('タブの更新に失敗しました', 'error');
        return null;
    }
}

/**
 * タブをアクティブにする
 * @param {number} tabId - タブID
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function activateTab(tabId) {
    try {
        await chrome.tabs.update(tabId, { active: true });
        return true;
    } catch (error) {
        logError(error, 'activateTab');
        return false;
    }
}

/**
 * メインアプリのタブに戻る
 * @param {string} tabParam - タブパラメータ（オプション）
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function returnToMainTab(tabParam = null) {
    try {
        // 既存のメインタブを検索
        const mainUrl = chrome.runtime.getURL('ui/main.html') + '*';
        const tabs = await findTabs(mainUrl);

        if (tabs.length > 0) {
            // 既存のメインタブがある場合
            const mainTab = tabs[0];
            
            if (tabParam) {
                await updateTab(mainTab.id, {
                    url: chrome.runtime.getURL('ui/main.html') + tabParam,
                    active: true
                });
            } else {
                await activateTab(mainTab.id);
            }
        } else {
            // メインタブがない場合は新しく作成
            const url = chrome.runtime.getURL('ui/main.html') + (tabParam || '');
            await createTab(url);
        }
        
        return true;
    } catch (error) {
        logError(error, 'returnToMainTab');
        showToast('メインタブへの移動に失敗しました', 'error');
        return false;
    }
}

/**
 * 現在のタブを閉じる
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function closeCurrentTab() {
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (currentTab) {
            await chrome.tabs.remove(currentTab.id);
        }
        return true;
    } catch (error) {
        logError(error, 'closeCurrentTab');
        return false;
    }
}

// ====================================
// ストレージ操作
// ====================================

/**
 * ローカルストレージから値を取得する
 * @param {string|Array} keys - 取得するキー
 * @param {any} defaultValue - デフォルト値
 * @returns {Promise<any>} 取得した値
 */
export async function getLocalStorage(keys, defaultValue = null) {
    try {
        const result = await chrome.storage.local.get(keys);
        
        if (typeof keys === 'string') {
            return result[keys] !== undefined ? result[keys] : defaultValue;
        }
        
        return result;
    } catch (error) {
        logError(error, 'getLocalStorage');
        return typeof keys === 'string' ? defaultValue : {};
    }
}

/**
 * ローカルストレージに値を設定する
 * @param {Object|string} keyOrObject - キーと値のオブジェクトまたはキー
 * @param {any} value - 値（keyOrObjectが文字列の場合）
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function setLocalStorage(keyOrObject, value = undefined) {
    try {
        const data = typeof keyOrObject === 'string' 
            ? { [keyOrObject]: value }
            : keyOrObject;
            
        await chrome.storage.local.set(data);
        return true;
    } catch (error) {
        logError(error, 'setLocalStorage');
        return false;
    }
}

/**
 * 同期ストレージから値を取得する
 * @param {string|Array} keys - 取得するキー
 * @param {any} defaultValue - デフォルト値
 * @returns {Promise<any>} 取得した値
 */
export async function getSyncStorage(keys, defaultValue = null) {
    try {
        const result = await chrome.storage.sync.get(keys);
        
        if (typeof keys === 'string') {
            return result[keys] !== undefined ? result[keys] : defaultValue;
        }
        
        return result;
    } catch (error) {
        logError(error, 'getSyncStorage');
        return typeof keys === 'string' ? defaultValue : {};
    }
}

/**
 * 同期ストレージに値を設定する
 * @param {Object|string} keyOrObject - キーと値のオブジェクトまたはキー
 * @param {any} value - 値（keyOrObjectが文字列の場合）
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function setSyncStorage(keyOrObject, value = undefined) {
    try {
        const data = typeof keyOrObject === 'string' 
            ? { [keyOrObject]: value }
            : keyOrObject;
            
        await chrome.storage.sync.set(data);
        return true;
    } catch (error) {
        logError(error, 'setSyncStorage');
        return false;
    }
}

/**
 * ストレージから値を削除する
 * @param {string|Array} keys - 削除するキー
 * @param {boolean} sync - 同期ストレージかどうか
 * @returns {Promise<boolean>} 成功したかどうか
 */
export async function removeStorage(keys, sync = false) {
    try {
        const storage = sync ? chrome.storage.sync : chrome.storage.local;
        await storage.remove(keys);
        return true;
    } catch (error) {
        logError(error, 'removeStorage');
        return false;
    }
}

// ====================================
// デバイスID管理
// ====================================

/**
 * デバイスIDを取得または生成する
 * @returns {Promise<string>} デバイスID
 */
export async function getDeviceId() {
    try {
        let deviceId = await getLocalStorage('deviceId');
        
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
            await setLocalStorage('deviceId', deviceId);
        }
        
        return deviceId;
    } catch (error) {
        logError(error, 'getDeviceId');
        // フォールバック: 一時的なデバイスIDを生成
        return 'temp_' + Date.now();
    }
}

// ====================================
// メッセージング
// ====================================

/**
 * バックグラウンドスクリプトにメッセージを送信する
 * @param {Object} message - 送信するメッセージ
 * @returns {Promise<any>} レスポンス
 */
export async function sendMessageToBackground(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
    } catch (error) {
        logError(error, 'sendMessageToBackground');
        return null;
    }
}

/**
 * タブにメッセージを送信する
 * @param {number} tabId - タブID
 * @param {Object} message - 送信するメッセージ
 * @returns {Promise<any>} レスポンス
 */
export async function sendMessageToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        logError(error, 'sendMessageToTab');
        return null;
    }
}

/**
 * メッセージリスナーを追加する
 * @param {Function} callback - コールバック関数
 * @returns {Function} リスナー関数（削除用）
 */
export function addMessageListener(callback) {
    const listener = (message, sender, sendResponse) => {
        try {
            return callback(message, sender, sendResponse);
        } catch (error) {
            logError(error, 'messageListener');
            return false;
        }
    };
    
    chrome.runtime.onMessage.addListener(listener);
    return listener;
}

/**
 * メッセージリスナーを削除する
 * @param {Function} listener - 削除するリスナー関数
 */
export function removeMessageListener(listener) {
    chrome.runtime.onMessage.removeListener(listener);
}

// ====================================
// 拡張機能情報
// ====================================

/**
 * 拡張機能のURLを取得する
 * @param {string} path - パス
 * @returns {string} 完全なURL
 */
export function getExtensionURL(path) {
    return chrome.runtime.getURL(path);
}

/**
 * 拡張機能の情報を取得する
 * @returns {Object} 拡張機能情報
 */
export function getExtensionInfo() {
    const manifest = chrome.runtime.getManifest();
    return {
        id: chrome.runtime.id,
        version: manifest.version,
        name: manifest.name
    };
}

// ====================================
// 権限チェック
// ====================================

/**
 * 指定された権限があるかチェックする
 * @param {Object} permissions - チェックする権限
 * @returns {Promise<boolean>} 権限があるかどうか
 */
export async function checkPermissions(permissions) {
    try {
        const hasPermissions = await chrome.permissions.contains(permissions);
        return hasPermissions;
    } catch (error) {
        logError(error, 'checkPermissions');
        return false;
    }
}

/**
 * 権限を要求する
 * @param {Object} permissions - 要求する権限
 * @returns {Promise<boolean>} 権限が付与されたかどうか
 */
export async function requestPermissions(permissions) {
    try {
        const granted = await chrome.permissions.request(permissions);
        return granted;
    } catch (error) {
        logError(error, 'requestPermissions');
        return false;
    }
}