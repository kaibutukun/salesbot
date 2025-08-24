// content-scripts/send.js - プロフィール参照優先順位修正 + 最適化版
// 新規作成: プロフィール選択優先順位の修正（urlSelectedProfile優先）と全体最適化

// ====================================
// 定数定義
// ====================================

const ACTION_SEND = "send";
const WAIT_TIMEOUT = 15000; // 15秒
const FORM_TIMEOUT = 5000; // 5秒
const PAGE_LOAD_DELAY = 1000; // 1秒
const RECAPTCHA_WAIT = 20000; // 20秒

// 営業お断り関連キーワード
const REFUSAL_KEYWORDS = ['遠慮', '断り', '禁止', '控え', '営業権'];
const SALES_REFUSAL_KEYWORDS = ['営業', '宣伝', 'セールス', '売り込み'];

// フィールド識別キーワード
const FIELD_KEYWORDS = {
    company: ['社名', '企業名', '法人名', '個人', '組織', '所属', '団体', '勤務先', 'company', 'Company', 'COMPANY', 'corporate', 'Corporate'],
    department: ['部署', '部門'],
    industry: ['業種'],
    position: ['役職'],
    subject: ['件名', 'タイトル', '題名', 'Subject', 'subject'],
    member: ['従業員数', '社員数'],
    sei: ['姓', '苗字'],
    seiKana: ['セイ'],
    meiKana: ['メイ'],
    seiHira: ['せい'],
    meiHira: ['めい'],
    name: ['名前', '氏名', '担当者', 'なまえ', 'Name', 'name'],
    furigana: ['フリガナ'],
    hiragana: ['ふりがな'],
    email: ['メール', 'MAIL', 'Mail', 'mail', '確認', '@'],
    tel: ['TEL', 'Tel', 'tel', '電話', '携帯', '直通', '連絡先'],
    fax: ['FAX', 'Fax', 'fax', 'ファックス'],
    zip: ['郵便', '〒'],
    pref: ['都道府県'],
    city: ['市区町村'],
    address: ['番地'],
    building: ['ビル', '建物'],
    fullAddress: ['住所', '所在', 'ところ', 'ADDRESS', 'Address', 'address'],
    url: ['URL', 'WEB', 'Web', 'web', 'ホームページ', 'ウェブサイト', 'http', 'リンク']
};

// 送信ボタン識別キーワード
const SUBMIT_KEYWORDS = {
    text: ['送信', '送 信', '送　信', '確認', '確 認', '確　認', 'Send', 'SEND', 'Submit', 'SUBMIT', '次へ', '次に進む', 'はい', 'OK', '同意する', '続行'],
    value: ['送信', '送 信', '送　信', '確認', '確 認', '確　認', 'Send', 'SEND', 'Submit', 'SUBMIT', '問い合', '問合', '次へ', '次に進む', 'はい', 'OK', '同意する', '続行'],
    alt: ['送信', '確認', 'Send', 'SEND', 'Submit', 'SUBMIT', '問い合', '問合', '次へ', '次に進む', 'はい', 'OK', '同意する', '続行']
};

// ====================================
// Chrome拡張メッセージリスナー
// ====================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "tags") {
        onExecute(message.tags)
            .then(() => sendResponse({ status: "completed" }))
            .catch(error => sendResponse({ status: "error", error: error.message }));
        return true; // 非同期レスポンス
    }
});

// ====================================
// メイン実行関数
// ====================================

/**
 * フォーム自動入力・送信のメイン処理
 * @param {Array} tags - タグパラメータ
 */
async function onExecute(tags) {
    try {
        // ページ読み込み完了を待つ
        await delay(PAGE_LOAD_DELAY);

        // ====================================
        // プロフィール取得（修正: urlSelectedProfile優先）
        // ====================================
        
        const profile = await getSelectedProfile();
        if (!profile) {
            sendErrorMessage("プロフィールが選択されていません", "No profile selected");
            return;
        }

        // ====================================
        // ブラウザ機能の無効化
        // ====================================
        
        disableBrowserDialogs();

        // ====================================
        // タグ置換処理
        // ====================================
        
        const processedMessage = processTagReplacements(profile.message, tags);
        const processedProfile = { ...profile, message: processedMessage };

        // ====================================
        // ドキュメント探索とフォーム検証
        // ====================================
        
        const formDocument = await findFormDocument();
        if (!formDocument) {
            sendErrorMessage("問い合わせフォームが見つかりませんでした", "No form document found");
            return;
        }

        // 営業お断り文言の検出
        if (detectSalesRefusal(document)) {
            sendErrorMessage("営業お断りを検出", "Sales refusal detected");
            return;
        }

        // ====================================
        // フォーム要素の自動操作
        // ====================================
        
        // セレクトボックス、ラジオボタン、チェックボックスの処理
        processSelectElements(formDocument, processedProfile);
        processRadioButtons(formDocument);
        processCheckboxes(formDocument);

        // テキストエリアへのメッセージ入力
        if (!processTextareas(formDocument, processedProfile.message)) {
            sendErrorMessage("問い合わせフォームが見つかりませんでした", "No textarea found");
            return;
        }

        // 入力フィールドの自動入力
        processInputFields(formDocument, processedProfile);
        
        // メールフィールドの特別処理
        processEmailFields(formDocument, processedProfile.email);

        // フォーム入力完了後の短時間待機
        await delay(1000);

        // ====================================
        // 送信処理
        // ====================================
        
        const submitButton = findSubmitButton(document);
        if (!submitButton) {
            sendErrorMessage("対応できない問い合わせフォームです", "No submit button found");
            return;
        }

        // reCAPTCHA検出と送信処理
        const hasRecaptcha = detectRecaptcha(formDocument);
        await performSubmission(submitButton, hasRecaptcha, formDocument);

    } catch (error) {
        sendErrorMessage("Webサイト解析不可", error.message);
    }
}

// ====================================
// プロフィール関連関数（修正版）
// ====================================

/**
 * 選択されたプロフィールを取得（優先順位修正版）
 * 送信先リスト管理ページの選択（urlSelectedProfile）を最優先
 * @returns {Promise<Object|null>} プロフィールオブジェクト
 */
async function getSelectedProfile() {
    try {
        // ====================================
        // 修正: プロフィール参照の優先順位変更
        // urlSelectedProfile（送信先リスト管理）> selectedPattern（フォーム入力データ管理）
        // ====================================
        
        const profileData = await chrome.storage.local.get([
            'optionPatterns', 
            'urlSelectedProfile',  // 送信先リスト管理ページの選択（優先）
            'selectedPattern'      // フォーム入力データ管理ページの選択（フォールバック）
        ]);

        const profiles = profileData.optionPatterns;
        if (!profiles || profiles.length === 0) {
            console.error('No profiles found in storage');
            return null;
        }

        // 優先順位: urlSelectedProfile → selectedPattern → 最初のプロフィール
        const selectedPatternId = profileData.urlSelectedProfile || 
                                profileData.selectedPattern || 
                                profiles[0].id;

        const profile = profiles.find(p => p.id === selectedPatternId);
        if (!profile) {
            console.error('Selected profile not found:', selectedPatternId);
            return profiles[0]; // フォールバック
        }

        console.log('Using profile:', profile.title, '(ID:', selectedPatternId, ')');
        return profile;

    } catch (error) {
        console.error('Failed to get profile:', error);
        return null;
    }
}

/**
 * タグ置換処理
 * @param {string} message - 置換対象のメッセージ
 * @param {Array} tags - 置換タグ配列
 * @returns {string} 置換後のメッセージ
 */
function processTagReplacements(message, tags) {
    let processedMessage = message;
    
    for (let i = 0; i < 5; i++) {
        const paramName = `[param${i + 1}]`;
        if (processedMessage.includes(paramName)) {
            const replacement = (tags && tags.length > i) ? tags[i] : "";
            processedMessage = processedMessage.replaceAll(paramName, replacement);
        }
    }
    
    return processedMessage;
}

// ====================================
// ドキュメント探索関数
// ====================================

/**
 * フォームが含まれるドキュメントを探索（iframe対応）
 * @returns {Promise<Document|null>} フォームドキュメント
 */
async function findFormDocument() {
    // メインドキュメントにtextareaがあるかチェック
    const mainTextareas = document.getElementsByTagName('textarea');
    if (mainTextareas.length > 0) {
        return document;
    }

    // iframe内を探索
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
        try {
            const iframeDocument = iframes[i].contentDocument || iframes[i].contentWindow.document;
            const iframeTextareas = iframeDocument.getElementsByTagName('textarea');
            
            if (iframeTextareas.length > 0) {
                return iframeDocument;
            }
        } catch (iframeError) {
            console.warn('Cannot access iframe:', iframeError.message);
        }
    }

    return null;
}

/**
 * 営業お断り文言を検出
 * @param {Document} doc - 検索対象ドキュメント
 * @returns {boolean} 営業お断りが検出された場合はtrue
 */
function detectSalesRefusal(doc) {
    const textElements = doc.querySelectorAll('p, li, u, label, span');
    
    const refusalElements = Array.from(textElements).filter(element =>
        REFUSAL_KEYWORDS.some(keyword => element.innerText.includes(keyword))
    );

    if (refusalElements.length > 0) {
        const salesRefusalElements = refusalElements.filter(element =>
            SALES_REFUSAL_KEYWORDS.some(keyword => element.innerText.includes(keyword))
        );
        
        return salesRefusalElements.length > 0;
    }
    
    return false;
}

// ====================================
// フォーム要素処理関数
// ====================================

/**
 * セレクトボックスの処理
 * @param {Document} doc - ターゲットドキュメント
 * @param {Object} profile - プロフィールオブジェクト
 */
function processSelectElements(doc, profile) {
    const selects = doc.getElementsByTagName('select');
    
    for (let i = 0; i < selects.length; i++) {
        const select = selects[i];
        
        // デフォルトで最後のオプションを選択
        select.selectedIndex = select.options.length - 1;

        // 都道府県が一致する場合は選択
        if (profile.address1) {
            for (let j = 0; j < select.options.length; j++) {
                if (select.options[j].text === profile.address1) {
                    select.selectedIndex = j;
                    break;
                }
            }
        }
    }
}

/**
 * ラジオボタンの処理
 * @param {Document} doc - ターゲットドキュメント
 */
function processRadioButtons(doc) {
    const radioButtons = doc.querySelectorAll('input[type="radio"]');
    radioButtons.forEach(radio => radio.click());
}

/**
 * チェックボックスの処理
 * @param {Document} doc - ターゲットドキュメント
 */
function processCheckboxes(doc) {
    const checkboxes = doc.querySelectorAll('input[type="checkbox"]');
    let lastCheckbox = null;

    for (let i = 0; i < checkboxes.length; i++) {
        const checkbox = checkboxes[i];

        if (!checkbox.checked) {
            checkbox.click();
        }

        // 同じ名前のチェックボックス重複回避
        if (lastCheckbox && lastCheckbox.name === checkbox.name && lastCheckbox.checked) {
            lastCheckbox.checked = false;
        }

        lastCheckbox = checkbox;
    }
}

/**
 * テキストエリアの処理
 * @param {Document} doc - ターゲットドキュメント
 * @param {string} message - 入力メッセージ
 * @returns {boolean} 処理成功時はtrue
 */
function processTextareas(doc, message) {
    const textareas = doc.getElementsByTagName('textarea');
    
    if (textareas.length === 0) {
        return false;
    }

    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    
    for (let i = 0; i < textareas.length; i++) {
        const textarea = textareas[i];
        textarea.value = message;
        textarea.dispatchEvent(inputEvent);
    }
    
    return true;
}

/**
 * 入力フィールドの自動入力処理
 * @param {Document} doc - ターゲットドキュメント
 * @param {Object} profile - プロフィールオブジェクト
 */
function processInputFields(doc, profile) {
    const inputFields = doc.getElementsByTagName('input');
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    
    // 電話・FAX・郵便番号の分割
    const telParts = splitPhoneNumber(profile.tel);
    const faxParts = splitPhoneNumber(profile.fax);
    const zipParts = splitZipCode(profile.zip);

    for (let i = 0; i < inputFields.length; i++) {
        const input = inputFields[i];

        // スキップするフィールドタイプ
        if (shouldSkipInputField(input)) {
            continue;
        }

        // フィールド識別と値設定
        const value = identifyAndFillField(input, profile, telParts, faxParts, zipParts, inputEvent);
        
        // 値が設定されていない場合はダッシュを入力
        if (input.value === '') {
            input.value = "—";
            input.dispatchEvent(inputEvent);
        }
    }
}

/**
 * メールフィールドの特別処理
 * @param {Document} doc - ターゲットドキュメント
 * @param {string} email - メールアドレス
 */
function processEmailFields(doc, email) {
    const emailFields = doc.querySelectorAll('input[type="email"], input[type="mail"]');
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    
    emailFields.forEach(emailField => {
        emailField.value = email;
        emailField.dispatchEvent(inputEvent);
    });
}

// ====================================
// 送信ボタン関連関数
// ====================================

/**
 * 送信ボタンを検索
 * @param {Document} doc - 検索対象ドキュメント
 * @returns {Element|null} 送信ボタン要素
 */
function findSubmitButton(doc) {
    // テキストベースのボタン
    const textButtons = doc.querySelectorAll('span, button');
    const textSubmitButtons = Array.from(textButtons).filter(button =>
        SUBMIT_KEYWORDS.text.some(keyword => button.innerText.includes(keyword))
    );

    // input要素のボタン
    const inputButtons = doc.querySelectorAll('input[type="submit"], input[type="button"]');
    const inputSubmitButtons = Array.from(inputButtons).filter(button =>
        button.value && SUBMIT_KEYWORDS.value.some(keyword => button.value.includes(keyword))
    );

    // 画像ボタン
    const imageButtons = doc.querySelectorAll('input[type="image"]');
    const imageSubmitButtons = Array.from(imageButtons).filter(button =>
        button.alt && SUBMIT_KEYWORDS.alt.some(keyword => button.alt.includes(keyword))
    );

    // 全送信ボタンを統合
    const allSubmitButtons = [
        ...textSubmitButtons,
        ...imageSubmitButtons,
        ...inputSubmitButtons
    ];

    // 最後に出現するボタンを選択（確認画面対応）
    return allSubmitButtons.length > 0 ? allSubmitButtons[allSubmitButtons.length - 1] : null;
}

// ====================================
// reCAPTCHA関連関数
// ====================================

/**
 * reCAPTCHAを検出
 * @param {Document} doc - 検索対象ドキュメント
 * @returns {boolean} reCAPTCHAが存在する場合はtrue
 */
function detectRecaptcha(doc) {
    const hasRecaptchaElement = doc.querySelector('.g-recaptcha') !== null ||
                               doc.querySelector('iframe[src*="google.com/recaptcha"]') !== null;
    const hasRecaptchaScript = doc.querySelector('script[src*="recaptcha/api.js"]') !== null ||
                              (typeof grecaptcha !== 'undefined');
    const hasEnterpriseScript = doc.querySelector('script[src*="enterprise.js"]') !== null;

    return hasRecaptchaElement || hasRecaptchaScript || hasEnterpriseScript;
}

/**
 * 送信処理の実行（reCAPTCHA対応）
 * @param {Element} submitButton - 送信ボタン
 * @param {boolean} hasRecaptcha - reCAPTCHA存在フラグ
 * @param {Document} formDoc - フォームドキュメント
 */
async function performSubmission(submitButton, hasRecaptcha, formDoc) {
    if (hasRecaptcha) {
        // reCAPTCHAがある場合の処理
        chrome.runtime.sendMessage({ action: "keepalive" });
        await delay(RECAPTCHA_WAIT);
        chrome.runtime.sendMessage({ action: "keepalive" });

        // 最大2回まで送信を試行
        for (let attempt = 0; attempt < 2; attempt++) {
            submitButton.click();
            
            chrome.runtime.sendMessage({ action: "keepalive" });
            await delay(WAIT_TIMEOUT);
            chrome.runtime.sendMessage({ action: "keepalive" });

            // textareaが消えたかチェック
            if (!hasVisibleTextareas(formDoc)) {
                break;
            }
        }
    } else {
        // reCAPTCHAがない場合の処理
        submitButton.click();
        await delay(FORM_TIMEOUT);
    }

    // 確認画面の処理
    await handleConfirmationPage(formDoc);
}

/**
 * 確認画面の処理
 * @param {Document} formDoc - フォームドキュメント
 */
async function handleConfirmationPage(formDoc) {
    if (!hasVisibleTextareas(formDoc)) {
        // 確認ページの場合の最終送信ボタン処理
        const confirmButtons = findConfirmationButtons(document);
        
        if (confirmButtons.length === 0) {
            sendSuccessMessage("", "No confirmation buttons found");
            return;
        }

        confirmButtons[confirmButtons.length - 1].click();
        await delay(FORM_TIMEOUT);
        sendSuccessMessage("", "Confirmation button clicked");
    } else {
        // textareaがまだ表示されている場合
        const visibleTextareas = getVisibleTextareas(formDoc);
        const lastTextarea = visibleTextareas[visibleTextareas.length - 1];

        if (lastTextarea && lastTextarea.value === '') {
            sendSuccessMessage("", "Form submitted successfully");
        } else {
            sendErrorMessage("対応できない問い合わせフォームです", "Textarea still has value");
        }
    }
}

// ====================================
// ユーティリティ関数
// ====================================

/**
 * 指定時間待機
 * @param {number} ms - 待機時間（ミリ秒）
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ブラウザダイアログを無効化
 */
function disableBrowserDialogs() {
    window.confirm = () => true;
    window.alert = () => true;
    window.onbeforeunload = null;
}

/**
 * 入力フィールドをスキップすべきかチェック
 * @param {Element} input - 入力要素
 * @returns {boolean} スキップすべき場合はtrue
 */
function shouldSkipInputField(input) {
    const skipTypes = ['file', 'hidden', 'submit', 'button', 'radio', 'checkbox'];
    return skipTypes.includes(input.type);
}

/**
 * 電話番号を分割
 * @param {string} phone - 電話番号
 * @returns {Array} 分割された電話番号配列
 */
function splitPhoneNumber(phone) {
    if (!phone) return ['', '', ''];
    const match = phone.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
    return match ? [match[1], match[2], match[3]] : ['', '', ''];
}

/**
 * 郵便番号を分割
 * @param {string} zip - 郵便番号
 * @returns {Array} 分割された郵便番号配列
 */
function splitZipCode(zip) {
    if (!zip) return ['', ''];
    const match = zip.match(/(\d{3})-?(\d{4})/);
    return match ? [match[1], match[2]] : ['', ''];
}

/**
 * フィールド識別と値設定
 * @param {Element} input - 入力要素
 * @param {Object} profile - プロフィール
 * @param {Array} telParts - 電話番号部品
 * @param {Array} faxParts - FAX番号部品  
 * @param {Array} zipParts - 郵便番号部品
 * @param {Event} inputEvent - inputイベント
 */
function identifyAndFillField(input, profile, telParts, faxParts, zipParts, inputEvent) {
    let field = input;
    
    // 親要素を遡ってラベルテキストを取得
    for (let j = 0; j < 10; j++) {
        const parent = field.parentElement;
        if (!parent) break;
        
        const actualParent = parent.tagName === 'DD' ? parent.previousElementSibling : parent;
        const labelText = actualParent ? actualParent.innerText : "";

        // 長すぎるラベルはスキップ
        if (labelText.length > 100) {
            input.value = "—";
            break;
        }

        // キーワードマッチングによる自動入力
        const value = matchFieldKeywords(labelText, profile, telParts, faxParts, zipParts, parent);
        if (value !== null) {
            input.value = value;
            input.dispatchEvent(inputEvent);
            break;
        }

        field = parent;
    }
}

/**
 * キーワードマッチングによるフィールド値決定
 * @param {string} labelText - ラベルテキスト
 * @param {Object} profile - プロフィール
 * @param {Array} telParts - 電話番号部品
 * @param {Array} faxParts - FAX番号部品
 * @param {Array} zipParts - 郵便番号部品
 * @param {Element} parent - 親要素
 * @returns {string|null} マッチした値またはnull
 */
function matchFieldKeywords(labelText, profile, telParts, faxParts, zipParts, parent) {
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });

    // 各フィールドタイプのマッチング
    if (FIELD_KEYWORDS.email.some(k => labelText.includes(k))) return profile.email;
    if (FIELD_KEYWORDS.url.some(k => labelText.includes(k))) return profile.url;
    if (FIELD_KEYWORDS.company.some(k => labelText.includes(k))) return profile.company;
    if (FIELD_KEYWORDS.department.some(k => labelText.includes(k))) return profile.department;
    if (FIELD_KEYWORDS.industry.some(k => labelText.includes(k))) return profile.industry;
    if (FIELD_KEYWORDS.position.some(k => labelText.includes(k))) return profile.position;
    if (FIELD_KEYWORDS.subject.some(k => labelText.includes(k))) return profile.subject;
    if (FIELD_KEYWORDS.member.some(k => labelText.includes(k))) return profile.member;
    
    // 名前系フィールド（分割入力対応）
    if (FIELD_KEYWORDS.sei.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.sei, profile.mei);
        return profile.sei;
    }
    if (FIELD_KEYWORDS.seiKana.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.seiKana, profile.meiKana);
        return profile.seiKana;
    }
    if (FIELD_KEYWORDS.meiKana.some(k => labelText.includes(k))) return profile.meiKana;
    if (FIELD_KEYWORDS.seiHira.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.seiHira, profile.meiHira);
        return profile.seiHira;
    }
    if (FIELD_KEYWORDS.meiHira.some(k => labelText.includes(k))) return profile.meiHira;
    if (FIELD_KEYWORDS.furigana.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.seiKana, profile.meiKana);
        return profile.seiKana + profile.meiKana;
    }
    if (FIELD_KEYWORDS.hiragana.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.seiHira, profile.meiHira);
        return profile.seiHira + profile.meiHira;
    }
    if (FIELD_KEYWORDS.name.some(k => labelText.includes(k))) {
        fillNameFields(parent, profile.sei, profile.mei);
        return profile.sei + profile.mei;
    }
    
    // 電話・FAX・郵便番号（分割入力対応）
    if (FIELD_KEYWORDS.tel.some(k => labelText.includes(k))) {
        if (telParts[0] && telParts[1] && telParts[2]) {
            fillPhoneFields(parent, telParts[0], telParts[1], telParts[2]);
            return telParts.join('');
        }
        return profile.tel ? profile.tel.replace(/-/g, '') : '';
    }
    if (FIELD_KEYWORDS.fax.some(k => labelText.includes(k))) {
        if (faxParts[0] && faxParts[1] && faxParts[2]) {
            fillPhoneFields(parent, faxParts[0], faxParts[1], faxParts[2]);
            return faxParts.join('');
        }
        return profile.fax ? profile.fax.replace(/-/g, '') : '';
    }
    if (FIELD_KEYWORDS.zip.some(k => labelText.includes(k))) {
        if (zipParts[0] && zipParts[1]) {
            fillNameFields(parent, zipParts[0], zipParts[1]);
            return zipParts.join('-');
        }
        return profile.zip;
    }
    
    // 住所系フィールド
    if (FIELD_KEYWORDS.pref.some(k => labelText.includes(k))) return profile.address1;
    if (FIELD_KEYWORDS.city.some(k => labelText.includes(k))) return profile.address2;
    if (FIELD_KEYWORDS.address.some(k => labelText.includes(k))) return profile.address3;
    if (FIELD_KEYWORDS.building.some(k => labelText.includes(k))) return profile.address4;
    if (FIELD_KEYWORDS.fullAddress.some(k => labelText.includes(k))) {
        return profile.address1 + profile.address2 + profile.address3 + profile.address4;
    }

    return null;
}

/**
 * 名前フィールドを分割して入力
 * @param {Element} parent - 親要素
 * @param {string} firstName - 名
 * @param {string} lastName - 姓
 */
function fillNameFields(parent, firstName, lastName) {
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const inputs = parent.getElementsByTagName('input');
    const visibleInputs = Array.from(inputs).filter(input => input.type !== 'hidden');

    if (visibleInputs.length === 2) {
        visibleInputs[0].value = firstName;
        visibleInputs[0].dispatchEvent(inputEvent);
        visibleInputs[1].value = lastName;
        visibleInputs[1].dispatchEvent(inputEvent);
    }
}

/**
 * 電話番号フィールドを分割して入力
 * @param {Element} parent - 親要素
 * @param {string} part1 - 第1部
 * @param {string} part2 - 第2部
 * @param {string} part3 - 第3部
 */
function fillPhoneFields(parent, part1, part2, part3) {
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    const inputs = parent.getElementsByTagName('input');
    const visibleInputs = Array.from(inputs).filter(input => input.type !== 'hidden');

    if (visibleInputs.length === 3) {
        visibleInputs[0].value = part1;
        visibleInputs[0].dispatchEvent(inputEvent);
        visibleInputs[1].value = part2;
        visibleInputs[1].dispatchEvent(inputEvent);
        visibleInputs[2].value = part3;
        visibleInputs[2].dispatchEvent(inputEvent);
    }
}

/**
 * 可視テキストエリアの存在チェック
 * @param {Document} doc - チェック対象ドキュメント
 * @returns {boolean} 可視テキストエリアが存在する場合はtrue
 */
function hasVisibleTextareas(doc) {
    return getVisibleTextareas(doc).length > 0;
}

/**
 * 可視テキストエリアを取得
 * @param {Document} doc - 検索対象ドキュメント
 * @returns {Array} 可視テキストエリア配列
 */
function getVisibleTextareas(doc) {
    const textareas = doc.getElementsByTagName('textarea');
    return Array.from(textareas).filter(textarea => textarea.style.display !== 'none');
}

/**
 * 確認ボタンを検索
 * @param {Document} doc - 検索対象ドキュメント
 * @returns {Array} 確認ボタン配列
 */
function findConfirmationButtons(doc) {
    const confirmKeywords = ['送信', '送 信', '送　信', 'はい', 'OK', '同意する', '続行'];
    
    // テキストボタン
    const textButtons = doc.querySelectorAll('span, button');
    const confirmTextButtons = Array.from(textButtons).filter(button =>
        confirmKeywords.some(keyword => button.innerText.includes(keyword))
    );

    // input要素のボタン
    const inputButtons = doc.querySelectorAll('input[type="submit"], input[type="button"]');
    const confirmInputButtons = Array.from(inputButtons).filter(button =>
        button.value && (
            confirmKeywords.some(keyword => button.value.includes(keyword)) ||
            button.value.includes('問い合') || button.value.includes('問合')
        )
    );

    return [...confirmTextButtons, ...confirmInputButtons];
}

// ====================================
// メッセージ送信関数
// ====================================

/**
 * エラーメッセージを送信
 * @param {string} message - エラーメッセージ
 * @param {string} detail - 詳細情報
 */
function sendErrorMessage(message, detail) {
    chrome.runtime.sendMessage({
        action: ACTION_SEND,
        success: false,
        message: message,
        detail: detail
    });
}

/**
 * 成功メッセージを送信
 * @param {string} message - 成功メッセージ
 * @param {string} detail - 詳細情報
 */
function sendSuccessMessage(message, detail) {
    chrome.runtime.sendMessage({
        action: ACTION_SEND,
        success: true,
        message: message,
        detail: detail
    });
}