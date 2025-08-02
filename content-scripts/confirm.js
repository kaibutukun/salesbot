/**
 * フォーム確認スクリプト（リファクタリング版）
 * 問い合わせフォームの確認ページで送信ボタンをクリックする処理
 * 
 * 旧confirm.js(141行) → 新confirm.js(約70行) に大幅削減
 */

// 共通定数とモジュールのインポート
import { ACTION_CONFIRM, FORM_TIMEOUT } from '../shared/constants.js';
import { 
    ContentScriptBase,
    getVisibleTextareas,
    clickElement,
    wait
} from './common/content-script-base.js';

// ====================================
// Confirm スクリプトクラス
// ====================================

class ConfirmScript extends ContentScriptBase {
    constructor() {
        super(ACTION_CONFIRM);
    }
    
    /**
     * フォーム確認処理を実行する
     * @returns {Promise<void>}
     */
    async execute() {
        try {
            // 初期化（1秒待機）
            await this.initialize();
            
            // textareaの確認処理
            const isTextareaValid = this.validateTextareas();
            if (!isTextareaValid) {
                await this.sendError(
                    "対応できない問い合わせフォームです",
                    "textareaに予期しない値が入力されています"
                );
                return;
            }
            
            // 送信ボタンの検索
            const submitButtons = this.findSubmitButtons();
            
            // 送信ボタンが見つからない場合は成功として処理
            if (submitButtons.length === 0) {
                await this.sendSuccess();
                return;
            }
            
            // 最後のボタンをクリック
            const targetButton = submitButtons[submitButtons.length - 1];
            const clickSuccess = clickElement(targetButton);
            
            if (!clickSuccess) {
                await this.sendError(
                    "送信ボタンのクリックに失敗しました",
                    "ボタンが無効または存在しません"
                );
                return;
            }
            
            // 送信処理完了を待つ
            await wait(FORM_TIMEOUT);
            
            // 成功メッセージを送信
            await this.sendSuccess();
            
        } catch (error) {
            await this.sendError(
                "フォーム確認処理中にエラーが発生しました",
                error.message
            );
        }
    }
    
    /**
     * textareaの値をチェックする
     * @returns {boolean} 有効かどうか
     */
    validateTextareas() {
        const textareas = getVisibleTextareas();
        
        // 表示されているtextareaがある場合、最後のtextareaに値が入っていないかチェック
        if (textareas.length > 0) {
            const lastTextarea = textareas[textareas.length - 1];
            if (lastTextarea.value !== '') {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 送信ボタンを検索する
     * @returns {Array<HTMLElement>} 送信ボタンの配列
     */
    findSubmitButtons() {
        const submitButtons = [];
        
        // テキストベースのボタン検索
        const textButtons = this.findTextBasedButtons();
        submitButtons.push(...textButtons);
        
        // input要素のボタン検索
        const inputButtons = this.findInputButtons();
        submitButtons.push(...inputButtons);
        
        // 画像ボタン検索
        const imageButtons = this.findImageButtons();
        submitButtons.push(...imageButtons);
        
        return submitButtons;
    }
    
    /**
     * テキストベースのボタンを検索する
     * @returns {Array<HTMLElement>} ボタンの配列
     */
    findTextBasedButtons() {
        const textButtons = document.querySelectorAll('span, button');
        const submitKeywords = ['送信', '送 信', '送　信', 'はい', 'OK', '同意する', '続行'];
        
        return Array.from(textButtons).filter(button => {
            const text = button.innerText || '';
            return submitKeywords.some(keyword => text.includes(keyword));
        });
    }
    
    /**
     * input要素のボタンを検索する
     * @returns {Array<HTMLElement>} ボタンの配列
     */
    findInputButtons() {
        const inputButtons = document.querySelectorAll('input[type="submit"], input[type="button"]');
        const submitKeywords = ['送信', '送 信', '送　信', '問い合', '問合', 'はい', 'OK', '同意する', '続行'];
        
        return Array.from(inputButtons).filter(button => {
            const value = button.value || '';
            return submitKeywords.some(keyword => value.includes(keyword));
        });
    }
    
    /**
     * 画像ボタンを検索する
     * @returns {Array<HTMLElement>} ボタンの配列
     */
    findImageButtons() {
        const imageButtons = document.querySelectorAll('input[type="image"]');
        const submitKeywords = ['送信', '確認', 'はい', 'OK', '同意する', '続行'];
        
        return Array.from(imageButtons).filter(button => {
            const alt = button.alt || '';
            return submitKeywords.some(keyword => alt.includes(keyword));
        });
    }
}

// ====================================
// スクリプト実行
// ====================================

// スクリプトを開始
const confirmScript = new ConfirmScript();
confirmScript.execute();