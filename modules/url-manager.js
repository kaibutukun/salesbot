/**
 * URL管理モジュール
 * URLリストの読み込み、保存、クリア機能と実行ボタンの状態管理を担当
 */

// 共通モジュールのインポート
import { ExDB } from '../shared/database.js';

/**
 * URL管理クラス
 */
export class UrlManager {
    constructor(showToastFn = null, getElementFn = null, refreshDashboardFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.refreshDashboardFunction = refreshDashboardFn;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            urlListTextarea: this.getElement('urlListTextarea'),
            saveUrlListButton: this.getElement('saveUrlList'),
            clearUrlListButton: this.getElement('clearUrlList'),
            executeFromUrlTabButton: this.getElement('executeFromUrlTab')
        };
    }

    /**
     * 要素を取得するヘルパー関数
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    getElement(id) {
        if (this.getElementFunction) {
            return this.getElementFunction(id);
        }
        return document.getElementById(id);
    }

    /**
     * トーストメッセージを表示
     * @param {string} message - 表示メッセージ
     * @param {string} type - メッセージタイプ
     */
    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }

    /**
     * ダッシュボードを更新
     */
    async refreshDashboard() {
        if (this.refreshDashboardFunction) {
            await this.refreshDashboardFunction();
        }
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        if (this.elements.saveUrlListButton) {
            this.elements.saveUrlListButton.addEventListener('click', () => this.saveUrlList());
        }
        if (this.elements.clearUrlListButton) {
            this.elements.clearUrlListButton.addEventListener('click', () => this.clearUrlList());
        }
        // executeFromUrlTabButtonのイベントリスナーは外部で管理されるため、ここでは設定しない
    }

    /**
     * URLリストを読み込む
     */
    async loadUrlList() {
        try {
            if (!this.elements.urlListTextarea) return;

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (latestTodo && !latestTodo.completed && latestTodo.description) {
                const urls = latestTodo.description.map(item => item.url).join('\n');
                this.elements.urlListTextarea.value = urls;
            } else {
                this.elements.urlListTextarea.value = '';
            }
        } catch (error) {
            this.showToast('URLリストの読み込みに失敗しました', 'error');
        }
    }

    /**
     * URLリストを保存する
     */
    async saveUrlList() {
        try {
            if (!this.elements.urlListTextarea) return;

            const urls = this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
            
            if (urls.length === 0) {
                this.showToast('URLを入力してください', 'warning');
                return;
            }

            const db = new ExDB();
            await db.deleteLatestIncompleteTodo();

            const date = new Date();
            const title = date.toLocaleString('ja-JP');
            const description = urls.map(url => ({
                url,
                result: '',
                contact: '',
                reason: ''
            }));

            await db.addTodo(title, description);
            this.showToast('URLリストを保存しました', 'success');
            await this.refreshDashboard();
        } catch (error) {
            this.showToast('URLリストの保存に失敗しました', 'error');
        }
    }

    /**
     * URLリストをクリアする
     */
    async clearUrlList() {
        try {
            if (!this.elements.urlListTextarea) return;

            if (!confirm('URLリストをクリアしますか？')) {
                return;
            }

            const db = new ExDB();
            await db.deleteLatestIncompleteTodo();
            this.elements.urlListTextarea.value = '';
            await this.refreshDashboard();
            this.showToast('URLリストをクリアしました', 'info');
        } catch (error) {
            this.showToast('URLリストのクリアに失敗しました', 'error');
        }
    }

    /**
     * 現在のURLリストを取得する
     * @returns {Array<string>} URLの配列
     */
    getCurrentUrls() {
        if (!this.elements.urlListTextarea) return [];
        return this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
    }

    /**
     * URLリストが空かどうかを確認する
     * @returns {boolean} 空の場合true
     */
    isUrlListEmpty() {
        return this.getCurrentUrls().length === 0;
    }

    /**
     * 実行ボタンの状態を設定する（停止状態）
     * @param {Function} stopHandler - 停止ハンドラー関数
     */
    setExecuteButtonToStopState(stopHandler) {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="/assets/icons/stop.png" alt="送信停止" />送信停止';
            this.elements.executeFromUrlTabButton.className = 'stop-button';
            this.elements.executeFromUrlTabButton.removeEventListener('click', this.originalExecuteHandler);
            this.elements.executeFromUrlTabButton.addEventListener('click', stopHandler);
        }
    }

    /**
     * 実行ボタンの状態を設定する（実行状態）
     * @param {Function} executeHandler - 実行ハンドラー関数
     */
    setExecuteButtonToExecuteState(executeHandler) {
        if (this.elements.executeFromUrlTabButton) {
            this.originalExecuteHandler = executeHandler;
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="/assets/icons/play.png" alt="送信開始" />送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            this.elements.executeFromUrlTabButton.removeEventListener('click', this.originalStopHandler);
            this.elements.executeFromUrlTabButton.addEventListener('click', executeHandler);
        }
    }

    /**
     * 実行ボタンを無効化する（停止中状態）
     */
    setExecuteButtonToDisabledState() {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.disabled = true;
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="/assets/icons/stop.png" alt="停止中" />停止中...';
        }
    }

    /**
     * ExDBから最新のTodoが存在するかチェックし、URLリストの状態を検証する
     * @returns {Promise<{isValid: boolean, message: string}>} 検証結果
     */
    async validateUrlList() {
        try {
            // テキストエリアのURLチェック
            if (this.elements.urlListTextarea) {
                const urls = this.getCurrentUrls();
                if (urls.length === 0) {
                    return {
                        isValid: false,
                        message: '送信先URLが入力されていません'
                    };
                }
            }

            // ExDBの最新Todoチェック
            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
                return {
                    isValid: false,
                    message: '送信先URLが設定されていません'
                };
            }

            return {
                isValid: true,
                message: ''
            };
        } catch (error) {
            return {
                isValid: false,
                message: 'URLリストの検証中にエラーが発生しました'
            };
        }
    }
}

/**
 * URLマネージャーインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - 要素取得関数
 * @param {Function} refreshDashboardFn - ダッシュボード更新関数
 * @returns {UrlManager} URLマネージャーインスタンス
 */
export function createUrlManager(showToastFn, getElementFn, refreshDashboardFn) {
    return new UrlManager(showToastFn, getElementFn, refreshDashboardFn);
}