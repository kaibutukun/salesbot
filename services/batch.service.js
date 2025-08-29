/**
 * バッチ処理サービス
 * URL処理の実行、停止、進捗管理を担当
 * 修正版: 送信開始時の進捗監視リセット・再開機能追加
 */

import { ExDB } from '../shared/database.js';
import {
    ACTION_STOP, ACTION_STOP_COMPLETED, ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL, SENDING_STATES, STORAGE_KEYS,
    isValidSendingState, isValidStateTransition
} from '../shared/constants.js';
import { ProgressMonitor } from '../modules/progress-monitor.js';

/**
 * バッチ処理サービスクラス
 */
export class BatchService {
    constructor(dependencies = {}) {
        // 依存性注入
        this.showToastFunction = dependencies.showToast || null;
        this.urlManager = dependencies.urlManager || null;
        this.dashboard = dependencies.dashboard || null;
        this.authService = dependencies.authService || null;
        this.refreshDashboardFunction = dependencies.refreshDashboard || null;

        // 内部状態
        this.currentState = SENDING_STATES.IDLE;
        this.isProcessing = false;

        // Chrome runtime listener
        this.stopStateListener = null;
        this.listenerAttached = false;

        // ProgressMonitorインスタンス作成
        this.progressMonitor = new ProgressMonitor({
            showToast: this.showToastFunction,
            onProgressCompleted: this.handleProgressCompleted.bind(this),
            onProgressUpdate: this.handleProgressUpdate.bind(this)
        });

        // 初期化
        this.initialize();
    }

    initialize() {
        this.setupStopStateListener();
        this.startProgressMonitoring();
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

    // ====================================
    // タブライフサイクル管理
    // ====================================

    async storeOriginalTabId(tabId) {
        try {
            await chrome.storage.local.set({ 
                'originalTabId': tabId,
                'originalTabTimestamp': Date.now()
            });
            console.log(`Original tab ID stored: ${tabId}`);
        } catch (error) {
            console.error('Failed to store original tab ID:', error);
        }
    }

    async getStoredOriginalTabId() {
        try {
            const data = await chrome.storage.local.get(['originalTabId', 'originalTabTimestamp']);
            
            if (!data.originalTabId) {
                return null;
            }

            // 2時間以上経過している場合は無効
            const twoHours = 2 * 60 * 60 * 1000;
            if (data.originalTabTimestamp && (Date.now() - data.originalTabTimestamp) > twoHours) {
                await this.clearOriginalTabId();
                return null;
            }

            return data.originalTabId;
        } catch (error) {
            console.error('Failed to get stored original tab ID:', error);
            return null;
        }
    }

    async clearOriginalTabId() {
        try {
            await chrome.storage.local.remove(['originalTabId', 'originalTabTimestamp']);
            console.log('Original tab ID cleared');
        } catch (error) {
            console.error('Failed to clear original tab ID:', error);
        }
    }

    async getCurrentAndStoreTabId() {
        try {
            const mainUrl = chrome.runtime.getURL('ui/main.html');
            const tabs = await chrome.tabs.query({ url: mainUrl });
            
            if (tabs.length > 0) {
                const mainTab = tabs[0];
                await this.storeOriginalTabId(mainTab.id);
                console.log(`Main tab ID captured and stored: ${mainTab.id}`);
                return mainTab.id;
            }

            console.warn('No main.html tab found for original tab ID storage');
            return null;

        } catch (error) {
            console.error('Failed to get and store current tab ID:', error);
            return null;
        }
    }

    async storeProcessTabId(tabId) {
        try {
            await chrome.storage.local.set({ 
                'processTabId': tabId,
                'processTabTimestamp': Date.now()
            });
            console.log(`Process tab ID stored: ${tabId}`);
        } catch (error) {
            console.error('Failed to store process tab ID:', error);
        }
    }

    async getStoredProcessTabId() {
        try {
            const data = await chrome.storage.local.get(['processTabId', 'processTabTimestamp']);
            
            if (!data.processTabId) {
                return null;
            }

            // 1時間以上経過している場合は無効
            const oneHour = 60 * 60 * 1000;
            if (data.processTabTimestamp && (Date.now() - data.processTabTimestamp) > oneHour) {
                await this.clearProcessTabId();
                return null;
            }

            return data.processTabId;
        } catch (error) {
            console.error('Failed to get stored process tab ID:', error);
            return null;
        }
    }

    async clearProcessTabId() {
        try {
            await chrome.storage.local.remove(['processTabId', 'processTabTimestamp']);
            console.log('Process tab ID cleared');
        } catch (error) {
            console.error('Failed to clear process tab ID:', error);
        }
    }

    // ====================================
    // 状態管理システム
    // ====================================

    async setSendingState(newState, updateStorage = true) {
        if (!isValidSendingState(newState)) {
            console.error(`Invalid sending state: ${newState}`);
            return false;
        }

        if (!isValidStateTransition(this.currentState, newState)) {
            console.warn(`Invalid state transition: ${this.currentState} -> ${newState}`);
        }

        const previousState = this.currentState;
        this.currentState = newState;

        if (updateStorage) {
            try {
                await chrome.storage.local.set({ 
                    [STORAGE_KEYS.SENDING_STATE]: newState
                });
                
                console.log(`State updated to: ${newState}`);
            } catch (error) {
                console.error('Failed to update sending state in storage:', error);
                this.currentState = previousState;
                return false;
            }
        }

        this.updateUIBasedOnState(newState);
        return true;
    }

    getCurrentState() {
        return this.currentState;
    }

    async loadSendingStateFromStorage() {
        try {
            const data = await chrome.storage.local.get([STORAGE_KEYS.SENDING_STATE]);

            if (data[STORAGE_KEYS.SENDING_STATE] && isValidSendingState(data[STORAGE_KEYS.SENDING_STATE])) {
                return data[STORAGE_KEYS.SENDING_STATE];
            }

            return SENDING_STATES.IDLE;
        } catch (error) {
            console.error('Failed to load sending state from storage:', error);
            return SENDING_STATES.IDLE;
        }
    }

    updateUIBasedOnState(state) {
        if (!this.urlManager) return;

        switch (state) {
            case SENDING_STATES.IDLE:
                this.urlManager.setButtonsToExecuteState(() => this.executeButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('待機中', false);
                }
                break;

            case SENDING_STATES.SENDING:
                this.urlManager.setButtonsToSendingState(() => this.stopButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('送信中...', true);
                }
                break;

            case SENDING_STATES.STOPPING:
                this.urlManager.setButtonsToStoppingState();
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('停止処理中...', false);
                }
                break;

            case SENDING_STATES.COMPLETED:
                this.urlManager.setButtonsToExecuteState(() => this.executeButtonHandler());
                if (this.dashboard) {
                    this.dashboard.updateSendingStatus('完了', false);
                }
                break;
        }
    }

    setupStopStateListener() {
        if (this.stopStateListener && this.listenerAttached) {
            try {
                chrome.runtime.onMessage.removeListener(this.stopStateListener);
                this.listenerAttached = false;
            } catch (error) {
                console.warn('Failed to remove existing listener:', error.message);
            }
        }

        this.stopStateListener = (message, sender, sendResponse) => {
            if (message.action === ACTION_STOP_COMPLETED) {
                this.handleStopCompleted();

                try {
                    sendResponse({ success: true });
                } catch (error) {
                    // エラーを無視
                }
            }
        };

        try {
            chrome.runtime.onMessage.addListener(this.stopStateListener);
            this.listenerAttached = true;
        } catch (error) {
            console.error('Failed to add stop state listener:', error);
        }
    }

    async handleStopCompleted() {
        await this.setSendingState(SENDING_STATES.COMPLETED);

        if (this.dashboard) {
            this.dashboard.resetProgress();
        }

        setTimeout(async () => {
            await this.setSendingState(SENDING_STATES.IDLE);
        }, 1000);
    }

    /**
     * 実行ボタンのイベントハンドラー（進捗監視リアルタイム対応版）
     */
    async executeButtonHandler() {
        // 重複実行防止
        if (this.isProcessing) {
            console.log('Execute button handler already processing, ignoring click');
            return;
        }

        if (this.currentState !== SENDING_STATES.IDLE && this.currentState !== SENDING_STATES.COMPLETED) {
            this.showToast('送信処理が既に実行中です', 'warning');
            return;
        }

        this.isProcessing = true;

        try {
            // ライセンス確認
            let licenseValid = false;
            if (this.authService) {
                licenseValid = await this.authService.isLicenseValid();
            } else {
                const licenseData = await chrome.storage.sync.get('validLicense');
                licenseValid = licenseData.validLicense;
            }

            if (!licenseValid) {
                this.showToast('有効なライセンスが必要です', 'warning');
                return;
            }

            // データベース初期化確認
            const db = new ExDB();
            try {
                await db.openDB();
            } catch (dbError) {
                this.showToast('データベースの初期化に失敗しました', 'error');
                return;
            }

            // URL検証（必要に応じて自動保存）
            let urlsToProcess = [];
            
            if (this.urlManager) {
                urlsToProcess = this.urlManager.getCurrentUrls();
                
                if (urlsToProcess.length > 0) {
                    console.log(`Auto-saving ${urlsToProcess.length} URLs before validation`);
                    await this.urlManager.saveUrlList();
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                const urlValidation = await this.urlManager.validateUrlList();
                if (!urlValidation.isValid) {
                    this.showToast(urlValidation.message, 'warning');
                    return;
                }
            }

            // Todo処理
            let latestTodo = await db.getLatestTodo();

            if (!latestTodo) {
                if (urlsToProcess.length === 0) {
                    this.showToast('URLリストが設定されていません', 'warning');
                    return;
                }
                
                const now = new Date();
                const title = now.toLocaleString('ja-JP');
                const description = urlsToProcess.map(url => ({
                    url: url.trim(),
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                const newTodoResult = await db.addTodo(title, description);
                latestTodo = await db.getTodoById(newTodoResult.id || newTodoResult);
            }

            if (!latestTodo || !latestTodo.description || latestTodo.description.length === 0) {
                this.showToast('有効なタスクが見つかりません', 'error');
                return;
            }

            if (!latestTodo.completed) {
                const processed = latestTodo.description.filter(item => item.result !== '').length;
                if (processed > 0) {
                    this.showToast('送信処理が進行中です', 'warning');
                    return;
                }
            }

            // ユーザー確認
            if (!confirm(`${latestTodo.description.length}件のURLに対して送信を開始しますか？`)) {
                return;
            }

            // 元タブID記録
            const originalTabId = await this.getCurrentAndStoreTabId();
            if (originalTabId) {
                console.log(`Original tab ID recorded: ${originalTabId}`);
            }

            // ====================================
            // 【重要修正】送信開始前の進捗監視リセット・再開
            // ====================================
            
            // 既存の進捗監視を停止
            this.progressMonitor.stopProgressMonitoring();
            
            // 進捗状態をリセット
            this.progressMonitor.resetProgressState();
            
            // ダッシュボードの進捗表示を初期化
            if (this.dashboard) {
                this.dashboard.resetProgress();
                this.dashboard.invalidateCache();
            }
            
            // 新規タスク作成（完了済みの場合）
            if (latestTodo.completed) {
                const now = new Date();
                const title = now.toLocaleString('ja-JP');
                const newDescription = latestTodo.description.map(item => ({
                    url: item.url,
                    result: '',
                    contact: '',
                    reason: ''
                }));
                
                await db.addTodo(title, newDescription);
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 状態を送信中に変更
            await this.setSendingState(SENDING_STATES.SENDING);

            // ダッシュボードを更新
            await this.refreshDashboard();

            // 【重要修正】進捗監視を再開（新しいタスクに対応）
            this.progressMonitor.startProgressMonitoring();

            // 処理用タブを作成
            const tab = await chrome.tabs.create({ url: 'ui/process.html' });
            await this.storeProcessTabId(tab.id);
            
            // タブ作成待機時間短縮
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // バックグラウンドスクリプトに実行メッセージを送信
            chrome.runtime.sendMessage({ 
                action: ACTION_EXECUTE, 
                tabId: tab.id
            });

            this.showToast('送信を開始しました', 'success');
            console.log(`Execution started - Original tab: ${originalTabId}, Process tab: ${tab.id}`);
            
        } catch (error) {
            this.showToast('送信開始に失敗しました: ' + error.message, 'error');
            console.error('Execute button handler error:', error);
            
            // エラー時は状態をリセット
            await this.setSendingState(SENDING_STATES.IDLE);
        } finally {
            this.isProcessing = false;
        }
    }

    async stopButtonHandler() {
        try {
            if (this.currentState !== SENDING_STATES.SENDING) {
                this.showToast('停止できる処理がありません', 'warning');
                return;
            }

            if (!confirm('送信処理を停止しますか？')) {
                return;
            }

            await this.setSendingState(SENDING_STATES.STOPPING);

            chrome.runtime.sendMessage({ action: ACTION_STOP }, (response) => {
                if (chrome.runtime.lastError) {
                    // エラーを無視
                }
            });

            this.showToast('送信処理を停止しています...', 'info');

        } catch (error) {
            this.showToast('送信停止に失敗しました', 'error');
            await this.setSendingState(SENDING_STATES.SENDING);
        }
    }

    async checkAndRestoreSendingState() {
        try {
            const storedState = await this.loadSendingStateFromStorage();
            
            if (storedState === SENDING_STATES.IDLE) {
                await this.setSendingState(SENDING_STATES.IDLE, false);
                return;
            }

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();
            
            if (!latestTodo || !latestTodo.description) {
                await this.setSendingState(SENDING_STATES.IDLE);
                return;
            }

            if (latestTodo.completed) {
                await this.setSendingState(SENDING_STATES.IDLE);
                return;
            }

            const hasProcessed = latestTodo.description.some(item => item.result !== '');
            const allProcessed = latestTodo.description.every(item => item.result !== '');

            if (allProcessed) {
                await this.setSendingState(SENDING_STATES.COMPLETED);
                return;
            }

            switch (storedState) {
                case SENDING_STATES.SENDING:
                    await this.setSendingState(SENDING_STATES.SENDING, false);
                    break;
                case SENDING_STATES.STOPPING:
                    await this.setSendingState(SENDING_STATES.STOPPING, false);
                    break;
                case SENDING_STATES.COMPLETED:
                    if (hasProcessed) {
                        await this.setSendingState(SENDING_STATES.COMPLETED, false);
                    } else {
                        await this.setSendingState(SENDING_STATES.IDLE);
                    }
                    break;
                default:
                    await this.setSendingState(SENDING_STATES.IDLE);
                    break;
            }

        } catch (error) {
            console.error('Failed to restore sending state:', error);
            await this.setSendingState(SENDING_STATES.IDLE);
        }
    }

    // ====================================
    // ProgressMonitorコールバック関数
    // ====================================

    async handleProgressCompleted(progressInfo) {
        try {
            await this.setSendingState(SENDING_STATES.COMPLETED);
            await this.refreshDashboard();

            setTimeout(async () => {
                await this.setSendingState(SENDING_STATES.IDLE);
            }, 2000);
        } catch (error) {
            console.error('Failed to handle progress completion:', error);
        }
    }

    async handleProgressUpdate(progressInfo) {
        try {
            // ダッシュボードの軽量更新（進捗のみ）
            if (this.dashboard) {
                await this.dashboard.refreshProgressOnly();
            }
        } catch (error) {
            // エラーが発生しても監視は継続
        }
    }

    // ====================================
    // 進捗監視制御
    // ====================================

    startProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.startProgressMonitoring();
        }
    }

    async checkProgress() {
        if (this.progressMonitor) {
            await this.progressMonitor.checkProgress();
        }
    }

    stopProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.stopProgressMonitoring();
        }
    }

    getExecutionState() {
        return {
            currentState: this.currentState,
            isProcessing: this.isProcessing,
            isProgressMonitoring: this.progressMonitor ? this.progressMonitor.getMonitoringState().isMonitoring : false
        };
    }

    async isExecuting() {
        return this.currentState === SENDING_STATES.SENDING;
    }

    async getBatchProgress() {
        if (this.progressMonitor) {
            return await this.progressMonitor.getBatchProgress();
        }
        
        return {
            total: 0,
            processed: 0,
            completed: 0,
            failed: 0,
            pending: 0,
            isCompleted: false,
            progress: 0,
            title: '',
            startTime: null
        };
    }

    async stopBatch() {
        try {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: ACTION_STOP }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            return false;
        }
    }

    async resetBatchState() {
        try {
            this.stopProgressMonitoring();
            this.isProcessing = false;
            await this.setSendingState(SENDING_STATES.IDLE);
            this.startProgressMonitoring();

            this.showToast('バッチ処理状態をリセットしました', 'info');
        } catch (error) {
            this.showToast('状態リセットに失敗しました', 'error');
        }
    }

    destroy() {
        this.stopProgressMonitoring();

        if (this.stopStateListener && this.listenerAttached) {
            try {
                chrome.runtime.onMessage.removeListener(this.stopStateListener);
                this.listenerAttached = false;
            } catch (error) {
                console.warn('Failed to remove listener during cleanup:', error.message);
            }
        }

        // 参照をクリア
        this.showToastFunction = null;
        this.urlManager = null;
        this.dashboard = null;
        this.authService = null;
        this.refreshDashboardFunction = null;
        this.stopStateListener = null;
    }

    // ====================================
    // 外部アクセス用メソッド
    // ====================================

    getExecuteButtonHandler() {
        return () => this.executeButtonHandler();
    }

    getStopButtonHandler() {
        return () => this.stopButtonHandler();
    }
}

/**
 * バッチサービスインスタンスを作成
 * @param {Object} dependencies - 依存性オブジェクト
 * @returns {BatchService} バッチサービスインスタンス
 */
export function createBatchService(dependencies = {}) {
    return new BatchService(dependencies);
}