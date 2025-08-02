/**
 * reCAPTCHA確認スクリプト（リファクタリング版）
 * ページ上でreCAPTCHAの存在を確認し、結果をbackground.jsに送信する
 * 
 * 旧recheck.js(97行) → 新recheck.js(約35行) に大幅削減
 */

// 共通定数とモジュールのインポート
import { ACTION_RECHECK } from '../shared/constants.js';
import { 
    ContentScriptBase,
    findTextareasInAllDocuments,
    detectRecaptcha,
    waitShort
} from './common/content-script-base.js';

// ====================================
// Recheck スクリプトクラス
// ====================================

class RecheckScript extends ContentScriptBase {
    constructor() {
        super(ACTION_RECHECK);
    }
    
    /**
     * reCAPTCHA確認処理を実行する
     * @returns {Promise<void>}
     */
    async execute() {
        try {
            // 初期化（500ms待機）
            await waitShort();
            
            // textarea探索でドキュメントを特定
            const result = findTextareasInAllDocuments();
            const targetDocument = result.document;
            
            // reCAPTCHA検出
            const hasRecaptcha = detectRecaptcha(targetDocument);
            
            // 結果をメッセージで送信
            await this.sendMessage(hasRecaptcha);
            
        } catch (error) {
            await this.sendMessage(false, error.message);
        }
    }
    
    /**
     * reCAPTCHA検出結果をメッセージで送信する
     * @param {boolean} isRecaptcha - reCAPTCHAが存在するかどうか
     * @param {string} errorDetail - エラー詳細（オプション）
     * @returns {Promise<any>}
     */
    async sendMessage(isRecaptcha, errorDetail = '') {
        const message = {
            action: ACTION_RECHECK,
            isRecaptcha: isRecaptcha,
            message: errorDetail ? "Error" : "Success",
            detail: errorDetail
        };
        
        return chrome.runtime.sendMessage(message);
    }
}

// ====================================
// スクリプト実行
// ====================================

// スクリプトを開始
const recheckScript = new RecheckScript();
recheckScript.execute();