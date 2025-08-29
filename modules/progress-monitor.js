/**
 * プログレス監視モジュール
 * バッチ処理の進捗監視とUI更新を担当
 * 修正版: Dashboard連携によるリアルタイム進捗表示対応
 */

import { ExDB } from '../shared/database.js';
import { 
    PROGRESS_UPDATE_INTERVAL, 
    SENDING_STATES, 
    STORAGE_KEYS,
    isValidSendingState 
} from '../shared/constants.js';

/**
 * プログレス監視クラス
 */
export class ProgressMonitor {
    constructor(config = {}) {
        // 基本設定
        this.showToastFunction = config.showToast || null;
        this.progressUpdateInterval = config.progressUpdateInterval || PROGRESS_UPDATE_INTERVAL;
        
        // 【重要修正】Dashboard参照を追加
        this.dashboard = config.dashboard || null;
        
        // コールバック関数
        this.onProgressCompleted = config.onProgressCompleted || null;
        this.onProgressUpdate = config.onProgressUpdate || null;
        this.onMonitoringStarted = config.onMonitoringStarted || null;
        this.onMonitoringStopped = config.onMonitoringStopped || null;
        
        // 内部状態
        this.progressMonitoringInterval = null;
        this.lastProgressState = {
            isCompleted: false,
            lastProcessedCount: 0,
            lastTotalCount: 0
        };
        
        // 外部サービス参照
        this.storageService = config.storageService || null;
    }

    showToast(message, type = 'info') {
        if (this.showToastFunction) {
            this.showToastFunction(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }

    // ====================================
    // 進捗監視制御
    // ====================================

    startProgressMonitoring(options = {}) {
        try {
            this.stopProgressMonitoring();
            
            // 初期状態をリセット
            this.lastProgressState.isCompleted = false;
            
            // 初回実行
            this.checkProgress();

            // 定期実行の設定
            this.progressMonitoringInterval = setInterval(() => {
                this.checkProgress();
            }, this.progressUpdateInterval);

            if (this.onMonitoringStarted) {
                this.onMonitoringStarted();
            }

            console.log('Progress monitoring started');
        } catch (error) {
            console.error('Failed to start progress monitoring:', error);
            this.showToast('進捗監視の開始に失敗しました', 'error');
        }
    }

    stopProgressMonitoring() {
        try {
            if (this.progressMonitoringInterval) {
                clearInterval(this.progressMonitoringInterval);
                this.progressMonitoringInterval = null;
                
                if (this.onMonitoringStopped) {
                    this.onMonitoringStopped();
                }
                
                console.log('Progress monitoring stopped');
            }
        } catch (error) {
            console.error('Failed to stop progress monitoring:', error);
        }
    }

    /**
     * 進捗をチェックする（Dashboard連携版）
     */
    async checkProgress() {
        try {
            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo) {
                return;
            }

            // 進捗情報を取得
            const progressInfo = await this.getBatchProgress();
            
            // 完了状態の検知
            if (latestTodo.completed && !this.lastProgressState.isCompleted) {
                this.lastProgressState.isCompleted = true;
                
                try {
                    await chrome.storage.local.set({ 
                        [STORAGE_KEYS.SENDING_STATE]: SENDING_STATES.IDLE 
                    });
                    console.log('Progress monitoring: Set sending state to IDLE');
                } catch (storageError) {
                    console.error('Failed to update sending state:', storageError);
                    try {
                        await chrome.storage.local.remove('sendingInProgress');
                    } catch (fallbackError) {
                        console.error('Fallback storage cleanup failed:', fallbackError);
                    }
                }

                if (this.onProgressCompleted) {
                    await this.onProgressCompleted(progressInfo);
                }
                
                this.stopProgressMonitoring();
                this.showToast('処理が完了しました', 'success');
            }

            // 【重要修正】進捗更新時のDashboard連携
            if (!latestTodo.completed && this.onProgressUpdate) {
                await this.onProgressUpdate(progressInfo);
            }

            // 前回の状態を更新
            this.lastProgressState.lastProcessedCount = progressInfo.processed;
            this.lastProgressState.lastTotalCount = progressInfo.total;

        } catch (error) {
            console.error('Progress check failed:', error);
        }
    }

    // ====================================
    // 進捗情報取得
    // ====================================

    async getBatchProgress() {
        try {
            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo || !latestTodo.description) {
                return this.createEmptyProgressInfo();
            }

            const total = latestTodo.description.length;
            const processed = latestTodo.description.filter(item => item.result !== '').length;
            const completed = latestTodo.description.filter(item => item.result === '成功').length;
            const failed = latestTodo.description.filter(item => item.result !== '' && item.result !== '成功').length;
            const pending = total - processed;

            return {
                total,
                processed,
                completed,
                failed,
                pending,
                isCompleted: latestTodo.completed,
                progress: total > 0 ? Math.round((processed / total) * 100) : 0,
                title: latestTodo.title || '未設定',
                startTime: latestTodo.created_at || null
            };
        } catch (error) {
            console.error('Failed to get batch progress:', error);
            return this.createEmptyProgressInfo();
        }
    }

    createEmptyProgressInfo() {
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

    async isSendingInProgress() {
        try {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.SENDING_STATE,
                'sendingInProgress'
            ]);

            if (data[STORAGE_KEYS.SENDING_STATE] && isValidSendingState(data[STORAGE_KEYS.SENDING_STATE])) {
                const currentState = data[STORAGE_KEYS.SENDING_STATE];
                return currentState === SENDING_STATES.SENDING || currentState === SENDING_STATES.STOPPING;
            }

            return data.sendingInProgress || false;

        } catch (error) {
            console.error('Failed to check sending progress:', error);
            return false;
        }
    }

    // ====================================
    // 状態管理
    // ====================================

    getMonitoringState() {
        return {
            isMonitoring: this.progressMonitoringInterval !== null,
            lastProgressState: { ...this.lastProgressState },
            updateInterval: this.progressUpdateInterval
        };
    }

    resetProgressState() {
        this.lastProgressState = {
            isCompleted: false,
            lastProcessedCount: 0,
            lastTotalCount: 0
        };
    }

    async getCurrentSendingState() {
        try {
            const data = await chrome.storage.local.get([STORAGE_KEYS.SENDING_STATE]);
            const state = data[STORAGE_KEYS.SENDING_STATE];
            
            if (isValidSendingState(state)) {
                return state;
            }
            
            return SENDING_STATES.IDLE;
        } catch (error) {
            console.error('Failed to get current sending state:', error);
            return SENDING_STATES.IDLE;
        }
    }

    async shouldMonitorProgress() {
        try {
            const currentState = await this.getCurrentSendingState();
            return currentState === SENDING_STATES.SENDING;
        } catch (error) {
            console.error('Failed to determine monitoring necessity:', error);
            return false;
        }
    }

    // ====================================
    // 設定更新（Dashboard参照設定機能追加）
    // ====================================

    setCallbacks(callbacks) {
        if (callbacks.onProgressCompleted) {
            this.onProgressCompleted = callbacks.onProgressCompleted;
        }
        if (callbacks.onProgressUpdate) {
            this.onProgressUpdate = callbacks.onProgressUpdate;
        }
        if (callbacks.onMonitoringStarted) {
            this.onMonitoringStarted = callbacks.onMonitoringStarted;
        }
        if (callbacks.onMonitoringStopped) {
            this.onMonitoringStopped = callbacks.onMonitoringStopped;
        }
    }

    setStorageService(storageService) {
        this.storageService = storageService;
    }

    /**
     * 【新規追加】Dashboard参照を設定する
     * @param {Dashboard} dashboard - Dashboardインスタンス
     */
    setDashboard(dashboard) {
        this.dashboard = dashboard;
    }

    // ====================================
    // クリーンアップ
    // ====================================

    destroy() {
        this.stopProgressMonitoring();
        this.showToastFunction = null;
        this.onProgressCompleted = null;
        this.onProgressUpdate = null;
        this.onMonitoringStarted = null;
        this.onMonitoringStopped = null;
        this.storageService = null;
        this.dashboard = null;
    }
}

export function createProgressMonitor(config) {
    return new ProgressMonitor(config);
}