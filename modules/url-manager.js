/**
 * URL管理モジュール
 * URLリストの読み込み、保存、クリア機能と実行ボタンの状態管理を担当
 */

import { ExDB } from '../shared/database.js';

export class UrlManager {
    constructor(showToastFn = null, getElementFn = null, refreshDashboardFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.refreshDashboardFunction = refreshDashboardFn;
        this.executeHandler = null;
        this.stopHandler = null;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        return {
            urlListTextarea: this.getElement('urlListTextarea'),
            saveUrlListButton: this.getElement('saveUrlList'),
            clearUrlListButton: this.getElement('clearUrlList'),
            executeFromUrlTabButton: this.getElement('executeFromUrlTab'),
            stopFromUrlTabButton: this.getElement('stopFromUrlTab')
        };
    }

    getElement(id) {
        if (this.getElementFunction) {
            return this.getElementFunction(id);
        }
        return document.getElementById(id);
    }

    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        }
    }

    async refreshDashboard() {
        if (this.refreshDashboardFunction) {
            await this.refreshDashboardFunction();
        }
    }

    async deleteLatestIncompleteTodo() {
        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();
        
        if (latestTodo && !latestTodo.completed) {
            await db.deleteTodo(latestTodo.id);
            return true;
        }
        return false;
    }

    setupEventListeners() {
        if (this.elements.saveUrlListButton) {
            this.elements.saveUrlListButton.addEventListener('click', () => this.saveUrlList());
        }
        if (this.elements.clearUrlListButton) {
            this.elements.clearUrlListButton.addEventListener('click', () => this.clearUrlList());
        }
    }

    async loadUrlList() {
        if (!this.elements.urlListTextarea) return;

        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();

        if (latestTodo && !latestTodo.completed && latestTodo.description) {
            const urls = latestTodo.description.map(item => item.url).join('\n');
            this.elements.urlListTextarea.value = urls;
        } else {
            this.elements.urlListTextarea.value = '';
        }
    }

    async saveUrlList() {
        if (!this.elements.urlListTextarea) return;

        const urls = this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
        
        if (urls.length === 0) {
            this.showToast('URLを入力してください', 'warning');
            return;
        }

        await this.deleteLatestIncompleteTodo();

        const db = new ExDB();
        const date = new Date();
        const title = date.toLocaleString('ja-JP');
        const description = urls.map(url => ({
            url: url.trim(),
            result: '',
            contact: '',
            reason: ''
        }));

        await db.addTodo(title, description);
        this.showToast(`URLリストを保存しました (${urls.length}件)`, 'success');
        await this.refreshDashboard();
    }

    async clearUrlList() {
        if (!this.elements.urlListTextarea) return;

        if (!confirm('URLリストをクリアしますか？')) {
            return;
        }

        await this.deleteLatestIncompleteTodo();
        this.elements.urlListTextarea.value = '';
        await this.refreshDashboard();
        this.showToast('URLリストをクリアしました', 'info');
    }

    getCurrentUrls() {
        if (!this.elements.urlListTextarea) return [];
        return this.elements.urlListTextarea.value.trim().split('\n').filter(url => url.trim() !== '');
    }

    isUrlListEmpty() {
        return this.getCurrentUrls().length === 0;
    }

    // ====================================
    // ボタン状態管理（色固定版）
    // ====================================

    /**
     * イベントハンドラーを安全に削除
     */
    removeEventHandlers() {
        if (this.executeHandler && this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.removeEventListener('click', this.executeHandler);
        }
        if (this.stopHandler && this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.removeEventListener('click', this.stopHandler);
        }
    }

    /**
     * 送信開始状態：開始ボタン有効、停止ボタン無効
     * @param {Function} executeHandler - 送信開始ハンドラー
     */
    setButtonsToExecuteState(executeHandler) {
        this.removeEventHandlers();

        // 送信開始ボタン：有効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            
            this.executeHandler = executeHandler;
            this.elements.executeFromUrlTabButton.addEventListener('click', executeHandler);
        }

        // 送信停止ボタン：無効（常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    /**
     * 送信中状態：開始ボタン無効、停止ボタン有効
     * @param {Function} stopHandler - 送信停止ハンドラー
     */
    setButtonsToSendingState(stopHandler) {
        this.removeEventHandlers();

        // 送信開始ボタン：無効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        // 送信停止ボタン：有効（常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '送信停止';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = false;
            
            this.stopHandler = stopHandler;
            this.elements.stopFromUrlTabButton.addEventListener('click', stopHandler);
        }
    }

    /**
     * 停止処理中状態：両方のボタンを無効
     */
    setButtonsToStoppingState() {
        this.removeEventHandlers();

        // 送信開始ボタン：無効（常に青色）
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.textContent = '送信開始';
            this.elements.executeFromUrlTabButton.className = 'primary-button';
            this.elements.executeFromUrlTabButton.disabled = true;
        }

        // 送信停止ボタン：無効（停止中表示、常に赤色）
        if (this.elements.stopFromUrlTabButton) {
            this.elements.stopFromUrlTabButton.textContent = '停止中...';
            this.elements.stopFromUrlTabButton.className = 'danger-button';
            this.elements.stopFromUrlTabButton.disabled = true;
        }
    }

    async validateUrlList() {
        if (this.elements.urlListTextarea) {
            const urls = this.getCurrentUrls();
            if (urls.length === 0) {
                return {
                    isValid: false,
                    message: '送信先URLが入力されていません'
                };
            }
        }

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
    }
}

export function createUrlManager(showToastFn, getElementFn, refreshDashboardFn) {
    return new UrlManager(showToastFn, getElementFn, refreshDashboardFn);
}