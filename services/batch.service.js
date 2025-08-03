/**
 * バッチ処理サービス
 * URL処理の実行、停止、進捗管理を担当
 */

// 共通モジュールのインポート
import { ExDB } from '../shared/database.js';
import {
    ACTION_STOP, ACTION_STOP_COMPLETED, ACTION_EXECUTE,
    PROGRESS_UPDATE_INTERVAL
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
        this.isStopButtonActive = false;

        // Chrome runtime listener reference
        this.stopStateListener = null;

        // ProgressMonitorインスタンスを作成
        this.progressMonitor = new ProgressMonitor({
            showToast: this.showToastFunction,
            onProgressCompleted: this.handleProgressCompleted.bind(this),
            onProgressUpdate: this.handleProgressUpdate.bind(this)
        });

        // 初期化
        this.initialize();
    }

    /**
     * サービスを初期化
     */
    initialize() {
        this.setupStopStateListener();
        this.startProgressMonitoring();
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
     * ダッシュボードをリフレッシュ
     */
    async refreshDashboard() {
        if (this.refreshDashboardFunction) {
            await this.refreshDashboardFunction();
        }
    }

    /**
     * 停止状態リスナーを設定する
     */
    setupStopStateListener() {
        // 既存のリスナーを削除
        if (this.stopStateListener && chrome.runtime.onMessage.hasListener) {
            chrome.runtime.onMessage.removeListener(this.stopStateListener);
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

        chrome.runtime.onMessage.addListener(this.stopStateListener);
    }

    /**
     * 停止完了時の処理
     */
    handleStopCompleted() {
        // 停止ボタンを実行ボタンに戻す
        if (this.isStopButtonActive && this.urlManager) {
            this.urlManager.setExecuteButtonToExecuteState(() => this.executeButtonHandler());
            this.isStopButtonActive = false;
            if (this.dashboard) {
                this.dashboard.setStopButtonActive(false);
            }
        }

        // 送信状態を更新
        if (this.dashboard) {
            this.dashboard.updateSendingStatus('停止完了', false);
            this.dashboard.resetProgress();
        }

        chrome.storage.local.remove('sendingInProgress');
    }

    /**
     * 実行ボタンのイベントハンドラー
     */
    async executeButtonHandler() {
        try {
            // ライセンス確認
            if (this.authService) {
                const isLicenseValid = await this.authService.isLicenseValid();
                if (!isLicenseValid) {
                    this.showToast('有効なライセンスが必要です', 'warning');
                    return;
                }
            } else {
                // fallback: 直接確認
                const licenseData = await chrome.storage.sync.get('validLicense');
                if (!licenseData.validLicense) {
                    this.showToast('有効なライセンスが必要です', 'warning');
                    return;
                }
            }

            // URLリストの確認
            if (this.urlManager) {
                const urlValidation = await this.urlManager.validateUrlList();
                if (!urlValidation.isValid) {
                    this.showToast(urlValidation.message, 'warning');
                    return;
                }
            }

            const db = new ExDB();
            const latestTodo = await db.getLatestTodo();

            if (!latestTodo.completed) {
                const processed = latestTodo.description.filter(item => item.result !== '').length;
                if (processed > 0) {
                    this.showToast('送信処理が進行中です', 'warning');
                    return;
                }
            }

            if (!confirm(`${latestTodo.description.length}件のURLに対して送信を開始しますか？`)) {
                return;
            }

            // 新しいタスクを作成（完了済みの場合）
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
            }

            await chrome.storage.local.set({ sendingInProgress: true });

            // ボタンを停止ボタンに変更
            if (this.urlManager) {
                this.urlManager.setExecuteButtonToStopState(() => this.stopButtonHandler());
            }
            this.isStopButtonActive = true;
            if (this.dashboard) {
                this.dashboard.setStopButtonActive(true);
            }

            // 送信状態を更新
            if (this.dashboard) {
                this.dashboard.updateSendingStatus('送信中...', true);
            }

            await this.refreshDashboard();

            // 処理用タブを作成（パス修正: process.html → ui/process.html）
            const tab = await chrome.tabs.create({ url: 'ui/process.html' });
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: ACTION_EXECUTE, tabId: tab.id });
            }, 1000);

            this.showToast('送信を開始しました', 'success');
        } catch (error) {
            this.showToast('送信開始に失敗しました', 'error');
            
            // エラー時は状態をリセット
            chrome.storage.local.remove('sendingInProgress');
            
            if (this.urlManager) {
                this.urlManager.setExecuteButtonToExecuteState(() => this.executeButtonHandler());
            }
            this.isStopButtonActive = false;
            if (this.dashboard) {
                this.dashboard.setStopButtonActive(false);
            }
        }
    }

    /**
     * 停止ボタンのイベントハンドラー
     */
    async stopButtonHandler() {
        try {
            if (!confirm('送信処理を停止しますか？')) {
                return;
            }

            chrome.runtime.sendMessage({ action: ACTION_STOP }, (response) => {
                if (chrome.runtime.lastError) {
                    // エラーを無視
                }
            });

            this.showToast('送信処理を停止しています...', 'info');

            // 送信状態を更新
            if (this.dashboard) {
                this.dashboard.updateSendingStatus('停止処理中...', false);
            }

            if (this.urlManager) {
                this.urlManager.setExecuteButtonToDisabledState();
            }

            chrome.storage.local.remove('sendingInProgress');
        } catch (error) {
            this.showToast('送信停止に失敗しました', 'error');
        }
    }

    /**
     * 送信状態を確認して復元する
     */
    async checkAndRestoreSendingState() {
        try {
            const sendingData = await chrome.storage.local.get('sendingInProgress');
            
            if (sendingData.sendingInProgress) {
                const db = new ExDB();
                const latestTodo = await db.getLatestTodo();
                
                if (latestTodo && !latestTodo.completed && latestTodo.description) {
                    const hasProcessed = latestTodo.description.some(item => item.result !== '');
                    const allProcessed = latestTodo.description.every(item => item.result !== '');
                    
                    if (!allProcessed) {
                        // 送信中状態を復元
                        if (this.urlManager) {
                            this.urlManager.setExecuteButtonToStopState(() => this.stopButtonHandler());
                        }
                        this.isStopButtonActive = true;
                        if (this.dashboard) {
                            this.dashboard.setStopButtonActive(true);
                        }

                        // 送信状態を更新
                        if (this.dashboard) {
                            this.dashboard.updateSendingStatus('送信中...', true);
                        }
                    } else {
                        chrome.storage.local.remove('sendingInProgress');
                    }
                } else {
                    chrome.storage.local.remove('sendingInProgress');
                }
            }
        } catch (error) {
            chrome.storage.local.remove('sendingInProgress');
        }
    }

    // ====================================
    // ProgressMonitorコールバック関数
    // ====================================

    /**
     * 進捗完了時のコールバック
     * @param {Object} progressInfo - 進捗情報
     */
    async handleProgressCompleted(progressInfo) {
        try {
            // ダッシュボードの状態更新
            if (this.dashboard) {
                this.dashboard.updateSendingStatus('待機中', false);
            }

            // 実行ボタンを元に戻す
            if (this.isStopButtonActive && this.urlManager) {
                this.urlManager.setExecuteButtonToExecuteState(() => this.executeButtonHandler());
                this.isStopButtonActive = false;
                if (this.dashboard) {
                    this.dashboard.setStopButtonActive(false);
                }
            }

            // ダッシュボードを更新
            await this.refreshDashboard();
        } catch (error) {
            console.error('Failed to handle progress completion:', error);
        }
    }

    /**
     * 進捗更新時のコールバック
     * @param {Object} progressInfo - 進捗情報
     */
    async handleProgressUpdate(progressInfo) {
        try {
            // ダッシュボードの定期更新
            if (this.dashboard) {
                await this.dashboard.refreshDashboard();
            }
        } catch (error) {
            // エラーが発生しても監視は継続
            console.error('Progress update callback failed:', error);
        }
    }

    // ====================================
    // 進捗監視制御（ProgressMonitor委譲）
    // ====================================

    /**
     * 進捗監視を開始する
     */
    startProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.startProgressMonitoring();
        }
    }

    /**
     * 進捗をチェックする（ProgressMonitor委譲）
     */
    async checkProgress() {
        if (this.progressMonitor) {
            await this.progressMonitor.checkProgress();
        }
    }

    /**
     * 進捗監視を停止する（ProgressMonitor委譲）
     */
    stopProgressMonitoring() {
        if (this.progressMonitor) {
            this.progressMonitor.stopProgressMonitoring();
        }
    }

    /**
     * 現在の実行状態を取得する
     * @returns {Object} 実行状態オブジェクト
     */
    getExecutionState() {
        return {
            isStopButtonActive: this.isStopButtonActive,
            isProgressMonitoring: this.progressMonitoringInterval !== null,
            lastProgressState: { ...this.lastProgressState }
        };
    }

    /**
     * バッチ処理が実行中かどうかを確認する
     * @returns {Promise<boolean>} 実行中の場合はtrue
     */
    async isExecuting() {
        try {
            const sendingData = await chrome.storage.local.get('sendingInProgress');
            return sendingData.sendingInProgress || false;
        } catch (error) {
            return false;
        }
    }

    /**
     * 現在のバッチ処理タスクの進捗情報を取得する（ProgressMonitor委譲）
     * @returns {Promise<Object>} 進捗情報オブジェクト
     */
    async getBatchProgress() {
        if (this.progressMonitor) {
            return await this.progressMonitor.getBatchProgress();
        }
        
        // フォールバック（空の進捗情報）
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
     * バッチ処理を手動で停止する（UI操作なし）
     * @returns {Promise<boolean>} 停止成功時はtrue
     */
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
            console.error('Failed to stop batch:', error);
            return false;
        }
    }

    /**
     * バッチ処理の状態をリセットする
     */
    async resetBatchState() {
        try {
            // 進捗監視を停止
            this.stopProgressMonitoring();

            // 状態をリセット
            this.isStopButtonActive = false;
            this.lastProgressState.isCompleted = false;

            // ストレージをクリア
            chrome.storage.local.remove('sendingInProgress');

            // UIを初期状態に戻す
            if (this.urlManager) {
                this.urlManager.setExecuteButtonToExecuteState(() => this.executeButtonHandler());
            }
            if (this.dashboard) {
                this.dashboard.setStopButtonActive(false);
                this.dashboard.updateSendingStatus('待機中', false);
                this.dashboard.resetProgress();
            }

            // 進捗監視を再開
            this.startProgressMonitoring();

            this.showToast('バッチ処理状態をリセットしました', 'info');
        } catch (error) {
            console.error('Failed to reset batch state:', error);
            this.showToast('状態リセットに失敗しました', 'error');
        }
    }

    /**
     * サービスを破棄する（クリーンアップ）
     */
    destroy() {
        // 進捗監視を停止
        this.stopProgressMonitoring();

        // Chrome runtime listenerを削除
        if (this.stopStateListener && chrome.runtime.onMessage.hasListener) {
            chrome.runtime.onMessage.removeListener(this.stopStateListener);
        }

        // 参照をクリア
        this.showToastFunction = null;
        this.urlManager = null;
        this.dashboard = null;
        this.authService = null;
        this.refreshDashboardFunction = null;
        this.stopStateListener = null;
    }

    /**
     * 実行ボタンハンドラーを取得する（外部アクセス用）
     * @returns {Function} 実行ボタンハンドラー関数
     */
    getExecuteButtonHandler() {
        return () => this.executeButtonHandler();
    }

    /**
     * 停止ボタンハンドラーを取得する（外部アクセス用）
     * @returns {Function} 停止ボタンハンドラー関数
     */
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