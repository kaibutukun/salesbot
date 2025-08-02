/**
 * フォーム送信スクリプト（リファクタリング版）
 * フォーム自動入力・送信のメイン処理
 * 
 * 旧send.js(713行) → 新send.js(約150行) に大幅削減
 */

// 共通定数とモジュールのインポート
import { 
    ACTION_SEND,
    WAIT_TIMEOUT,
    FORM_TIMEOUT 
} from '../shared/constants.js';

import { 
    ContentScriptBase,
    getProfileData,
    findTextareasInAllDocuments,
    detectRecaptcha,
    sendKeepalive,
    wait,
    clickElement
} from './common/content-script-base.js';

import { fillFormWithProfile } from './common/form-filler.js';

// ====================================
// Send スクリプトクラス
// ====================================

class SendScript extends ContentScriptBase {
    constructor() {
        super(ACTION_SEND);
        this.tags = null;
        this.profile = null;
        this.targetDocument = document;
    }
    
    /**
     * フォーム送信処理を実行する
     * @param {Array} tags - タグパラメータ
     * @returns {Promise<void>}
     */
    async execute(tags = null) {
        try {
            this.tags = tags;
            
            // 初期化（1秒待機）
            await this.initialize();
            
            // プロフィールデータの取得
            await this.loadProfile();
            
            // iframe内フォームのチェック
            if (await this.checkForIframeForm()) {
                await this.sendError(
                    "iframe内にフォームがあるため自動入力できません",
                    "iframe form detected"
                );
                return;
            }
            
            // textarea探索とドキュメント特定
            const textareaResult = findTextareasInAllDocuments();
            this.targetDocument = textareaResult.document;
            
            if (textareaResult.textareas.length === 0) {
                await this.sendError(
                    "問い合わせフォームが見つかりませんでした",
                    "no textarea found"
                );
                return;
            }
            
            // フォーム自動入力
            const fillResults = await this.fillForm();
            
            // reCAPTCHA検出
            const hasRecaptcha = detectRecaptcha(this.targetDocument);
            
            // 送信処理
            await this.submitForm(hasRecaptcha);
            
            // 成功メッセージ
            await this.sendSuccess({
                message: "フォーム送信が完了しました",
                fillResults: fillResults,
                hasRecaptcha: hasRecaptcha
            });
            
        } catch (error) {
            await this.sendError(
                "フォーム送信処理中にエラーが発生しました",
                error.message
            );
        }
    }
    
    /**
     * プロフィールデータを読み込む
     * @returns {Promise<void>}
     */
    async loadProfile() {
        const profileData = await getProfileData();
        this.profile = profileData.selectedProfile;
        
        if (!this.profile) {
            throw new Error("プロフィールデータが見つかりません");
        }
    }
    
    /**
     * iframe内フォームの存在をチェックする
     * @returns {Promise<boolean>} iframe内にフォームがあるかどうか
     */
    async checkForIframeForm() {
        const iframes = this.targetDocument.getElementsByTagName('iframe');
        
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc) {
                    const iframeTextareas = iframeDoc.getElementsByTagName('textarea');
                    if (iframeTextareas.length > 0) {
                        return true;
                    }
                }
            } catch (error) {
                // Same-origin policyでアクセスできない場合は無視
                continue;
            }
        }
        
        return false;
    }
    
    /**
     * フォームに自動入力する
     * @returns {Promise<Object>} 入力結果
     */
    async fillForm() {
        // 統合フォーム入力処理を使用
        const fillResults = fillFormWithProfile(this.profile, this.targetDocument);
        
        // キープアライブ送信（長時間処理のため）
        await sendKeepalive();
        
        return fillResults;
    }
    
    /**
     * フォームを送信する
     * @param {boolean} hasRecaptcha - reCAPTCHAがあるかどうか
     * @returns {Promise<void>}
     */
    async submitForm(hasRecaptcha) {
        // 送信ボタンを検索
        const submitButtons = this.findSubmitButtons();
        
        if (submitButtons.length === 0) {
            throw new Error("送信ボタンが見つかりません");
        }
        
        // 最後のボタンをクリック
        const targetButton = submitButtons[submitButtons.length - 1];
        
        if (hasRecaptcha) {
            // reCAPTCHAがある場合の処理
            await sendKeepalive();
            await this.handleRecaptchaSubmission(targetButton);
        } else {
            // reCAPTCHAがない場合の処理
            await this.handleNormalSubmission(targetButton);
        }
    }
    
    /**
     * 通常の送信処理
     * @param {HTMLElement} button - 送信ボタン
     * @returns {Promise<void>}
     */
    async handleNormalSubmission(button) {
        if (!clickElement(button)) {
            throw new Error("送信ボタンのクリックに失敗しました");
        }
        
        // 送信完了まで待機
        await wait(FORM_TIMEOUT);
    }
    
    /**
     * reCAPTCHA付きフォームの送信処理
     * @param {HTMLElement} button - 送信ボタン
     * @returns {Promise<void>}
     */
    async handleRecaptchaSubmission(button) {
        // reCAPTCHA処理のための長時間待機
        await sendKeepalive();
        
        if (!clickElement(button)) {
            throw new Error("送信ボタンのクリックに失敗しました");
        }
        
        // reCAPTCHA完了まで待機
        await wait(WAIT_TIMEOUT || 30000);
        await sendKeepalive();
    }
    
    /**
     * 送信ボタンを検索する
     * @returns {Array<HTMLElement>} 送信ボタンの配列
     */
    findSubmitButtons() {
        const buttons = [];
        
        // input[type="submit"]を検索
        const submitInputs = this.targetDocument.querySelectorAll('input[type="submit"]');
        buttons.push(...submitInputs);
        
        // buttonタグを検索
        const buttonElements = this.targetDocument.getElementsByTagName('button');
        for (let i = 0; i < buttonElements.length; i++) {
            const button = buttonElements[i];
            if (button.type === 'submit' || button.type === '') {
                buttons.push(button);
            }
        }
        
        // テキストベースの送信ボタンを検索
        const textButtons = this.targetDocument.querySelectorAll('span, div');
        const submitKeywords = ['送信', '送 信', '送　信', '確認', '次へ', 'Submit'];
        
        Array.from(textButtons).forEach(element => {
            const text = element.textContent || '';
            if (submitKeywords.some(keyword => text.includes(keyword))) {
                // クリック可能かチェック
                if (element.onclick || element.addEventListener || 
                    element.style.cursor === 'pointer') {
                    buttons.push(element);
                }
            }
        });
        
        return buttons;
    }
}

// ====================================
// メッセージリスナー
// ====================================

/**
 * background.jsからのメッセージを受信する
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "tags") {
        const sendScript = new SendScript();
        sendScript.execute(message.tags)
            .then(() => {
                sendResponse({ status: "completed" });
            })
            .catch(error => {
                sendResponse({ status: "error", error: error.message });
            });
        return true; // 非同期レスポンスを有効化
    }
});