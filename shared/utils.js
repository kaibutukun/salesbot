/**
 * 共通ユーティリティ関数
 * Chrome拡張機能全体で使用するヘルパー関数を提供
 */

// ====================================
// DOM操作ユーティリティ
// ====================================

/**
 * 要素を安全に取得する
 * @param {string} id - 要素のID
 * @returns {Element|null} DOM要素
 */
export function getElement(id) {
    try {
        return document.getElementById(id);
    } catch (error) {
        console.error(`Failed to get element: ${id}`, error);
        return null;
    }
}

/**
 * 複数の要素を安全に取得する
 * @param {string} selector - CSSセレクタ
 * @returns {NodeList} DOM要素のリスト
 */
export function getElements(selector) {
    try {
        return document.querySelectorAll(selector);
    } catch (error) {
        console.error(`Failed to get elements: ${selector}`, error);
        return [];
    }
}

/**
 * 要素の表示/非表示を切り替える
 * @param {Element} element - 対象要素
 * @param {boolean} visible - 表示するかどうか
 */
export function toggleElementVisibility(element, visible) {
    if (!element) return;
    
    element.style.display = visible ? 'block' : 'none';
}

/**
 * 要素にクラスを安全に追加する
 * @param {Element} element - 対象要素
 * @param {string} className - クラス名
 */
export function addClass(element, className) {
    if (element && className) {
        element.classList.add(className);
    }
}

/**
 * 要素からクラスを安全に削除する
 * @param {Element} element - 対象要素
 * @param {string} className - クラス名
 */
export function removeClass(element, className) {
    if (element && className) {
        element.classList.remove(className);
    }
}

// ====================================
// 文字列操作ユーティリティ
// ====================================

/**
 * 文字列をエスケープする
 * @param {string} str - 対象文字列
 * @returns {string} エスケープされた文字列
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * URLが有効かどうかチェックする
 * @param {string} url - チェック対象URL
 * @returns {boolean} 有効な場合はtrue
 */
export function isValidUrl(url) {
    if (typeof url !== 'string') return false;
    
    try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
    } catch {
        return false;
    }
}

/**
 * メールアドレスが有効かどうかチェックする
 * @param {string} email - チェック対象メールアドレス
 * @returns {boolean} 有効な場合はtrue
 */
export function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 文字列から数値を抽出する
 * @param {string} str - 対象文字列
 * @returns {number} 抽出された数値（見つからない場合は0）
 */
export function extractNumber(str) {
    if (typeof str !== 'string') return 0;
    
    const match = str.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}

/**
 * 文字列を指定された長さで切り詰める
 * @param {string} str - 対象文字列
 * @param {number} maxLength - 最大長
 * @param {string} suffix - 省略記号（デフォルト: '...'）
 * @returns {string} 切り詰められた文字列
 */
export function truncateString(str, maxLength, suffix = '...') {
    if (typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    
    return str.substring(0, maxLength - suffix.length) + suffix;
}

// ====================================
// 配列操作ユーティリティ
// ====================================

/**
 * 配列を指定されたサイズのチャンクに分割する
 * @param {Array} array - 分割する配列
 * @param {number} chunkSize - チャンクサイズ
 * @returns {Array[]} チャンクの配列
 */
export function chunkArray(array, chunkSize) {
    if (!Array.isArray(array)) return [];
    if (chunkSize <= 0) return [array];
    
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * 配列から重複を削除する
 * @param {Array} array - 対象配列
 * @returns {Array} 重複を削除した配列
 */
export function removeDuplicates(array) {
    if (!Array.isArray(array)) return [];
    
    return [...new Set(array)];
}

/**
 * 配列をシャッフルする
 * @param {Array} array - 対象配列
 * @returns {Array} シャッフルされた新しい配列
 */
export function shuffleArray(array) {
    if (!Array.isArray(array)) return [];
    
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// ====================================
// 日時操作ユーティリティ
// ====================================

/**
 * 日時を日本語形式でフォーマットする
 * @param {Date|string} date - 対象日時
 * @returns {string} フォーマットされた日時文字列
 */
export function formatDateJapanese(date) {
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        
        return d.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return '';
    }
}

/**
 * 相対時間を日本語で表示する
 * @param {Date|string} date - 対象日時
 * @returns {string} 相対時間の文字列
 */
export function getRelativeTime(date) {
    try {
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'たった今';
        if (diffMins < 60) return `${diffMins}分前`;
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays < 7) return `${diffDays}日前`;
        
        return formatDateJapanese(d);
    } catch {
        return '';
    }
}

/**
 * 時間文字列が制限時間内かどうかチェックする
 * @param {string} currentTime - 現在時刻（HH:MM形式）
 * @param {string} startTime - 制限開始時刻（HH:MM形式）
 * @param {string} endTime - 制限終了時刻（HH:MM形式）
 * @returns {boolean} 制限時間内の場合はtrue
 */
export function isTimeRestricted(currentTime, startTime, endTime) {
    try {
        const current = timeStringToMinutes(currentTime);
        const start = timeStringToMinutes(startTime);
        const end = timeStringToMinutes(endTime);
        
        if (start <= end) {
            // 同日内の制限（例：09:00-17:00）
            return current >= start && current <= end;
        } else {
            // 日をまたぐ制限（例：22:00-08:00）
            return current >= start || current <= end;
        }
    } catch {
        return false;
    }
}

/**
 * 時間文字列を分に変換する
 * @param {string} timeString - 時間文字列（HH:MM形式）
 * @returns {number} 分数
 */
function timeStringToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

// ====================================
// 数値操作ユーティリティ
// ====================================

/**
 * 数値を3桁区切りでフォーマットする
 * @param {number} num - 対象数値
 * @returns {string} フォーマットされた文字列
 */
export function formatNumber(num) {
    if (typeof num !== 'number') return '0';
    
    return num.toLocaleString('ja-JP');
}

/**
 * パーセンテージを計算する
 * @param {number} numerator - 分子
 * @param {number} denominator - 分母
 * @param {number} decimals - 小数点以下桁数（デフォルト: 1）
 * @returns {number} パーセンテージ
 */
export function calculatePercentage(numerator, denominator, decimals = 1) {
    if (typeof numerator !== 'number' || typeof denominator !== 'number') return 0;
    if (denominator === 0) return 0;
    
    const percentage = (numerator / denominator) * 100;
    return Math.round(percentage * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * 数値を指定範囲内にクランプする
 * @param {number} value - 対象値
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @returns {number} クランプされた値
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// ====================================
// 非同期処理ユーティリティ
// ====================================

/**
 * 指定時間待機する
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise} Promiseオブジェクト
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 関数を指定回数リトライする
 * @param {Function} fn - 実行する関数
 * @param {number} maxRetries - 最大リトライ回数
 * @param {number} delay - リトライ間隔（ミリ秒）
 * @returns {Promise} Promiseオブジェクト
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (i < maxRetries) {
                await sleep(delay);
            }
        }
    }
    
    throw lastError;
}

/**
 * Promise配列を順次実行する
 * @param {Function[]} promiseFunctions - Promise返す関数の配列
 * @param {number} concurrency - 同時実行数（デフォルト: 1）
 * @returns {Promise<Array>} 結果の配列
 */
export async function promiseSequence(promiseFunctions, concurrency = 1) {
    const results = [];
    const chunks = chunkArray(promiseFunctions, concurrency);
    
    for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
            chunk.map(fn => fn())
        );
        results.push(...chunkResults);
    }
    
    return results;
}

// ====================================
// Chrome Extension 専用ユーティリティ
// ====================================

/**
 * Chrome storage データを安全に取得する
 * @param {string} storageType - 'local' または 'sync'
 * @param {string|Array|Object} keys - 取得するキー
 * @returns {Promise<Object>} ストレージデータ
 */
export async function getChromeStorage(storageType = 'local', keys = null) {
    try {
        const storage = chrome.storage[storageType];
        if (!storage) throw new Error(`Invalid storage type: ${storageType}`);
        
        return await storage.get(keys);
    } catch (error) {
        console.error(`Failed to get chrome storage (${storageType}):`, error);
        return {};
    }
}

/**
 * Chrome storage にデータを安全に保存する
 * @param {string} storageType - 'local' または 'sync'
 * @param {Object} data - 保存するデータ
 * @returns {Promise<boolean>} 成功時はtrue
 */
export async function setChromeStorage(storageType = 'local', data = {}) {
    try {
        const storage = chrome.storage[storageType];
        if (!storage) throw new Error(`Invalid storage type: ${storageType}`);
        
        await storage.set(data);
        return true;
    } catch (error) {
        console.error(`Failed to set chrome storage (${storageType}):`, error);
        return false;
    }
}

/**
 * Chrome runtime メッセージを安全に送信する
 * @param {Object} message - 送信するメッセージ
 * @param {Function} responseCallback - レスポンスコールバック（オプション）
 * @returns {Promise<any>} レスポンス
 */
export function sendChromeMessage(message, responseCallback = null) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                
                if (responseCallback) {
                    responseCallback(response);
                }
                resolve(response);
            });
        } catch (error) {
            reject(error);
        }
    });
}

// ====================================
// デバッグユーティリティ
// ====================================

/**
 * オブジェクトを安全にログ出力する
 * @param {string} label - ラベル
 * @param {any} data - ログ出力するデータ
 * @param {string} level - ログレベル（default: 'log'）
 */
export function safeLog(label, data, level = 'log') {
    try {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] ${label}:`, data);
    } catch (error) {
        console.error(`Failed to log: ${label}`, error);
    }
}

/**
 * Chrome storage の内容をデバッグ出力する
 * @param {string} storageType - 'local' または 'sync'
 */
export async function debugStorage(storageType = 'local') {
    try {
        const data = await getChromeStorage(storageType);
        safeLog(`Chrome Storage (${storageType})`, data, 'log');
    } catch (error) {
        console.error(`Failed to debug storage: ${storageType}`, error);
    }
}

// ====================================
// エラーハンドリングユーティリティ
// ====================================

/**
 * エラーを安全に処理する
 * @param {Error} error - エラーオブジェクト
 * @param {string} context - エラーが発生したコンテキスト
 * @param {Function} onError - エラー処理関数（オプション）
 */
export function handleError(error, context = 'Unknown', onError = null) {
    const errorMessage = error?.message || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace';
    
    console.error(`Error in ${context}:`, {
        message: errorMessage,
        stack: errorStack,
        error: error
    });
    
    if (onError && typeof onError === 'function') {
        try {
            onError(error, context);
        } catch (handlerError) {
            console.error('Error in error handler:', handlerError);
        }
    }
}

/**
 * 関数を安全に実行する（エラーキャッチ付き）
 * @param {Function} fn - 実行する関数
 * @param {string} context - コンテキスト
 * @param {any} defaultValue - エラー時のデフォルト値
 * @returns {any} 実行結果またはデフォルト値
 */
export function safeExecute(fn, context = 'Function', defaultValue = null) {
    try {
        return fn();
    } catch (error) {
        handleError(error, context);
        return defaultValue;
    }
}

/**
 * 非同期関数を安全に実行する（エラーキャッチ付き）
 * @param {Function} fn - 実行する非同期関数
 * @param {string} context - コンテキスト
 * @param {any} defaultValue - エラー時のデフォルト値
 * @returns {Promise<any>} 実行結果またはデフォルト値
 */
export async function safeExecuteAsync(fn, context = 'AsyncFunction', defaultValue = null) {
    try {
        return await fn();
    } catch (error) {
        handleError(error, context);
        return defaultValue;
    }
}

// ====================================
// データ変換ユーティリティ
// ====================================

/**
 * オブジェクトを安全にJSONに変換する
 * @param {any} data - 変換するデータ
 * @param {number} space - インデント数（デフォルト: 0）
 * @returns {string} JSON文字列
 */
export function safeJsonStringify(data, space = 0) {
    try {
        return JSON.stringify(data, null, space);
    } catch (error) {
        console.error('Failed to stringify JSON:', error);
        return '{}';
    }
}

/**
 * JSON文字列を安全にパースする
 * @param {string} jsonString - JSON文字列
 * @param {any} defaultValue - パース失敗時のデフォルト値
 * @returns {any} パース結果またはデフォルト値
 */
export function safeJsonParse(jsonString, defaultValue = {}) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Failed to parse JSON:', error);
        return defaultValue;
    }
}

// ====================================
// URL・ドメイン操作ユーティリティ
// ====================================

/**
 * URLからドメイン名を抽出する
 * @param {string} url - 対象URL
 * @returns {string} ドメイン名（抽出失敗時は空文字）
 */
export function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return '';
    }
}

/**
 * URLリストから無効なURLを除外する
 * @param {Array<string>} urls - URLの配列
 * @returns {Array<string>} 有効なURLのみの配列
 */
export function filterValidUrls(urls) {
    if (!Array.isArray(urls)) return [];
    
    return urls.filter(url => isValidUrl(url));
}

/**
 * URLを正規化する（末尾スラッシュ除去など）
 * @param {string} url - 対象URL
 * @returns {string} 正規化されたURL
 */
export function normalizeUrl(url) {
    if (!isValidUrl(url)) return url;
    
    try {
        const urlObj = new URL(url);
        // 末尾のスラッシュを除去
        const pathname = urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1 
            ? urlObj.pathname.slice(0, -1) 
            : urlObj.pathname;
        
        return `${urlObj.protocol}//${urlObj.host}${pathname}${urlObj.search}${urlObj.hash}`;
    } catch {
        return url;
    }
}

// コンソールにロード完了メッセージを出力
console.log('utils.js loaded - All utility functions available');