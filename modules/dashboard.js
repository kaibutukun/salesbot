/**
 * ダッシュボード管理モジュール
 * 送信統計、進捗表示、最近の結果などのダッシュボード機能を管理
 * パフォーマンス最適化版: Debounce機能、部分更新、キャッシュ機能追加
 */

// 共通モジュールのインポート
import { ExDB } from '../shared/database.js';

/**
 * ダッシュボードクラス
 */
export class Dashboard {
    constructor(showToastFn = null) {
        this.isStopButtonActive = false;
        this.elements = this.initializeElements();
        this.showToastFunction = showToastFn;
        
        // ====================================
        // パフォーマンス最適化用の状態管理
        // ====================================
        
        // Debounce制御
        this.refreshDebounceTimer = null;
        this.refreshDebounceDelay = 100; // 100msのDebounce
        
        // キャッシュ管理
        this.lastRefreshTimestamp = 0;
        this.cachedTodos = null;
        this.cacheValidityDuration = 2000; // 2秒間キャッシュ有効
        
        // 部分更新制御
        this.lastProgressState = null;
        this.lastStatsState = null;
        
        // 処理状態管理
        this.isRefreshing = false;
        this.pendingRefresh = false;
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            sendingStatus: this.getElement('sendingStatus'),
            lastExecutionTime: this.getElement('lastExecutionTime'),
            totalSentUrls: this.getElement('totalSentUrls'),
            successRate: this.getElement('successRate'),
            progressCount: this.getElement('progressCount'),
            progressBar: this.getElement('progressBar'),
            recentResultsList: this.getElement('recentResultsList'),
            toast: this.getElement('toast')
        };
    }

    /**
     * 要素を取得するヘルパー関数
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    getElement(id) {
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
            // フォールバック実装
            const toast = this.elements.toast;
            const toastContent = document.querySelector('.toast-content');
            
            if (!toast || !toastContent) return;

            toastContent.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');

            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    }

    /**
     * 停止ボタンの状態を設定
     * @param {boolean} isActive - 停止ボタンがアクティブかどうか
     */
    setStopButtonActive(isActive) {
        this.isStopButtonActive = isActive;
    }

    // ====================================
    // パフォーマンス最適化されたリフレッシュ機能
    // ====================================

    /**
     * ダッシュボードの更新（Debounce付き軽量版）
     * main.jsから頻繁に呼び出される場合に使用
     * @param {Object} options - 更新オプション
     * @returns {Promise<void>}
     */
    async refreshDashboard(options = {}) {
        // 既存のタイマーをクリア
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }

        // オプションに基づく即座実行の判断
        if (options.immediate) {
            return await this.refreshDashboardImmediate(options);
        }

        // Debounce処理で連続呼び出しを制御
        return new Promise((resolve) => {
            this.refreshDebounceTimer = setTimeout(async () => {
                try {
                    await this.refreshDashboardImmediate(options);
                    resolve();
                } catch (error) {
                    console.error('Dashboard refresh failed:', error);
                    resolve();
                }
                this.refreshDebounceTimer = null;
            }, this.refreshDebounceDelay);
        });
    }

    /**
     * ダッシュボードの即座更新（内部実装）
     * @param {Object} options - 更新オプション
     * @returns {Promise<void>}
     */
    async refreshDashboardImmediate(options = {}) {
        // 重複実行の防止
        if (this.isRefreshing) {
            this.pendingRefresh = true;
            return;
        }

        this.isRefreshing = true;

        try {
            // ====================================
            // Step 1: 軽量なデータ取得（キャッシュ活用）
            // ====================================
            
            const todos = await this.getCachedTodos();
            if (!todos) {
                console.warn('Dashboard: Failed to get todos, skipping refresh');
                return;
            }

            // ====================================
            // Step 2: 部分更新の判定と実行
            // ====================================
            
            // 統計情報の更新（変更があった場合のみ）
            if (options.updateStats !== false) {
                await this.updateStatistics(todos);
            }

            // 進捗情報の更新（変更があった場合のみ）
            if (options.updateProgress !== false) {
                await this.updateProgress(todos);
            }

            // 最近の結果の更新（必要時のみ）
            if (options.updateResults !== false) {
                await this.updateRecentResults(todos);
            }

        } catch (error) {
            console.error('Dashboard refresh immediate failed:', error);
            this.showToast('ダッシュボードの更新に失敗しました', 'error');
        } finally {
            this.isRefreshing = false;
            
            // 保留中のリフレッシュがあれば実行
            if (this.pendingRefresh) {
                this.pendingRefresh = false;
                setTimeout(() => this.refreshDashboardImmediate(options), 50);
            }
        }
    }

    /**
     * キャッシュされたTodoデータを取得
     * @returns {Promise<Array|null>} Todoデータ配列
     */
    async getCachedTodos() {
        const now = Date.now();
        
        // キャッシュが有効な場合は再利用
        if (this.cachedTodos && (now - this.lastRefreshTimestamp) < this.cacheValidityDuration) {
            return this.cachedTodos;
        }

        try {
            const db = new ExDB();
            
            // データベースアクセスを最適化：必要な情報のみ取得
            const todos = await db.getAllTodos();
            
            // キャッシュを更新
            this.cachedTodos = todos;
            this.lastRefreshTimestamp = now;
            
            return todos;
        } catch (error) {
            console.error('Failed to get todos:', error);
            return this.cachedTodos; // 古いキャッシュをフォールバック
        }
    }

    /**
     * 統計情報を更新（変更検出付き）
     * @param {Array} todos - Todoデータ配列
     * @returns {Promise<void>}
     */
    async updateStatistics(todos) {
        const completedTodos = todos.filter(todo => todo.completed);
        
        // 統計データを計算
        const statsData = this.calculateStatistics(completedTodos);
        
        // 前回と同じ統計の場合はスキップ
        if (this.lastStatsState && this.isStatsEqual(this.lastStatsState, statsData)) {
            return;
        }

        // DOM更新（存在チェック付き）
        this.updateStatisticsDOM(statsData);
        
        // 状態を保存
        this.lastStatsState = statsData;
    }

    /**
     * 統計データを計算
     * @param {Array} completedTodos - 完了済みTodo配列
     * @returns {Object} 統計データ
     */
    calculateStatistics(completedTodos) {
        if (completedTodos.length === 0) {
            return {
                lastExecutionTime: 'なし',
                totalSent: 0,
                successRate: '0%'
            };
        }

        const latestTodo = completedTodos
            .sort((a, b) => new Date(b.created) - new Date(a.created))[0];

        let totalSent = 0;
        let totalSuccess = 0;

        if (latestTodo.description && latestTodo.description.length > 0) {
            latestTodo.description.forEach(item => {
                if (item.result) {
                    totalSent++;
                    if (item.result === '成功') {
                        totalSuccess++;
                    }
                }
            });
        }

        return {
            lastExecutionTime: new Date(latestTodo.created).toLocaleString('ja-JP'),
            totalSent,
            successRate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) + '%' : '0%'
        };
    }

    /**
     * 統計情報のDOM更新
     * @param {Object} statsData - 統計データ
     */
    updateStatisticsDOM(statsData) {
        if (this.elements.lastExecutionTime) {
            this.elements.lastExecutionTime.textContent = statsData.lastExecutionTime;
        }
        
        if (this.elements.totalSentUrls) {
            this.elements.totalSentUrls.textContent = statsData.totalSent;
        }
        
        if (this.elements.successRate) {
            this.elements.successRate.textContent = statsData.successRate;
        }
    }

    /**
     * 統計データの同等性チェック
     * @param {Object} stats1 - 統計データ1
     * @param {Object} stats2 - 統計データ2
     * @returns {boolean} 同等の場合はtrue
     */
    isStatsEqual(stats1, stats2) {
        return stats1.lastExecutionTime === stats2.lastExecutionTime &&
               stats1.totalSent === stats2.totalSent &&
               stats1.successRate === stats2.successRate;
    }

    /**
     * 進捗情報を更新（変更検出付き）
     * @param {Array} todos - Todoデータ配列
     * @returns {Promise<void>}
     */
    async updateProgress(todos) {
        const latestTodo = todos.length > 0 ? todos[todos.length - 1] : null;
        
        // 進捗データを計算
        const progressData = this.calculateProgress(latestTodo);
        
        // 前回と同じ進捗の場合はスキップ（軽微な変更も検出）
        if (this.lastProgressState && this.isProgressEqual(this.lastProgressState, progressData)) {
            return;
        }

        // DOM更新
        this.updateProgressDOM(progressData);
        
        // 状態を保存
        this.lastProgressState = progressData;
    }

    /**
     * 進捗データを計算
     * @param {Object|null} latestTodo - 最新のTodo
     * @returns {Object} 進捗データ
     */
    calculateProgress(latestTodo) {
        if (!latestTodo || latestTodo.completed || !latestTodo.description) {
            return {
                status: '待機中',
                isSending: false,
                total: 0,
                processed: 0,
                percentage: 0,
                currentUrl: null,
                hasProgress: false
            };
        }

        const total = latestTodo.description.length;
        const processed = latestTodo.description.filter(item => item.result !== '').length;
        const hasProcessed = processed > 0;

        if (hasProcessed) {
            const percentage = total > 0 ? Math.floor((processed / total) * 100) : 0;
            
            // 現在処理中のURL
            let currentUrl = null;
            const nextIndex = processed;
            if (nextIndex < total) {
                const inProgressItem = latestTodo.description[nextIndex];
                if (inProgressItem) {
                    currentUrl = inProgressItem.url;
                }
            }

            return {
                status: processed < total ? '送信中...' : '完了処理中...',
                isSending: true,
                total,
                processed,
                percentage,
                currentUrl,
                hasProgress: true
            };
        } else {
            return {
                status: this.isStopButtonActive ? '送信中...' : '待機中',
                isSending: this.isStopButtonActive,
                total,
                processed: 0,
                percentage: 0,
                currentUrl: null,
                hasProgress: false
            };
        }
    }

    /**
     * 進捗情報のDOM更新
     * @param {Object} progressData - 進捗データ
     */
    updateProgressDOM(progressData) {
        // 送信状態の更新
        if (this.elements.sendingStatus) {
            if (progressData.isSending) {
                this.elements.sendingStatus.innerHTML = `<span class="status-indicator"></span>${progressData.status}`;
                this.elements.sendingStatus.classList.add('status-sending');
            } else {
                this.elements.sendingStatus.textContent = progressData.status;
                this.elements.sendingStatus.classList.remove('status-sending');
            }
        }

        // 進捗バーの更新
        if (this.elements.progressBar) {
            this.elements.progressBar.max = progressData.total;
            this.elements.progressBar.value = progressData.processed;
        }

        // 進捗カウントの更新
        if (this.elements.progressCount) {
            this.elements.progressCount.textContent = `${progressData.processed}/${progressData.total}`;
        }

        // 進捗パーセンテージの更新
        const dashboardProgressPercentage = this.getElement('dashboardProgressPercentage');
        if (dashboardProgressPercentage) {
            dashboardProgressPercentage.textContent = `${progressData.percentage}%`;
        }

        // 現在処理中URLの更新
        const currentProcessingUrl = this.getElement('currentProcessingUrl');
        if (currentProcessingUrl) {
            if (progressData.currentUrl) {
                currentProcessingUrl.textContent = progressData.currentUrl;
                currentProcessingUrl.style.display = 'block';
            } else {
                currentProcessingUrl.style.display = 'none';
            }
        }
    }

    /**
     * 進捗データの同等性チェック
     * @param {Object} progress1 - 進捗データ1
     * @param {Object} progress2 - 進捗データ2
     * @returns {boolean} 同等の場合はtrue
     */
    isProgressEqual(progress1, progress2) {
        return progress1.status === progress2.status &&
               progress1.isSending === progress2.isSending &&
               progress1.total === progress2.total &&
               progress1.processed === progress2.processed &&
               progress1.currentUrl === progress2.currentUrl;
    }

    /**
     * 最近の結果を更新（軽量版）
     * @param {Array} todos - Todoデータ配列
     * @returns {Promise<void>}
     */
    async updateRecentResults(todos) {
        if (!this.elements.recentResultsList) {
            return;
        }

        const completedTodos = todos.filter(todo => todo.completed).reverse();
        const recentResults = completedTodos.slice(0, 3);

        if (recentResults.length === 0) {
            this.elements.recentResultsList.innerHTML = '<div class="no-results">送信結果はありません</div>';
            return;
        }

        // DocumentFragmentを使用してDOM操作を最適化
        const fragment = document.createDocumentFragment();

        recentResults.forEach(todo => {
            const resultItem = document.createElement('div');
            resultItem.className = 'recent-result-item';

            const total = todo.description ? todo.description.length : 0;
            const success = todo.description ? 
                todo.description.filter(item => item.result === '成功').length : 0;
            const fail = total - success;

            resultItem.innerHTML = `
                <div class="recent-result-title">${todo.title}</div>
                <div class="recent-result-stats">
                    <span class="recent-result-total">合計: ${total}</span>
                    <span class="recent-result-success">成功: ${success}</span>
                    <span class="recent-result-fail">失敗: ${fail}</span>
                </div>
            `;

            resultItem.addEventListener('click', () => {
                window.location.href = `?tab=results&id=${todo.id}`;
            });

            fragment.appendChild(resultItem);
        });

        // 一括でDOM更新
        this.elements.recentResultsList.innerHTML = '';
        this.elements.recentResultsList.appendChild(fragment);
    }

    // ====================================
    // 外部インターフェース（軽量版メソッド）
    // ====================================

    /**
     * 送信状態の表示を更新（軽量版）
     * @param {string} status - 状態文字列
     * @param {boolean} isSending - 送信中かどうか
     */
    updateSendingStatus(status, isSending = false) {
        if (this.elements.sendingStatus) {
            if (isSending) {
                this.elements.sendingStatus.innerHTML = `<span class="status-indicator"></span>${status}`;
                this.elements.sendingStatus.classList.add('status-sending');
            } else {
                this.elements.sendingStatus.textContent = status;
                this.elements.sendingStatus.classList.remove('status-sending');
            }
        }
    }

    /**
     * 進捗バーを初期化（軽量版）
     */
    resetProgress() {
        if (this.elements.progressBar) {
            this.elements.progressBar.value = 0;
        }
        if (this.elements.progressCount) {
            this.elements.progressCount.textContent = '0/0';
        }

        const dashboardProgressPercentage = this.getElement('dashboardProgressPercentage');
        if (dashboardProgressPercentage) {
            dashboardProgressPercentage.textContent = '0%';
        }

        const currentProcessingUrl = this.getElement('currentProcessingUrl');
        if (currentProcessingUrl) {
            currentProcessingUrl.style.display = 'none';
        }

        // 進捗状態をリセット
        this.lastProgressState = null;
    }

    /**
     * 完全リフレッシュ（キャッシュクリア付き）
     * 設定変更時などに使用
     * @returns {Promise<void>}
     */
    async forceRefresh() {
        // キャッシュをクリア
        this.cachedTodos = null;
        this.lastRefreshTimestamp = 0;
        this.lastProgressState = null;
        this.lastStatsState = null;

        // 即座にリフレッシュ実行
        return await this.refreshDashboard({ immediate: true });
    }

    /**
     * 進捗のみの軽量更新
     * 送信中の頻繁な更新に使用
     * @returns {Promise<void>}
     */
    async refreshProgressOnly() {
        return await this.refreshDashboard({ 
            immediate: true,
            updateStats: false,
            updateResults: false 
        });
    }

    /**
     * キャッシュを無効化
     */
    invalidateCache() {
        this.cachedTodos = null;
        this.lastRefreshTimestamp = 0;
    }

    /**
     * ダッシュボードの破棄（クリーンアップ）
     */
    destroy() {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
            this.refreshDebounceTimer = null;
        }
        
        this.cachedTodos = null;
        this.elements = null;
        this.showToastFunction = null;
    }
}

/**
 * ダッシュボードインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @returns {Dashboard} Dashboardインスタンス
 */
export function createDashboard(showToastFn) {
    return new Dashboard(showToastFn);
}