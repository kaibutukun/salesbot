/**
 * フォーム自動入力ヘルパーモジュール
 * フォーム要素の検索、入力、データ処理を統一化
 * 
 * このモジュールはsend.jsから抽出された複雑な入力処理を提供します
 */

import { setElementValue, getVisibleTextareas } from './content-script-base.js';

// ====================================
// データ処理ユーティリティ
// ====================================

/**
 * 電話番号を分割する
 * @param {string} phoneNumber - 電話番号
 * @returns {Array<string>} [部分1, 部分2, 部分3]
 */
export function splitPhoneNumber(phoneNumber) {
    if (!phoneNumber) return ['', '', ''];
    
    const match = phoneNumber.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
    return match ? [match[1], match[2], match[3]] : ['', '', ''];
}

/**
 * 郵便番号を分割する
 * @param {string} zipCode - 郵便番号
 * @returns {Array<string>} [前半, 後半]
 */
export function splitZipCode(zipCode) {
    if (!zipCode) return ['', ''];
    
    const match = zipCode.match(/(\d{3})-?(\d{4})/);
    return match ? [match[1], match[2]] : ['', ''];
}

/**
 * 名前を分割する
 * @param {string} fullName - フルネーム
 * @returns {Object} {firstName: string, lastName: string}
 */
export function splitName(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };
    
    const names = fullName.trim().split(/\s+/);
    return {
        lastName: names[0] || '',
        firstName: names.slice(1).join(' ') || ''
    };
}

// ====================================
// フォーム要素検索
// ====================================

/**
 * 入力フィールドを名前パターンで検索する
 * @param {Array<string>} patterns - 検索パターン
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {Array<HTMLElement>} マッチした要素の配列
 */
export function findFieldsByName(patterns, doc = document) {
    const elements = [];
    
    // input要素を検索
    const inputs = doc.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
    inputs.forEach(input => {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();
        
        for (const pattern of patterns) {
            if (name.includes(pattern) || id.includes(pattern) || placeholder.includes(pattern)) {
                elements.push(input);
                break;
            }
        }
    });
    
    return elements;
}

/**
 * ラベルテキストで入力フィールドを検索する
 * @param {Array<string>} labelTexts - ラベルテキストパターン
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {Array<HTMLElement>} マッチした要素の配列
 */
export function findFieldsByLabel(labelTexts, doc = document) {
    const elements = [];
    
    const labels = doc.querySelectorAll('label');
    labels.forEach(label => {
        const labelText = label.textContent || '';
        
        for (const pattern of labelTexts) {
            if (labelText.includes(pattern)) {
                // for属性で関連付けられた要素を探す
                if (label.htmlFor) {
                    const target = doc.getElementById(label.htmlFor);
                    if (target) {
                        elements.push(target);
                    }
                } else {
                    // ラベル内の入力要素を探す
                    const input = label.querySelector('input');
                    if (input) {
                        elements.push(input);
                    }
                }
                break;
            }
        }
    });
    
    return elements;
}

// ====================================
// 専用フィールド入力処理
// ====================================

/**
 * 名前フィールドに入力する
 * @param {string} lastName - 姓
 * @param {string} firstName - 名
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {boolean} 入力成功したかどうか
 */
export function fillNameFields(lastName, firstName, doc = document) {
    let success = false;
    
    // 姓フィールド検索パターン
    const lastNamePatterns = ['lastname', 'family', '姓', '苗字'];
    const lastNameFields = [
        ...findFieldsByName(lastNamePatterns, doc),
        ...findFieldsByLabel(['姓', '苗字', 'お名前（姓）'], doc)
    ];
    
    // 名フィールド検索パターン
    const firstNamePatterns = ['firstname', 'given', '名'];
    const firstNameFields = [
        ...findFieldsByName(firstNamePatterns, doc),
        ...findFieldsByLabel(['名', 'お名前（名）'], doc)
    ];
    
    // 姓フィールドに入力
    lastNameFields.forEach(field => {
        if (setElementValue(field, lastName)) {
            success = true;
        }
    });
    
    // 名フィールドに入力
    firstNameFields.forEach(field => {
        if (setElementValue(field, firstName)) {
            success = true;
        }
    });
    
    // フルネーム用フィールドも探す
    const fullNamePatterns = ['name', 'username', '氏名', 'お名前'];
    const fullNameFields = [
        ...findFieldsByName(fullNamePatterns, doc),
        ...findFieldsByLabel(['氏名', 'お名前', '名前'], doc)
    ];
    
    const fullName = lastName + ' ' + firstName;
    fullNameFields.forEach(field => {
        if (setElementValue(field, fullName)) {
            success = true;
        }
    });
    
    return success;
}

/**
 * 電話番号フィールドに入力する
 * @param {string} part1 - 電話番号部分1
 * @param {string} part2 - 電話番号部分2
 * @param {string} part3 - 電話番号部分3
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {boolean} 入力成功したかどうか
 */
export function fillPhoneFields(part1, part2, part3, doc = document) {
    let success = false;
    
    // 分割された電話番号フィールドを探す
    const telPatterns = ['tel', 'phone', '電話'];
    const telFields = [
        ...findFieldsByName(telPatterns, doc),
        ...findFieldsByLabel(['電話番号', 'TEL', 'お電話番号'], doc)
    ];
    
    // 分割フィールドの検出（隣接する複数の入力欄）
    const splitTelFields = [];
    telFields.forEach(field => {
        const parent = field.parentElement;
        if (parent) {
            const siblingInputs = parent.querySelectorAll('input[type="text"], input[type="tel"]');
            if (siblingInputs.length >= 3) {
                splitTelFields.push(...siblingInputs);
            }
        }
    });
    
    // 分割フィールドに入力
    if (splitTelFields.length >= 3) {
        setElementValue(splitTelFields[0], part1);
        setElementValue(splitTelFields[1], part2);
        setElementValue(splitTelFields[2], part3);
        success = true;
    }
    
    // 統合フィールドに入力
    const fullTel = `${part1}-${part2}-${part3}`;
    telFields.forEach(field => {
        if (setElementValue(field, fullTel)) {
            success = true;
        }
    });
    
    return success;
}

/**
 * メールアドレスフィールドに入力する
 * @param {string} email - メールアドレス
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {boolean} 入力成功したかどうか
 */
export function fillEmailFields(email, doc = document) {
    let success = false;
    
    // メールフィールド検索
    const emailFields = [
        ...doc.querySelectorAll('input[type="email"]'),
        ...findFieldsByName(['email', 'mail', 'メール'], doc),
        ...findFieldsByLabel(['メールアドレス', 'Email', 'メール'], doc)
    ];
    
    emailFields.forEach(field => {
        if (setElementValue(field, email)) {
            success = true;
        }
    });
    
    return success;
}

/**
 * 会社名フィールドに入力する
 * @param {string} company - 会社名
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {boolean} 入力成功したかどうか
 */
export function fillCompanyFields(company, doc = document) {
    let success = false;
    
    const companyFields = [
        ...findFieldsByName(['company', 'corporation', '会社', '法人'], doc),
        ...findFieldsByLabel(['会社名', '法人名', '企業名', '団体名'], doc)
    ];
    
    companyFields.forEach(field => {
        if (setElementValue(field, company)) {
            success = true;
        }
    });
    
    return success;
}

/**
 * textareaにメッセージを入力する
 * @param {string} message - メッセージ
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {boolean} 入力成功したかどうか
 */
export function fillMessageFields(message, doc = document) {
    let success = false;
    
    const textareas = getVisibleTextareas(doc);
    textareas.forEach(textarea => {
        if (setElementValue(textarea, message)) {
            success = true;
        }
    });
    
    return success;
}

// ====================================
// 統合フォーム入力処理
// ====================================

/**
 * プロフィールデータを使ってフォームに自動入力する
 * @param {Object} profile - プロフィールデータ
 * @param {Document} doc - 検索対象のドキュメント
 * @returns {Object} 入力結果
 */
export function fillFormWithProfile(profile, doc = document) {
    const results = {
        name: false,
        email: false,
        company: false,
        phone: false,
        message: false
    };
    
    // 名前の分割と入力
    if (profile.name) {
        const { lastName, firstName } = splitName(profile.name);
        results.name = fillNameFields(lastName, firstName, doc);
    }
    
    // メールアドレス入力
    if (profile.email) {
        results.email = fillEmailFields(profile.email, doc);
    }
    
    // 会社名入力
    if (profile.company) {
        results.company = fillCompanyFields(profile.company, doc);
    }
    
    // 電話番号入力
    if (profile.tel) {
        const [part1, part2, part3] = splitPhoneNumber(profile.tel);
        results.phone = fillPhoneFields(part1, part2, part3, doc);
    }
    
    // メッセージ入力
    if (profile.message) {
        results.message = fillMessageFields(profile.message, doc);
    }
    
    return results;
}