/**
 * プログレス監視モジュール
 * バッチ処理の進捗監視とUI更新を担当
 */

import { ExDB } from '../shared/database.js';
import { PROGRESS_UPDATE_INTERVAL } from '../shared/constants.js';

/**
 * プログレス監視クラス
 */
export class ProgressMonitor {
    constructor(config = {}) {
        // 基本設定
        this.showToastFunction = config.showToast || null;
        this.progressUpdateInterval = config.progressUpdateInterval || PROGRESS_UPDATE_INTERVAL;
        
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
        
        // 外部サービス参照（後から設定可能）
        this.storageService = config.storageService || null;
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

    // ====================================
    // 進捗監視制御
    // ====================================

    /**
     * 進捗監視を開始する
     * @param {Object} options - 監視オプション
     */
    startProgressMonitoring(options = {}) {
        try {
            // 既存の監視があれば停止
            this.stopProgressMonitoring();
            
            // 初期状態をリセット
            this.lastProgressState.isCompleted = false;
            
            // 初回実行
            this.checkProgress();

            // 定期実行の設定
            this.progressMonitoringInterval = setInterval(() => {
                this.checkProgress();
            }, this.progressUpdateInterval);

            // 開始コールバック
            if (this.onMonitoringStarted) {
                this.onMonitoringStarted();
            }

            console.log('Progress monitoring started');
        } catch (error) {
            console.error('Failed to start progress monitoring:', error);
            this.showToast('進捗監視の開始に失敗しました', 'error');
        }
    }

    /**
     * 進捗監視を停止する
     */
    stopProgressMonitoring() {
        try {
            if (this.progressMonitoringInterval) {
                clearInterval(this.progressMonitoringInterval);
                this.progressMonitoringInterval = null;
                
                // 停止コールバック
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
     * 進捗をチェックする
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
                
                // ストレージから送信中フラグを削除
                if (this.storageService) {
                    await this.storageService.setSendingProgress(false);
                } else {
                    chrome.storage.local.remove('sendingInProgress');
                }

                // 完了コールバック
                if (this.onProgressCompleted) {
                    await this.onProgressCompleted(progressInfo);
                }
                
                // 監視を停止
                this.stopProgressMonitoring();
                
                this.showToast('処理が完了しました', 'success');
            }

            // 進捗更新コールバック（完了していない場合）
            if (!latestTodo.completed && this.onProgressUpdate) {
                await this.onProgressUpdate(progressInfo);
            }

            // 前回の状態を更新
            this.lastProgressState.lastProcessedCount = progressInfo.processed;
            this.lastProgressState.lastTotalCount = progressInfo.total;

        } catch (error) {
            console.error('Progress check failed:', error);
            // エラーが発生しても監視は継続（BatchServiceの元の動作に合わせる）
        }
    }

    // ====================================
    // 進捗情報取得
    // ====================================

    /**
     * 現在のバッチ処理タスクの進捗情報を取得する
     * @returns {Promise<Object>} 進捗情報オブジェクト
     */
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

    /**
     * 空の進捗情報を作成する
     * @returns {Object} 空の進捗情報オブジェクト
     */
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

    /**
     * 送信進行状態を確認する
     * @returns {Promise<boolean>} 送信進行中の場合はtrue
     */
    async isSendingInProgress() {
        try {
            if (this.storageService) {
                return await this.storageService.getSendingProgress();
            } else {
                const sendingData = await chrome.storage.local.get('sendingInProgress');
                return sendingData.sendingInProgress || false;
            }
        } catch (error) {
            console.error('Failed to check sending progress:', error);
            return false;
        }
    }

    // ====================================
    // 状態管理
    // ====================================

    /**
     * 監視状態を取得する
     * @returns {Object} 現在の監視状態
     */
    getMonitoringState() {
        return {
            isMonitoring: this.progressMonitoringInterval !== null,
            lastProgressState: { ...this.lastProgressState },
            updateInterval: this.progressUpdateInterval
        };
    }

    /**
     * 進捗状態をリセットする
     */
    resetProgressState() {
        this.lastProgressState = {
            isCompleted: false,
            lastProcessedCount: 0,
            lastTotalCount: 0
        };
    }

    // ====================================
    // 設定更新
    // ====================================

    /**
     * コールバック関数を設定する
     * @param {Object} callbacks - コールバック関数のマッピング
     */
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

    /**
     * ストレージサービスを設定する
     * @param {StorageService} storageService - ストレージサービスインスタンス
     */
    setStorageService(storageService) {
        this.storageService = storageService;
    }

    // ====================================
    // クリーンアップ
    // ====================================

    /**
     * ProgressMonitorを破棄する（クリーンアップ）
     */
    destroy() {
        this.stopProgressMonitoring();
        this.showToastFunction = null;
        this.onProgressCompleted = null;
        this.onProgressUpdate = null;
        this.onMonitoringStarted = null;
        this.onMonitoringStopped = null;
        this.storageService = null;
    }
}

/**
 * ProgressMonitorインスタンスを作成
 * @param {Object} config - 設定オブジェクト
 * @returns {ProgressMonitor} ProgressMonitorインスタンス
 */
export function createProgressMonitor(config) {
    return new ProgressMonitor(config);
}