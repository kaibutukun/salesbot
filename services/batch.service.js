/**
 * バッチ処理サービス
 * 送信処理の実行、停止、進捗管理を担当
 */

import { ExDB } from '../shared/database.js';
import { ACTION_EXECUTE, ACTION_STOP } from '../shared/constants.js';
import { ProgressMonitor } from '../modules/progress-monitor.js';

export class BatchService {
    constructor(dependencies = {}) {
        this.showToast = dependencies.showToast || (() => {});
        this.urlManager = dependencies.urlManager || null;
        this.dashboard = dependencies.dashboard || null;
        this.authService = dependencies.authService || null;
        this.refreshDashboard = dependencies.refreshDashboard || (() => {});
        
        this.isExecuting = false;
        this.progressMonitor = null;
        
        this.initialize();
    }

    initialize() {
        this.progressMonitor = new ProgressMonitor({
            onProgressUpdate: (progressInfo) => this.handleProgressUpdate(progressInfo),
            onProgressCompleted: (progressInfo) => this.handleProgressCompleted(progressInfo)
        });
    }

    showToast(message, type = 'info') {
        if (this.showToast) {
            this.showToast(message, type);
        }
    }

    async refreshDashboard() {
        if (this.refreshDashboard) {
            await this.refreshDashboard();
        }
    }

    /**
     * 送信開始処理
     */
    async startSending() {
        try {
            // ライセンス確認
            if (!await this.checkLicense()) {
                return;
            }

            // URLリスト確認
            if (!await this.validateUrlList()) {
                return;
            }

            // 確認ダイアログ
            if (!confirm('送信を開始しますか？')) {
                return;
            }

            // 送信状態を設定
            await this.setSendingState(true);
            
            // 処理用タブを作成
            const tab = await chrome.tabs.create({ url: 'ui/process.html' });
            
            // バックグラウンドスクリプトに実行メッセージを送信
            chrome.runtime.sendMessage({ 
                action: ACTION_EXECUTE, 
                tabId: tab.id
            });

            this.showToast('送信を開始しました', 'success');
            
        } catch (error) {
            console.error('送信開始エラー:', error);
            this.showToast('送信開始に失敗しました: ' + error.message, 'error');
            await this.setSendingState(false);
        }
    }

    /**
     * 送信停止処理
     */
    async stopSending() {
        try {
            if (!confirm('送信処理を停止しますか？')) {
                return;
            }

            // バックグラウンドスクリプトに停止メッセージを送信
            chrome.runtime.sendMessage({ action: ACTION_STOP });

            this.showToast('送信処理を停止しています...', 'info');
            
            // 送信状態をリセット
            await this.setSendingState(false);
            
        } catch (error) {
            console.error('送信停止エラー:', error);
            this.showToast('送信停止に失敗しました', 'error');
        }
    }

    /**
     * ライセンス確認
     */
    async checkLicense() {
        if (this.authService) {
            const isValid = await this.authService.isLicenseValid();
            if (!isValid) {
                this.showToast('有効なライセンスが必要です', 'warning');
                return false;
            }
        } else {
            const licenseData = await chrome.storage.sync.get('validLicense');
            if (!licenseData.validLicense) {
                this.showToast('有効なライセンスが必要です', 'warning');
                return false;
            }
        }
        return true;
    }

    /**
     * URLリスト検証
     */
    async validateUrlList() {
        if (!this.urlManager) {
            this.showToast('URLマネージャーが初期化されていません', 'error');
            return false;
        }

        const urls = this.urlManager.getCurrentUrls();
        if (urls.length === 0) {
            this.showToast('送信先URLが入力されていません', 'warning');
            return false;
        }

        // 自動保存
        const saveResult = await this.urlManager.autoSaveUrlList();
        if (!saveResult.isValid) {
            this.showToast(saveResult.message, 'warning');
            return false;
        }

        return true;
    }

    /**
     * 送信状態の設定
     */
    async setSendingState(isSending) {
        this.isExecuting = isSending;
        
        if (isSending) {
            // 送信中状態
            await chrome.storage.local.set({ sendingInProgress: true });
            
            if (this.urlManager) {
                this.urlManager.setExecutingState(
                    () => this.startSending(),
                    () => this.stopSending()
                );
            }
            
            if (this.dashboard) {
                this.dashboard.updateSendingStatus('送信中...', true);
            }
        } else {
            // 待機状態
            await chrome.storage.local.remove('sendingInProgress');
            
            if (this.urlManager) {
                this.urlManager.setWaitingState();
            }
            
            if (this.dashboard) {
                this.dashboard.updateSendingStatus('待機中', false);
            }
        }
    }

    /**
     * 送信状態の復元
     */
    async restoreSendingState() {
        try {
            const sendingData = await chrome.storage.local.get('sendingInProgress');
            
            if (sendingData.sendingInProgress) {
                const db = new ExDB();
                const latestTodo = await db.getLatestTodo();
                
                if (latestTodo && !latestTodo.completed && latestTodo.description) {
                    const hasProcessed = latestTodo.description.some(item => item.result !== '');
                    const allProcessed = latestTodo.description.every(item => item.result !== '');
                    
                    if (!allProcessed && hasProcessed) {
                        // 送信中状態を復元
                        await this.setSendingState(true);
                    } else {
                        // 完了済みまたは未処理の場合は状態をリセット
                        await chrome.storage.local.remove('sendingInProgress');
                    }
                } else {
                    await chrome.storage.local.remove('sendingInProgress');
                }
            }
        } catch (error) {
            console.error('送信状態復元エラー:', error);
            await chrome.storage.local.remove('sendingInProgress');
        }
    }

    /**
     * 進捗更新時の処理
     */
    async handleProgressUpdate(progressInfo) {
        if (this.dashboard) {
            this.dashboard.updateProgress(progressInfo);
        }
    }

    /**
     * 進捗完了時の処理
     */
    async handleProgressCompleted(progressInfo) {
        await this.setSendingState(false);
        
        if (this.dashboard) {
            this.dashboard.updateProgress(progressInfo);
        }
        
        await this.refreshDashboard();
        this.showToast('送信処理が完了しました', 'success');
    }

    /**
     * 実行状態の取得
     */
    getExecutionState() {
        return {
            isExecuting: this.isExecuting,
            hasUrlManager: !!this.urlManager,
            hasDashboard: !!this.dashboard
        };
    }

    /**
     * リソースのクリーンアップ
     */
    destroy() {
        if (this.progressMonitor) {
            this.progressMonitor.destroy();
        }
    }
}

export function createBatchService(dependencies = {}) {
    return new BatchService(dependencies);
}