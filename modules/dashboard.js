/**
 * ダッシュボード管理モジュール
 * 送信統計、進捗表示、最近の結果などのダッシュボード機能を管理
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

    /**
     * ダッシュボードの統計情報を更新
     */
    async refreshDashboard() {
        try {
            const db = new ExDB();
            const todos = await db.getAllTodos();
            const completedTodos = todos.filter(todo => todo.completed).reverse();

            // 統計情報の更新
            if (completedTodos.length > 0) {
                const latestTodo = completedTodos.sort((a, b) => new Date(b.created) - new Date(a.created))[0];

                if (this.elements.lastExecutionTime) {
                    this.elements.lastExecutionTime.textContent = new Date(latestTodo.created).toLocaleString('ja-JP');
                }

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

                if (this.elements.totalSentUrls) {
                    this.elements.totalSentUrls.textContent = totalSent;
                }

                if (this.elements.successRate) {
                    if (totalSent > 0) {
                        this.elements.successRate.textContent = Math.round((totalSuccess / totalSent) * 100) + '%';
                    } else {
                        this.elements.successRate.textContent = '0%';
                    }
                }
            } else {
                if (this.elements.lastExecutionTime) this.elements.lastExecutionTime.textContent = 'なし';
                if (this.elements.totalSentUrls) this.elements.totalSentUrls.textContent = '0';
                if (this.elements.successRate) this.elements.successRate.textContent = '0%';
            }

            // 進捗情報の更新
            const latestTodo = await db.getLatestTodo();
            if (latestTodo && !latestTodo.completed && latestTodo.description) {
                const hasProcessed = latestTodo.description.some(item => item.result !== '');

                if (hasProcessed) {
                    const total = latestTodo.description.length;
                    const processed = latestTodo.description.filter(item => item.result !== '').length;

                    if (this.elements.progressBar) {
                        this.elements.progressBar.max = total;
                        this.elements.progressBar.value = processed;
                    }

                    if (this.elements.progressCount) {
                        this.elements.progressCount.textContent = `${processed}/${total}`;
                    }

                    const percentage = total > 0 ? Math.floor((processed / total) * 100) : 0;
                    const dashboardProgressPercentage = this.getElement('dashboardProgressPercentage');
                    if (dashboardProgressPercentage) {
                        dashboardProgressPercentage.textContent = `${percentage}%`;
                    }

                    if (this.elements.sendingStatus) {
                        if (processed < total) {
                            this.elements.sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                            this.elements.sendingStatus.classList.add('status-sending');
                        } else {
                            this.elements.sendingStatus.innerHTML = '<span class="status-indicator"></span>完了処理中...';
                            this.elements.sendingStatus.classList.add('status-sending');
                        }
                    }

                    const currentProcessingUrl = this.getElement('currentProcessingUrl');
                    if (currentProcessingUrl) {
                        const nextIndex = processed;
                        if (nextIndex < total) {
                            const inProgressItem = latestTodo.description[nextIndex];
                            if (inProgressItem) {
                                currentProcessingUrl.textContent = inProgressItem.url;
                                currentProcessingUrl.style.display = 'block';
                            }
                        } else {
                            currentProcessingUrl.style.display = 'none';
                        }
                    }
                } else {
                    if (this.isStopButtonActive) {
                        if (this.elements.sendingStatus) {
                            this.elements.sendingStatus.innerHTML = '<span class="status-indicator"></span>送信中...';
                            this.elements.sendingStatus.classList.add('status-sending');
                        }
                    } else {
                        if (this.elements.sendingStatus) {
                            this.elements.sendingStatus.textContent = '待機中';
                            this.elements.sendingStatus.classList.remove('status-sending');
                        }
                    }

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
                }
            } else {
                if (this.elements.sendingStatus) {
                    this.elements.sendingStatus.textContent = '待機中';
                    this.elements.sendingStatus.classList.remove('status-sending');
                }

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
            }

            // 最近の結果表示
            const recentResults = completedTodos.slice(0, 3);
            if (this.elements.recentResultsList) {
                if (recentResults.length === 0) {
                    this.elements.recentResultsList.innerHTML = '<div class="no-results">送信結果はありません</div>';
                } else {
                    this.elements.recentResultsList.innerHTML = '';
                    recentResults.forEach(todo => {
                        const resultItem = document.createElement('div');
                        resultItem.className = 'recent-result-item';

                        const total = todo.description ? todo.description.length : 0;
                        const success = todo.description ? todo.description.filter(item => item.result === '成功').length : 0;
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
                            window.location.href = `../main.html?tab=results&id=${todo.id}`;
                        });

                        this.elements.recentResultsList.appendChild(resultItem);
                    });
                }
            }
        } catch (error) {
            this.showToast('ダッシュボードの更新に失敗しました', 'error');
        }
    }

    /**
     * 送信状態の表示を更新
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
     * 進捗バーを初期化
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
    }
}

/**
 * ダッシュボードシングルトンインスタンスを作成
 */
export function createDashboard() {
    return new Dashboard();
}