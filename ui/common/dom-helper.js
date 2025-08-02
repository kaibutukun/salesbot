/**
 * 共通DOM操作ヘルパーモジュール
 * UI関連ファイルで共通的に使用されるDOM操作機能を統一化
 * 
 * このモジュールはDOM要素の安全な取得・操作、エラーハンドリングを提供します
 */

// ====================================
// DOM要素操作
// ====================================

/**
 * 安全にDOM要素を取得する
 * @param {string} id - 要素のID
 * @param {boolean} required - 必須要素かどうか（デフォルト: true）
 * @returns {HTMLElement|null} DOM要素
 * @throws {Error} required=trueで要素が見つからない場合
 */
export function getElement(id, required = true) {
    const element = document.getElementById(id);
    
    if (!element && required) {
        throw new Error(`Required element with ID '${id}' not found`);
    }
    
    return element;
}

/**
 * 複数のDOM要素を一括取得する
 * @param {Array<string>} ids - 要素IDの配列
 * @param {boolean} required - 必須要素かどうか（デフォルト: true）
 * @returns {Object} {id: element} の形式のオブジェクト
 */
export function getElements(ids, required = true) {
    const elements = {};
    const missing = [];
    
    for (const id of ids) {
        const element = document.getElementById(id);
        if (element) {
            elements[id] = element;
        } else {
            elements[id] = null;
            if (required) {
                missing.push(id);
            }
        }
    }
    
    if (required && missing.length > 0) {
        throw new Error(`Required elements not found: ${missing.join(', ')}`);
    }
    
    return elements;
}

/**
 * 要素の値を安全に設定する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} value - 設定する値
 * @returns {boolean} 成功したかどうか
 */
export function setElementValue(elementOrId, value) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        if (element.type === 'checkbox' || element.type === 'radio') {
            element.checked = Boolean(value);
        } else {
            element.value = value || '';
        }
        
        return true;
    } catch (error) {
        console.warn('Failed to set element value:', error);
        return false;
    }
}

/**
 * 要素の値を安全に取得する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} defaultValue - デフォルト値
 * @returns {string} 要素の値
 */
export function getElementValue(elementOrId, defaultValue = '') {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return defaultValue;
        
        if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked;
        }
        
        return element.value || defaultValue;
    } catch (error) {
        console.warn('Failed to get element value:', error);
        return defaultValue;
    }
}

/**
 * 要素の表示/非表示を切り替える
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {boolean} visible - 表示するかどうか
 * @returns {boolean} 成功したかどうか
 */
export function setElementVisible(elementOrId, visible) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.style.display = visible ? '' : 'none';
        return true;
    } catch (error) {
        console.warn('Failed to set element visibility:', error);
        return false;
    }
}

/**
 * 要素の有効/無効を切り替える
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {boolean} enabled - 有効にするかどうか
 * @returns {boolean} 成功したかどうか
 */
export function setElementEnabled(elementOrId, enabled) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.disabled = !enabled;
        return true;
    } catch (error) {
        console.warn('Failed to set element enabled state:', error);
        return false;
    }
}

/**
 * 要素にクラスを追加/削除する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} className - クラス名
 * @param {boolean} add - 追加するかどうか（デフォルト: true）
 * @returns {boolean} 成功したかどうか
 */
export function toggleElementClass(elementOrId, className, add = true) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        if (add) {
            element.classList.add(className);
        } else {
            element.classList.remove(className);
        }
        
        return true;
    } catch (error) {
        console.warn('Failed to toggle element class:', error);
        return false;
    }
}

/**
 * 要素のHTMLコンテンツを安全に設定する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} html - HTMLコンテンツ
 * @returns {boolean} 成功したかどうか
 */
export function setElementHTML(elementOrId, html) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.innerHTML = html || '';
        return true;
    } catch (error) {
        console.warn('Failed to set element HTML:', error);
        return false;
    }
}

/**
 * 要素のテキストコンテンツを安全に設定する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} text - テキストコンテンツ
 * @returns {boolean} 成功したかどうか
 */
export function setElementText(elementOrId, text) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.textContent = text || '';
        return true;
    } catch (error) {
        console.warn('Failed to set element text:', error);
        return false;
    }
}

// ====================================
// イベント管理
// ====================================

/**
 * 安全にイベントリスナーを追加する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} eventType - イベントタイプ
 * @param {Function} handler - ハンドラー関数
 * @param {Object} options - イベントオプション
 * @returns {boolean} 成功したかどうか
 */
export function addEventHandler(elementOrId, eventType, handler, options = {}) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.addEventListener(eventType, handler, options);
        return true;
    } catch (error) {
        console.warn('Failed to add event handler:', error);
        return false;
    }
}

/**
 * 安全にイベントリスナーを削除する
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {string} eventType - イベントタイプ
 * @param {Function} handler - ハンドラー関数
 * @returns {boolean} 成功したかどうか
 */
export function removeEventHandler(elementOrId, eventType, handler) {
    try {
        const element = typeof elementOrId === 'string' 
            ? getElement(elementOrId, false) 
            : elementOrId;
            
        if (!element) return false;
        
        element.removeEventListener(eventType, handler);
        return true;
    } catch (error) {
        console.warn('Failed to remove event handler:', error);
        return false;
    }
}

// ====================================
// DOMContentLoaded管理
// ====================================

/**
 * DOMContentLoadedイベントを安全に待機する
 * @param {Function} callback - コールバック関数
 */
export function onDOMReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback);
    } else {
        // DOMが既に読み込まれている場合は即座に実行
        callback();
    }
}

// ====================================
// ユーティリティ
// ====================================

/**
 * DOM要素が存在するかチェックする
 * @param {string} id - 要素のID
 * @returns {boolean} 存在するかどうか
 */
export function elementExists(id) {
    return document.getElementById(id) !== null;
}

/**
 * フォーム要素をクリアする
 * @param {string|HTMLElement} formOrId - フォーム要素またはID
 * @returns {boolean} 成功したかどうか
 */
export function clearForm(formOrId) {
    try {
        const form = typeof formOrId === 'string' 
            ? getElement(formOrId, false) 
            : formOrId;
            
        if (!form) return false;
        
        form.reset();
        return true;
    } catch (error) {
        console.warn('Failed to clear form:', error);
        return false;
    }
}