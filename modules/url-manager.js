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
        this.originalExecuteHandler = null;
        this.originalStopHandler = null;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        return {
            urlListTextarea: this.getElement('urlListTextarea'),
            saveUrlListButton: this.getElement('saveUrlList'),
            clearUrlListButton: this.getElement('clearUrlList'),
            executeFromUrlTabButton: this.getElement('executeFromUrlTab')
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

    setExecuteButtonToStopState(stopHandler) {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/stop.png" alt="送信停止" />送信停止';
            this.elements.executeFromUrlTabButton.className = 'stop-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            
            if (this.originalExecuteHandler) {
                this.elements.executeFromUrlTabButton.removeEventListener('click', this.originalExecuteHandler);
            }
            
            this.originalStopHandler = stopHandler;
            this.elements.executeFromUrlTabButton.addEventListener('click', stopHandler);
        }
    }

    setExecuteButtonToExecuteState(executeHandler) {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/play.png" alt="送信開始" />送信開始';
            this.elements.executeFromUrlTabButton.className = 'success-button';
            this.elements.executeFromUrlTabButton.disabled = false;
            
            if (this.originalStopHandler) {
                this.elements.executeFromUrlTabButton.removeEventListener('click', this.originalStopHandler);
            }
            
            this.originalExecuteHandler = executeHandler;
            this.elements.executeFromUrlTabButton.addEventListener('click', executeHandler);
        }
    }

    setExecuteButtonToDisabledState() {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.disabled = true;
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/stop.png" alt="停止中" />停止中...';
            this.elements.executeFromUrlTabButton.className = 'secondary-button';
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