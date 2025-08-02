/**
 * フォーム処理サービス
 * DOM要素の操作、検証、データ管理を統一的に処理
 */

/**
 * フォーム処理サービスクラス
 */
export class FormService {
    constructor(showToastFn = null) {
        this.showToastFunction = showToastFn;
        this.eventListeners = new Map(); // イベントリスナーの管理
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
    // 基本DOM要素操作
    // ====================================

    /**
     * 要素を取得する
     * @param {string} id - 要素のID
     * @returns {Element|null} DOM要素
     */
    getElement(id) {
        return document.getElementById(id);
    }

    /**
     * 要素の値を設定する
     * @param {string} id - 要素のID
     * @param {string|number} value - 設定する値
     * @returns {boolean} 設定成功時はtrue
     */
    setElementValue(id, value) {
        const element = this.getElement(id);
        if (element) {
            element.value = value !== null && value !== undefined ? String(value) : '';
            return true;
        }
        return false;
    }

    /**
     * 要素の値を取得する
     * @param {string} id - 要素のID
     * @returns {string} 要素の値
     */
    getElementValue(id) {
        const element = this.getElement(id);
        return element ? element.value : '';
    }

    /**
     * チェックボックス/ラジオボタンの状態を設定する
     * @param {string} id - 要素のID
     * @param {boolean} checked - チェック状態
     * @returns {boolean} 設定成功時はtrue
     */
    setElementChecked(id, checked) {
        const element = this.getElement(id);
        if (element && (element.type === 'checkbox' || element.type === 'radio')) {
            element.checked = Boolean(checked);
            return true;
        }
        return false;
    }

    /**
     * チェックボックス/ラジオボタンの状態を取得する
     * @param {string} id - 要素のID
     * @returns {boolean} チェック状態
     */
    getElementChecked(id) {
        const element = this.getElement(id);
        return element && (element.type === 'checkbox' || element.type === 'radio') ? element.checked : false;
    }

    /**
     * 要素のHTMLコンテンツを設定する
     * @param {string} id - 要素のID
     * @param {string} html - 設定するHTML
     * @returns {boolean} 設定成功時はtrue
     */
    setElementHTML(id, html) {
        const element = this.getElement(id);
        if (element) {
            element.innerHTML = html || '';
            return true;
        }
        return false;
    }

    /**
     * 要素のHTMLコンテンツを取得する
     * @param {string} id - 要素のID
     * @returns {string} HTMLコンテンツ
     */
    getElementHTML(id) {
        const element = this.getElement(id);
        return element ? element.innerHTML : '';
    }

    // ====================================
    // 選択要素操作
    // ====================================

    /**
     * セレクト要素をクリアする
     * @param {string} selectId - セレクト要素のID
     * @returns {boolean} クリア成功時はtrue
     */
    clearSelect(selectId) {
        const select = this.getElement(selectId);
        if (select && select.tagName.toLowerCase() === 'select') {
            select.innerHTML = '';
            return true;
        }
        return false;
    }

    /**
     * セレクト要素にオプションを追加する
     * @param {string} selectId - セレクト要素のID
     * @param {string} value - オプションの値
     * @param {string} text - オプションの表示テキスト
     * @param {boolean} selected - 選択状態
     * @returns {boolean} 追加成功時はtrue
     */
    addOption(selectId, value, text, selected = false) {
        const select = this.getElement(selectId);
        if (select && select.tagName.toLowerCase() === 'select') {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            option.selected = selected;
            select.appendChild(option);
            return true;
        }
        return false;
    }

    /**
     * セレクト要素の選択値を設定する
     * @param {string} selectId - セレクト要素のID
     * @param {string} value - 設定する値
     * @returns {boolean} 設定成功時はtrue
     */
    setSelectedValue(selectId, value) {
        const select = this.getElement(selectId);
        if (select && select.tagName.toLowerCase() === 'select') {
            select.value = value;
            return true;
        }
        return false;
    }

    /**
     * セレクト要素の選択値を取得する
     * @param {string} selectId - セレクト要素のID
     * @returns {string} 選択されている値
     */
    getSelectedValue(selectId) {
        const select = this.getElement(selectId);
        return select && select.tagName.toLowerCase() === 'select' ? select.value : '';
    }

    /**
     * セレクト要素の選択されたオプションのテキストを取得する
     * @param {string} selectId - セレクト要素のID
     * @returns {string} 選択されているオプションのテキスト
     */
    getSelectedText(selectId) {
        const select = this.getElement(selectId);
        if (select && select.tagName.toLowerCase() === 'select' && select.selectedIndex >= 0) {
            return select.options[select.selectedIndex].textContent || '';
        }
        return '';
    }

    // ====================================
    // 複数要素操作
    // ====================================

    /**
     * 複数のチェックボックスの状態を設定する
     * @param {string} name - チェックボックスのname属性
     * @param {Array<string>} values - チェックする値の配列
     */
    setCheckboxGroupValues(name, values) {
        const checkboxes = document.querySelectorAll(`input[name="${name}"][type="checkbox"]`);
        checkboxes.forEach(checkbox => {
            checkbox.checked = values.includes(checkbox.value);
        });
    }

    /**
     * 複数のチェックボックスの選択値を取得する
     * @param {string} name - チェックボックスのname属性
     * @returns {Array<string>} チェックされている値の配列
     */
    getCheckboxGroupValues(name) {
        const checkboxes = document.querySelectorAll(`input[name="${name}"][type="checkbox"]:checked`);
        return Array.from(checkboxes).map(checkbox => checkbox.value);
    }

    /**
     * ラジオボタンの選択値を設定する
     * @param {string} name - ラジオボタンのname属性
     * @param {string} value - 選択する値
     * @returns {boolean} 設定成功時はtrue
     */
    setRadioValue(name, value) {
        const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (radio && radio.type === 'radio') {
            radio.checked = true;
            return true;
        }
        return false;
    }

    /**
     * ラジオボタンの選択値を取得する
     * @param {string} name - ラジオボタンのname属性
     * @returns {string} 選択されている値
     */
    getRadioValue(name) {
        const radio = document.querySelector(`input[name="${name}"]:checked`);
        return radio ? radio.value : '';
    }

    // ====================================
    // フォーム検証
    // ====================================

    /**
     * 必須項目をチェックする
     * @param {Array<string>} fieldIds - 必須項目のID配列
     * @returns {Object} 検証結果
     */
    validateRequired(fieldIds) {
        const errors = [];
        const validFields = [];

        fieldIds.forEach(fieldId => {
            const value = this.getElementValue(fieldId).trim();
            if (!value) {
                errors.push({ field: fieldId, message: '必須項目です' });
            } else {
                validFields.push(fieldId);
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            validFields
        };
    }

    /**
     * メールアドレスの形式をチェックする
     * @param {string} email - メールアドレス
     * @returns {boolean} 有効な形式の場合はtrue
     */
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    /**
     * 電話番号の形式をチェックする
     * @param {string} phone - 電話番号
     * @returns {boolean} 有効な形式の場合はtrue
     */
    validatePhone(phone) {
        const phoneRegex = /^[\d\-\(\)\+\s]+$/;
        return phoneRegex.test(phone.trim()) && phone.trim().length >= 10;
    }

    /**
     * URLの形式をチェックする
     * @param {string} url - URL
     * @returns {boolean} 有効な形式の場合はtrue
     */
    validateUrl(url) {
        try {
            new URL(url.trim());
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 郵便番号の形式をチェックする（日本形式）
     * @param {string} zipCode - 郵便番号
     * @returns {boolean} 有効な形式の場合はtrue
     */
    validateZipCode(zipCode) {
        const zipRegex = /^\d{3}-?\d{4}$/;
        return zipRegex.test(zipCode.trim());
    }

    // ====================================
    // 一括操作
    // ====================================

    /**
     * フォームデータを一括設定する
     * @param {Object} formData - フィールドIDと値のマッピング
     * @returns {Object} 設定結果
     */
    setFormData(formData) {
        const successFields = [];
        const failedFields = [];

        Object.entries(formData).forEach(([fieldId, value]) => {
            if (this.setElementValue(fieldId, value)) {
                successFields.push(fieldId);
            } else {
                failedFields.push(fieldId);
            }
        });

        return {
            success: failedFields.length === 0,
            successFields,
            failedFields
        };
    }

    /**
     * フォームデータを一括取得する
     * @param {Array<string>} fieldIds - 取得する項目のID配列
     * @returns {Object} フィールドIDと値のマッピング
     */
    getFormData(fieldIds) {
        const formData = {};

        fieldIds.forEach(fieldId => {
            const element = this.getElement(fieldId);
            if (element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    formData[fieldId] = element.checked;
                } else {
                    formData[fieldId] = element.value;
                }
            }
        });

        return formData;
    }

    /**
     * フォームをクリアする
     * @param {Array<string>} fieldIds - クリアする項目のID配列
     * @returns {Object} クリア結果
     */
    clearForm(fieldIds) {
        const successFields = [];
        const failedFields = [];

        fieldIds.forEach(fieldId => {
            const element = this.getElement(fieldId);
            if (element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = false;
                } else if (element.tagName.toLowerCase() === 'select') {
                    element.selectedIndex = 0;
                } else {
                    element.value = '';
                }
                successFields.push(fieldId);
            } else {
                failedFields.push(fieldId);
            }
        });

        return {
            success: failedFields.length === 0,
            successFields,
            failedFields
        };
    }

    // ====================================
    // イベント管理
    // ====================================

    /**
     * フォーム要素にイベントリスナーを追加する
     * @param {string} fieldId - 要素のID
     * @param {string} eventType - イベントタイプ
     * @param {Function} handler - イベントハンドラー
     * @returns {boolean} 追加成功時はtrue
     */
    addFormListener(fieldId, eventType, handler) {
        const element = this.getElement(fieldId);
        if (element) {
            element.addEventListener(eventType, handler);
            
            // リスナー管理のためのマッピング保存
            const key = `${fieldId}_${eventType}`;
            if (!this.eventListeners.has(key)) {
                this.eventListeners.set(key, []);
            }
            this.eventListeners.get(key).push(handler);
            
            return true;
        }
        return false;
    }

    /**
     * フォーム要素からイベントリスナーを削除する
     * @param {string} fieldId - 要素のID
     * @param {string} eventType - イベントタイプ
     * @param {Function} handler - イベントハンドラー
     * @returns {boolean} 削除成功時はtrue
     */
    removeFormListener(fieldId, eventType, handler) {
        const element = this.getElement(fieldId);
        if (element) {
            element.removeEventListener(eventType, handler);
            
            // リスナー管理からも削除
            const key = `${fieldId}_${eventType}`;
            if (this.eventListeners.has(key)) {
                const handlers = this.eventListeners.get(key);
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                    if (handlers.length === 0) {
                        this.eventListeners.delete(key);
                    }
                }
            }
            
            return true;
        }
        return false;
    }

    /**
     * すべてのイベントリスナーをクリアする
     */
    clearAllListeners() {
        this.eventListeners.forEach((handlers, key) => {
            const [fieldId, eventType] = key.split('_');
            const element = this.getElement(fieldId);
            if (element) {
                handlers.forEach(handler => {
                    element.removeEventListener(eventType, handler);
                });
            }
        });
        this.eventListeners.clear();
    }

    // ====================================
    // ユーティリティ機能
    // ====================================

    /**
     * 要素の表示状態を設定する
     * @param {string} fieldId - 要素のID
     * @param {boolean} visible - 表示状態
     * @returns {boolean} 設定成功時はtrue
     */
    setElementVisible(fieldId, visible) {
        const element = this.getElement(fieldId);
        if (element) {
            element.style.display = visible ? '' : 'none';
            return true;
        }
        return false;
    }

    /**
     * 要素の無効化状態を設定する
     * @param {string} fieldId - 要素のID
     * @param {boolean} disabled - 無効化状態
     * @returns {boolean} 設定成功時はtrue
     */
    setElementDisabled(fieldId, disabled) {
        const element = this.getElement(fieldId);
        if (element) {
            element.disabled = Boolean(disabled);
            return true;
        }
        return false;
    }

    /**
     * 要素にフォーカスを設定する
     * @param {string} fieldId - 要素のID
     * @returns {boolean} 設定成功時はtrue
     */
    focusElement(fieldId) {
        const element = this.getElement(fieldId);
        if (element && typeof element.focus === 'function') {
            element.focus();
            return true;
        }
        return false;
    }

    /**
     * 要素のCSS classを追加する
     * @param {string} fieldId - 要素のID
     * @param {string} className - 追加するクラス名
     * @returns {boolean} 追加成功時はtrue
     */
    addElementClass(fieldId, className) {
        const element = this.getElement(fieldId);
        if (element) {
            element.classList.add(className);
            return true;
        }
        return false;
    }

    /**
     * 要素のCSS classを削除する
     * @param {string} fieldId - 要素のID
     * @param {string} className - 削除するクラス名
     * @returns {boolean} 削除成功時はtrue
     */
    removeElementClass(fieldId, className) {
        const element = this.getElement(fieldId);
        if (element) {
            element.classList.remove(className);
            return true;
        }
        return false;
    }

    /**
     * 要素にCSS classが存在するかチェックする
     * @param {string} fieldId - 要素のID
     * @param {string} className - チェックするクラス名
     * @returns {boolean} クラスが存在する場合はtrue
     */
    hasElementClass(fieldId, className) {
        const element = this.getElement(fieldId);
        return element ? element.classList.contains(className) : false;
    }

    /**
     * サービスを破棄する（クリーンアップ）
     */
    destroy() {
        this.clearAllListeners();
        this.showToastFunction = null;
    }
}

/**
 * フォームサービスインスタンスを作成
 * @param {Function} showToastFn - トースト表示関数
 * @returns {FormService} フォームサービスインスタンス
 */
export function createFormService(showToastFn) {
    return new FormService(showToastFn);
}