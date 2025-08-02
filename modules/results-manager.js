/**
 * 結果管理モジュール
 * 送信結果の表示、保存、削除、エクスポート機能を担当
 */

// 共通モジュールのインポート
import { ExDB } from '../shared/database.js';

/**
 * 結果管理クラス
 */
export class ResultsManager {
    constructor(showToastFn = null, getElementFn = null) {
        this.showToastFunction = showToastFn;
        this.getElementFunction = getElementFn;
        this.elements = this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * DOM要素を初期化
     * @returns {Object} DOM要素の参照オブジェクト
     */
    initializeElements() {
        return {
            resultSelect: this.getElement('resultSelect'),
            resultTitle: this.getElement('resultTitle'),
            resultsList: this.getElement('resultsList'),
            saveResultTitleButton: this.getElement('saveResultTitle'),
            exportResultsButton: this.getElement('exportResults'),
            deleteResultButton: this.getElement('deleteResult'),
            deleteAllResultsButton: this.getElement('deleteAllResults')
        };
    }

    /**
     * 要素を取得するヘルパー関数
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    getElement(id) {
        if (this.getElementFunction) {
            return this.getElementFunction(id);
        }
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
            console.log(`Toast: ${message} (${type})`);
        }
    }

    /**
     * イベントリスナーを設定
     */
    setupEventListeners() {
        if (this.elements.saveResultTitleButton) {
            this.elements.saveResultTitleButton.addEventListener('click', () => this.saveResultTitleHandler());
        }
        if (this.elements.resultSelect) {
            this.elements.resultSelect.addEventListener('change', () => this.loadSelectedResult());
        }
        if (this.elements.exportResultsButton) {
            this.elements.exportResultsButton.addEventListener('click', () => this.exportResultsToCSV());
        }
        if (this.elements.deleteResultButton) {
            this.elements.deleteResultButton.addEventListener('click', () => this.deleteSelectedResult());
        }
        if (this.elements.deleteAllResultsButton) {
            this.elements.deleteAllResultsButton.addEventListener('click', () => this.deleteAllResults());
        }
    }

    /**
     * 送信結果一覧を読み込む
     */
    async loadResults() {
        try {
            if (!this.elements.resultSelect || !this.elements.resultsList) return;

            const db = new ExDB();
            const todos = await db.getAllTodos();
            const completedTodos = todos.filter(todo => todo.completed).reverse();
            const previousValue = this.elements.resultSelect.value;

            this.elements.resultSelect.innerHTML = '';

            if (completedTodos.length === 0) {
                const option = document.createElement('option');
                option.textContent = '送信結果がありません';
                option.disabled = true;
                this.elements.resultSelect.appendChild(option);

                if (this.elements.resultTitle) this.elements.resultTitle.value = '';
                this.elements.resultsList.innerHTML = '<div class="no-results">送信結果はありません</div>';

                this.setButtonsDisabled(true);
                return;
            }

            completedTodos.forEach(todo => {
                const option = document.createElement('option');
                option.value = todo.id;
                option.textContent = todo.title;
                this.elements.resultSelect.appendChild(option);
            });

            await new Promise(resolve => setTimeout(resolve, 0));

            let selectedTodo = null;
            if (previousValue) {
                const previousTodo = completedTodos.find(todo => todo.id == previousValue);
                if (previousTodo) {
                    selectedTodo = previousTodo;
                    this.elements.resultSelect.value = previousValue;
                }
            }

            if (!selectedTodo) {
                selectedTodo = completedTodos[0];
                this.elements.resultSelect.value = selectedTodo.id;
            }

            if (this.elements.resultSelect.value != selectedTodo.id) {
                const correctIndex = Array.from(this.elements.resultSelect.options).findIndex(
                    option => option.value == selectedTodo.id
                );
                if (correctIndex >= 0) {
                    this.elements.resultSelect.selectedIndex = correctIndex;
                }
            }

            this.displayResult(selectedTodo);
            this.setButtonsDisabled(false);
        } catch (error) {
            this.showToast('送信結果の読み込みに失敗しました', 'error');
        }
    }

    /**
     * ボタンの有効/無効状態を設定
     * @param {boolean} disabled - 無効にするかどうか
     */
    setButtonsDisabled(disabled) {
        if (this.elements.deleteResultButton) this.elements.deleteResultButton.disabled = disabled;
        if (this.elements.saveResultTitleButton) this.elements.saveResultTitleButton.disabled = disabled;
        if (this.elements.exportResultsButton) this.elements.exportResultsButton.disabled = disabled;
    }

    /**
     * 選択された結果を読み込む
     */
    async loadSelectedResult() {
        try {
            if (!this.elements.resultSelect) return;

            const resultId = parseInt(this.elements.resultSelect.value);
            if (!resultId || isNaN(resultId)) {
                for (let i = 0; i < this.elements.resultSelect.options.length; i++) {
                    const option = this.elements.resultSelect.options[i];
                    if (!option.disabled && option.value) {
                        this.elements.resultSelect.selectedIndex = i;
                        await this.loadSelectedResult();
                        return;
                    }
                }
                return;
            }

            const db = new ExDB();
            const todo = await db.getTodoById(resultId);
            if (todo) {
                this.displayResult(todo);
            } else {
                await this.loadResults();
            }
        } catch (error) {
            this.showToast('送信結果の読み込みに失敗しました', 'error');
        }
    }

    /**
     * 結果を表示する
     * @param {Object} todo - Todoオブジェクト
     */
    displayResult(todo) {
        if (!this.elements.resultTitle || !this.elements.resultsList) return;

        this.elements.resultTitle.value = todo.title;
        this.elements.resultsList.innerHTML = '';

        if (!todo.description || todo.description.length === 0) {
            this.elements.resultsList.innerHTML = '<div class="no-results">データがありません</div>';
            return;
        }

        todo.description.forEach((item, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';

            const statusClass = item.result === '成功' ? 'status-success' :
                               item.result === '失敗' ? 'status-failed' : 'status-pending';

            resultItem.innerHTML = `
                <div class="result-header">
                    <span class="result-number">${index + 1}</span>
                    <span class="result-url">${item.url}</span>
                    <span class="result-status ${statusClass}">${item.result || '未処理'}</span>
                </div>
                ${item.contact ? `<div class="result-contact">問い合わせページ: ${item.contact}</div>` : ''}
                ${item.reason ? `<div class="result-reason">理由: ${item.reason}</div>` : ''}
            `;

            this.elements.resultsList.appendChild(resultItem);
        });
    }

    /**
     * 結果のタイトルを保存する
     */
    async saveResultTitleHandler() {
        try {
            if (!this.elements.resultSelect || !this.elements.resultTitle) return;

            const resultId = parseInt(this.elements.resultSelect.value);
            if (!resultId) {
                this.showToast('送信結果が選択されていません', 'warning');
                return;
            }

            const newTitle = this.elements.resultTitle.value.trim();
            if (newTitle === '') {
                this.showToast('タイトルを入力してください', 'warning');
                return;
            }

            const db = new ExDB();
            const todo = await db.getTodoById(resultId);
            if (todo) {
                await db.updateTodo(resultId, { title: newTitle });

                const option = this.elements.resultSelect.options[this.elements.resultSelect.selectedIndex];
                if (option) {
                    option.textContent = newTitle;
                }

                this.showToast('タイトルを保存しました', 'success');
            }
        } catch (error) {
            this.showToast('タイトルの保存に失敗しました', 'error');
        }
    }

    /**
     * 結果をCSVでエクスポートする
     */
    exportResultsToCSV() {
        try {
            if (!this.elements.resultSelect) return;

            const resultId = parseInt(this.elements.resultSelect.value);
            if (!resultId) {
                this.showToast('送信結果が選択されていません', 'warning');
                return;
            }

            (async () => {
                const db = new ExDB();
                const todo = await db.getTodoById(resultId);

                if (!todo || !todo.description || todo.description.length === 0) {
                    this.showToast('エクスポートするデータがありません', 'warning');
                    return;
                }

                let csvContent = 'URL,結果,問い合わせURL,理由\n';
                todo.description.forEach(item => {
                    const url = item.url ? `"${item.url.replace(/"/g, '""')}"` : '';
                    const result = item.result ? `"${item.result.replace(/"/g, '""')}"` : '';
                    const contact = item.contact ? `"${item.contact.replace(/"/g, '""')}"` : '';
                    const reason = item.reason ? `"${item.reason.replace(/"/g, '""')}"` : '';
                    csvContent += `${url},${result},${contact},${reason}\n`;
                });

                const bom = '\uFEFF';
                const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
                const urlObj = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', urlObj);
                link.setAttribute('download', `送信結果_${todo.title}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                this.showToast('CSVファイルをエクスポートしました', 'success');
            })();
        } catch (error) {
            this.showToast('CSVエクスポートに失敗しました', 'error');
        }
    }

    /**
     * 選択された結果を削除する
     */
    async deleteSelectedResult() {
        try {
            if (!this.elements.resultSelect) return;

            const resultId = parseInt(this.elements.resultSelect.value);
            const currentIndex = this.elements.resultSelect.selectedIndex;

            if (!resultId) {
                this.showToast('送信結果が選択されていません', 'warning');
                return;
            }

            if (!confirm('この送信結果を削除しますか？')) {
                return;
            }

            const db = new ExDB();
            await db.deleteTodo(resultId);
            await this.loadResults();

            if (this.elements.resultSelect.options.length > 0) {
                const newIndex = Math.min(currentIndex, this.elements.resultSelect.options.length - 1);
                this.elements.resultSelect.selectedIndex = newIndex;
                await this.loadSelectedResult();
            }

            this.showToast('送信結果を削除しました', 'success');
        } catch (error) {
            this.showToast('送信結果の削除に失敗しました', 'error');
        }
    }

    /**
     * 全ての結果を削除する
     */
    async deleteAllResults() {
        try {
            if (!confirm('全ての送信結果を削除しますか？この操作は元に戻せません。')) {
                return;
            }

            const db = new ExDB();
            await db.deleteAllTodos();
            await this.loadResults();
            this.showToast('全ての送信結果を削除しました', 'success');
        } catch (error) {
            this.showToast('送信結果の削除に失敗しました', 'error');
        }
    }

    /**
     * 特定の結果IDに切り替える
     * @param {number} resultId - 切り替える結果ID
     */
    async switchToResult(resultId) {
        if (resultId && this.elements.resultSelect) {
            this.elements.resultSelect.value = resultId;
            await this.loadSelectedResult();
        }
    }

    /**
     * 現在選択されている結果のIDを取得
     * @returns {number|null} 選択されている結果ID
     */
    getCurrentResultId() {
        if (!this.elements.resultSelect) return null;
        const resultId = parseInt(this.elements.resultSelect.value);
        return !isNaN(resultId) ? resultId : null;
    }
}

/**
 * 結果マネージャーインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @param {Function} getElementFn - 要素取得関数
 * @returns {ResultsManager} 結果マネージャーインスタンス
 */
export function createResultsManager(showToastFn, getElementFn) {
    return new ResultsManager(showToastFn, getElementFn);
}