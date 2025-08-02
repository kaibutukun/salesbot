/**
 * Content Script基底モジュール
 * 全てのcontent-scriptで共通的に使用される基本機能を提供
 * 
 * このモジュールはDOM操作、メッセージング、共通パターンを統一化します
 */

// ====================================
// 待機・タイミング制御
// ====================================

/**
 * 指定された時間待機する
 * @param {number} ms - 待機時間（ミリ秒）
 * @returns {Promise<void>}
 */
export async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 標準的な初期化待機（1秒）
 * @returns {Promise<void>}
 */
export async function waitForPageReady() {
    return wait(1000);
}

/**
 * 短い待機（500ms）
 * @returns {Promise<void>}
 */
export async function waitShort() {
    return wait(500);
}

// ====================================
// Chrome拡張メッセージング
// ====================================

/**
 * バックグラウンドスクリプトにメッセージを送信する
 * @param {Object} message - 送信するメッセージ
 * @returns {Promise<any>} レスポンス
 */
export async function sendMessageToBackground(message) {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        console.error('Failed to send message to background:', error);
        throw error;
    }
}

/**
 * 成功メッセージを送信する
 * @param {string} action - アクション名
 * @param {Object} data - 追加データ
 * @returns {Promise<any>} レスポンス
 */
export async function sendSuccessMessage(action, data = {}) {
    const message = {
        action: action,
        success: true,
        ...data
    };
    return sendMessageToBackground(message);
}

/**
 * エラーメッセージを送信する
 * @param {string} action - アクション名
 * @param {string} errorMessage - エラーメッセージ
 * @param {string} detail - 詳細情報
 * @returns {Promise<any>} レスポンス
 */
export async function sendErrorMessage(action, errorMessage, detail = '') {
    const message = {
        action: action,
        success: false,
        message: errorMessage,
        detail: detail
    };
    return sendMessageToBackground(message);
}

/**
 * キープアライブメッセージを送信する
 * @returns {Promise<any>} レスポンス
 */
export async function sendKeepalive() {
    return sendMessageToBackground({ action: "keepalive" });
}

// ====================================
// DOM要素検索・操作
// ====================================

/**
 * 指定したタグの要素を取得する
 * @param {string} tagName - タグ名
 * @param {Document} doc - 検索対象のドキュメント（デフォルト: document）
 * @returns {NodeList} 要素リスト
 */
export function getElementsByTagName(tagName, doc = document) {
    return doc.getElementsByTagName(tagName);
}

/**
 * 表示されているtextarea要素を取得する
 * @param {Document} doc - 検索対象のドキュメント（デフォルト: document）
 * @returns {Array<HTMLTextAreaElement>} 表示されているtextarea要素の配列
 */
export function getVisibleTextareas(doc = document) {
    const textareas = getElementsByTagName('textarea', doc);
    const visibleTextareas = [];

    for (let i = 0; i < textareas.length; i++) {
        const textarea = textareas[i];
        if (isElementVisible(textarea)) {
            visibleTextareas.push(textarea);
        }
    }

    return visibleTextareas;
}

/**
 * 要素が表示されているかチェックする
 * @param {HTMLElement} element - チェックする要素
 * @returns {boolean} 表示されているかどうか
 */
export function isElementVisible(element) {
    if (!element) return false;
    
    // display: noneをチェック
    if (element.style.display === 'none') return false;
    
    // より厳密な可視性チェック
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/**
 * iframe内のドキュメントにアクセス可能かチェックし、アクセス可能なら返す
 * @param {HTMLIFrameElement} iframe - iframe要素
 * @returns {Document|null} iframe内のドキュメントまたはnull
 */
export function getIframeDocument(iframe) {
    try {
        return iframe.contentDocument || iframe.contentWindow.document;
    } catch (error) {
        // Same-origin policyによりアクセスできない場合
        return null;
    }
}

/**
 * メインドキュメントとiframe内でtextareaを探索する
 * @returns {Object} 探索結果 {textareas: Array, document: Document}
 */
export function findTextareasInAllDocuments() {
    let targetDocument = document;
    let textareas = getVisibleTextareas(document);

    // メインドキュメントにtextareaがない場合はiframe内を探索
    if (textareas.length === 0) {
        const iframes = getElementsByTagName('iframe', document);
        
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            const iframeDoc = getIframeDocument(iframe);
            
            if (iframeDoc) {
                const iframeTextareas = getVisibleTextareas(iframeDoc);
                if (iframeTextareas.length > 0) {
                    targetDocument = iframeDoc;
                    textareas = iframeTextareas;
                    break;
                }
            }
        }
    }

    return {
        textareas: textareas,
        document: targetDocument
    };
}

// ====================================
// フォーム要素検索
// ====================================

/**
 * 送信ボタンを検索する
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {Array<HTMLElement>} 送信ボタンの配列
 */
export function findSubmitButtons(doc = document) {
    const buttons = [];
    
    // input[type="submit"]を検索
    const submitInputs = doc.querySelectorAll('input[type="submit"]');
    buttons.push(...submitInputs);
    
    // buttonタグを検索
    const buttonElements = getElementsByTagName('button', doc);
    for (let i = 0; i < buttonElements.length; i++) {
        const button = buttonElements[i];
        if (button.type === 'submit' || button.type === '') {
            buttons.push(button);
        }
    }
    
    return buttons;
}

/**
 * コンタクトリンクを検索する
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {Array<HTMLAnchorElement>} コンタクトリンクの配列
 */
export function findContactLinks(doc = document) {
    const links = getElementsByTagName('a', doc);
    const contactLinks = [];
    
    const contactPatterns = [
        /contact/i,
        /inquiry/i,
        /問い合わせ/i,
        /お問い合わせ/i,
        /相談/i,
        /ご相談/i
    ];
    
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const text = link.textContent || '';
        const href = link.href || '';
        
        for (const pattern of contactPatterns) {
            if (pattern.test(text) || pattern.test(href)) {
                contactLinks.push(link);
                break;
            }
        }
    }
    
    return contactLinks;
}

// ====================================
// reCAPTCHA検出
// ====================================

/**
 * reCAPTCHAの存在を検出する
 * @param {Document} doc - 検索対象のドキュメント（デフォルト: document）
 * @returns {boolean} reCAPTCHAが存在するかどうか
 */
export function detectRecaptcha(doc = document) {
    // reCAPTCHA関連の要素を検索
    const recaptchaSelectors = [
        '.g-recaptcha',
        '[data-sitekey]',
        '#recaptcha',
        '.recaptcha',
        'iframe[src*="recaptcha"]',
        'script[src*="recaptcha"]'
    ];
    
    for (const selector of recaptchaSelectors) {
        const elements = doc.querySelectorAll(selector);
        if (elements.length > 0) {
            return true;
        }
    }
    
    // reCAPTCHA関連のグローバル変数をチェック
    if (typeof window !== 'undefined') {
        if (window.grecaptcha || window.recaptcha) {
            return true;
        }
    }
    
    return false;
}

// ====================================
// ストレージ操作
// ====================================

/**
 * Chrome拡張のローカルストレージからデータを取得する
 * @param {string|Array} keys - 取得するキー
 * @returns {Promise<any>} 取得したデータ
 */
export async function getStorageData(keys) {
    try {
        return await chrome.storage.local.get(keys);
    } catch (error) {
        console.error('Failed to get storage data:', error);
        return {};
    }
}

/**
 * プロフィールデータを取得する
 * @returns {Promise<Object>} プロフィールデータ
 */
export async function getProfileData() {
    const data = await getStorageData(['optionPatterns', 'selectedPattern']);
    const profiles = data.optionPatterns || [];
    const selectedPatternId = data.selectedPattern;
    
    const profile = profiles.find(p => p.id === selectedPatternId);
    
    return {
        profiles: profiles,
        selectedProfile: profile,
        selectedPatternId: selectedPatternId
    };
}

// ====================================
// ユーティリティ
// ====================================

/**
 * 現在のURLを取得する
 * @returns {string} 現在のURL
 */
export function getCurrentUrl() {
    return window.location.href;
}

/**
 * 要素をクリックする
 * @param {HTMLElement} element - クリックする要素
 * @returns {boolean} クリックが成功したかどうか
 */
export function clickElement(element) {
    if (!element || !element.click) {
        return false;
    }
    
    try {
        element.click();
        return true;
    } catch (error) {
        console.error('Failed to click element:', error);
        return false;
    }
}

/**
 * 要素に値を設定する
 * @param {HTMLElement} element - 対象要素
 * @param {string} value - 設定する値
 * @returns {boolean} 設定が成功したかどうか
 */
export function setElementValue(element, value) {
    if (!element) return false;
    
    try {
        element.value = value;
        
        // イベントを発火させる
        const event = new Event('input', { bubbles: true });
        element.dispatchEvent(event);
        
        return true;
    } catch (error) {
        console.error('Failed to set element value:', error);
        return false;
    }
}

// ====================================
// 基底クラス
// ====================================

/**
 * Content Script基底クラス
 * 各content-scriptはこのクラスを継承して実装する
 */
export class ContentScriptBase {
    constructor(actionName) {
        this.actionName = actionName;
    }
    
    /**
     * スクリプトを実行する（サブクラスでオーバーライド）
     * @param {any} params - 実行パラメータ
     * @returns {Promise<void>}
     */
    async execute(params = null) {
        throw new Error('execute method must be implemented');
    }
    
    /**
     * 標準的な初期化処理
     * @returns {Promise<void>}
     */
    async initialize() {
        await waitForPageReady();
    }
    
    /**
     * 成功メッセージを送信する
     * @param {Object} data - 追加データ
     * @returns {Promise<any>}
     */
    async sendSuccess(data = {}) {
        return sendSuccessMessage(this.actionName, data);
    }
    
    /**
     * エラーメッセージを送信する
     * @param {string} message - エラーメッセージ
     * @param {string} detail - 詳細情報
     * @returns {Promise<any>}
     */
    async sendError(message, detail = '') {
        return sendErrorMessage(this.actionName, message, detail);
    }
}