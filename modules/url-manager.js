/**
 * URL管理モジュール
 * URLリストの読み込み、保存、クリア機能と実行ボタンの状態管理を担当
 */

import { ExDB } from '../shared/database.js';

export class UrlManager {
    constructor(showToastFn = null, getElementFn = null, refreshDashboardFn = null) {
        this.showToastFn = showToastFn || (() => {});
        this.getElementFn = getElementFn || ((id) => document.getElementById(id));
        this.refreshDashboardFn = refreshDashboardFn || (() => {});
        
        this.elements = {};
        this.isExecuting = false;
        this.executeHandler = null;
        this.stopHandler = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.elements.urlListTextarea = this.getElement('urlListTextarea');
        this.elements.clearUrlListButton = this.getElement('clearUrlList');
        this.elements.executeFromUrlTabButton = this.getElement('executeFromUrlTab');
    }

    getElement(id) {
        if (this.getElementFn) {
            return this.getElementFn(id);
        }
        return document.getElementById(id);
    }

    showToast(message, type = 'info') {
        if (this.showToastFn) {
            this.showToastFn(message, type);
        }
    }

    async refreshDashboard() {
        if (this.refreshDashboardFn) {
            await this.refreshDashboardFn();
        }
    }

    async deleteLatestIncompleteTodo() {
        const db = new ExDB();
        const latestTodo = await db.getLatestTodo();
        
        if (latestTodo && !latestTodo.completed) {
            await db.deleteTodo(latestTodo.id);
        }
    }

    setupEventListeners() {
        if (this.elements.clearUrlListButton) {
            this.elements.clearUrlListButton.addEventListener('click', () => this.clearUrlList());
        }
        
        // 実行ボタンのクリックイベント
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.addEventListener('click', () => this.handleExecuteButtonClick());
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

    // シンプルなボタンクリックハンドラー
    handleExecuteButtonClick() {
        if (this.isExecuting) {
            // 実行中の場合：停止処理
            if (this.stopHandler) {
                this.stopHandler();
            }
        } else {
            // 待機中の場合：実行処理
            if (this.executeHandler) {
                this.executeHandler();
            } else {
                this.showToast('実行ハンドラーが設定されていません', 'error');
            }
        }
    }

    // 実行状態に設定
    setExecutingState(executeHandler, stopHandler) {
        this.executeHandler = executeHandler;
        this.stopHandler = stopHandler;
        this.isExecuting = true;
        
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/stop.png" alt="送信停止" />送信停止';
            this.elements.executeFromUrlTabButton.className = 'stop-button';
            this.elements.executeFromUrlTabButton.disabled = false;
        }
    }

    // 待機状態に設定
    setWaitingState() {
        this.isExecuting = false;
        
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/play.png" alt="送信開始" />送信開始';
            this.elements.executeFromUrlTabButton.className = 'success-button';
            this.elements.executeFromUrlTabButton.disabled = false;
        }
    }

    // 無効状態に設定
    setDisabledState() {
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.disabled = true;
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/stop.png" alt="停止中" />停止中...';
            this.elements.executeFromUrlTabButton.className = 'secondary-button';
        }
    }

    // executeHandlerを設定
    setExecuteHandler(handler) {
        this.executeHandler = handler;
    }

    // 停止処理用の状態設定
    setStopState() {
        this.isExecuting = false;
        if (this.elements.executeFromUrlTabButton) {
            this.elements.executeFromUrlTabButton.innerHTML = '<img class="icon" src="../assets/icons/play.png" alt="送信開始" />送信開始';
            this.elements.executeFromUrlTabButton.className = 'success-button';
            this.elements.executeFromUrlTabButton.disabled = false;
        }
    }

    // 送信開始時に自動保存する処理
    async autoSaveUrlList() {
        try {
            const urls = this.getCurrentUrls();
            
            if (urls.length === 0) {
                return { isValid: false, message: 'URLが入力されていません' };
            }

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();
            
            if (latestTodo && !latestTodo.completed) {
                // 既存のタスクを更新
                const updatedDescription = urls.map(url => ({
                    url: url.trim(),
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                await db.updateTodo(latestTodo.id, { description: updatedDescription });
            } else {
                // 新しいタスクを作成
                const now = new Date();
                const title = now.toLocaleString('ja-JP');
                const description = urls.map(url => ({
                    url: url.trim(),
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                await db.addTodo(title, description);
            }

            return { isValid: true, message: 'URLリストを保存しました' };
        } catch (error) {
            console.error('URLリストの自動保存に失敗:', error);
            return { isValid: false, message: 'URLリストの保存に失敗しました' };
        }
    }

    // URLリストの検証
    async validateUrlList() {
        const urls = this.getCurrentUrls();
        
        if (urls.length === 0) {
            return { isValid: false, message: 'URLが入力されていません' };
        }

        // 基本的なURL形式チェック
        const invalidUrls = urls.filter(url => {
            try {
                new URL(url);
                return false;
            } catch {
                return true;
            }
        });

        if (invalidUrls.length > 0) {
            return { 
                isValid: false, 
                message: `無効なURLが含まれています: ${invalidUrls.slice(0, 3).join(', ')}` 
            };
        }

        return { isValid: true, message: `${urls.length}件のURLが有効です` };
    }
}

export function createUrlManager(showToastFn, getElementFn, refreshDashboardFn) {
    return new UrlManager(showToastFn, getElementFn, refreshDashboardFn);
}