/**
 * フォーム探索スクリプト（リファクタリング版）
 * Webページ上で問い合わせフォーム（textarea）やコンタクトリンクを探索する
 * 
 * 旧explore.js(174行) → 新explore.js(約60行) に大幅削減
 */

// 共通定数とモジュールのインポート
import { ACTION_EXPLORE } from '../shared/constants.js';
import { 
    ContentScriptBase,
    findTextareasInAllDocuments,
    findContactLinks,
    getCurrentUrl
} from './common/content-script-base.js';

// ====================================
// Explore スクリプトクラス
// ====================================

class ExploreScript extends ContentScriptBase {
    constructor() {
        super(ACTION_EXPLORE);
    }
    
    /**
     * フォーム探索処理を実行する
     * @returns {Promise<void>}
     */
    async execute() {
        try {
            // 初期化（1秒待機）
            await this.initialize();
            
            // textarea探索（メインドキュメント + iframe）
            const textareaResult = findTextareasInAllDocuments();
            
            // textareaが見つかった場合
            if (textareaResult.textareas.length > 0) {
                await this.sendSuccess({
                    currentForm: true,
                    contactLink: ""
                });
                return;
            }
            
            // コンタクトリンク探索
            const contactLinks = findContactLinks(textareaResult.document);
            
            if (contactLinks.length > 0) {
                // 最適なコンタクトリンクを選択
                const bestContactLink = this.selectBestContactLink(contactLinks);
                
                if (bestContactLink) {
                    await this.sendSuccess({
                        currentForm: false,
                        contactLink: bestContactLink
                    });
                    return;
                }
            }
            
            // 何も見つからなかった場合
            await this.sendError(
                "問い合わせフォームまたはコンタクトリンクが見つかりませんでした",
                `textareas: ${textareaResult.textareas.length}, contactLinks: ${contactLinks.length}`
            );
            
        } catch (error) {
            await this.sendError(
                "探索処理中にエラーが発生しました",
                error.message
            );
        }
    }
    
    /**
     * 最適なコンタクトリンクを選択する
     * @param {Array<HTMLAnchorElement>} contactLinks - コンタクトリンクの配列
     * @returns {string|null} 選択されたリンクのURLまたはnull
     */
    selectBestContactLink(contactLinks) {
        const currentUrl = this.normalizeUrl(getCurrentUrl());
        
        // 優先度付きでリンクを評価
        const evaluatedLinks = contactLinks.map(link => {
            const href = this.normalizeUrl(link.href);
            const text = link.textContent || '';
            
            // 基本的な条件チェック
            if (!href.startsWith('http') || href === currentUrl) {
                return null;
            }
            
            // 優先度を計算
            let priority = 0;
            
            // URL内のキーワードによる優先度
            if (href.includes('contact')) priority += 10;
            if (href.includes('inquiry') || href.includes('inq')) priority += 8;
            
            // テキスト内のキーワードによる優先度
            if (text.includes('問い合わせ') || text.includes('問合')) priority += 15;
            if (text.includes('お問い合わせ')) priority += 12;
            if (text.includes('contact') || text.includes('Contact')) priority += 8;
            
            return {
                link: link,
                href: href,
                priority: priority
            };
        }).filter(item => item !== null);
        
        // 優先度でソートして最適なリンクを選択
        evaluatedLinks.sort((a, b) => b.priority - a.priority);
        
        return evaluatedLinks.length > 0 ? evaluatedLinks[0].href : null;
    }
    
    /**
     * URLを正規化する（末尾のスラッシュを削除）
     * @param {string} url - 正規化するURL
     * @returns {string} 正規化されたURL
     */
    normalizeUrl(url) {
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }
}

// ====================================
// スクリプト実行
// ====================================

// スクリプトを開始
const exploreScript = new ExploreScript();
exploreScript.execute();