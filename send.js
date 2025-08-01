// ====================================
// Chrome拡張メッセージリスナー
// ====================================

/**
 * background.jsからのメッセージを受信する
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "tags") {
        onExecute(message.tags).then(() => {
            sendResponse({ status: "completed" });
        }).catch(error => {
            sendResponse({ status: "error", error: error.message });
        });
        return true;
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
        // 1秒待機（ページ読み込み完了を待つ）
        await new Promise(resolve => setTimeout(resolve, 1000));

        // ====================================
        // プロフィールデータの取得
        // ====================================
        
        let profileData = await chrome.storage.local.get(['optionPatterns', 'selectedPattern']);
        let profiles = profileData.optionPatterns;
        let selectedPatternId = profileData.selectedPattern;
        let profile = profiles.find(function(p) {
            return p.id === selectedPatternId;
        });

        // ====================================
        // ブラウザ機能の無効化
        // ====================================
        
        // 確認ダイアログとアラートを無効化
        window.confirm = function() { return true; };
        window.alert = function() { return true; };
        window.onbeforeunload = null;

        // ====================================
        // タグ置換処理
        // ====================================
        
        // メッセージ内のパラメータを置換
        for (let i = 0; i < 5; i++) {
            if (profile.message.includes(`[param${i + 1}]`)) {
                if (tags.length > i) {
                    profile.message = profile.message.replaceAll(`[param${i + 1}]`, tags[i]);
                } else {
                    profile.message = profile.message.replaceAll(`[param${i + 1}]`, "");
                }
            }
        }

        // ====================================
        // ドキュメント探索（iframe対応）
        // ====================================
        
        let currentDocument = document;
        let textareas = document.getElementsByTagName('textarea');

        // メインドキュメントにtextareaがない場合はiframe内を探索
        if (textareas.length === 0) {
            let iframes = document.getElementsByTagName('iframe');
            
            for (let i = 0; i < iframes.length; i++) {
                let iframe = iframes[i];
                try {
                    let iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                    let iframeTextareas = iframeDocument.getElementsByTagName('textarea');
                    
                    if (iframeTextareas.length > 0) {
                        currentDocument = iframeDocument;
                        break;
                    }
                } catch (iframeError) {
                    chrome.runtime.sendMessage({
                        action: "send",
                        success: false,
                        message: "iframe内にフォームがあるため自動入力できません",
                        detail: iframeError.message
                    });
                    return;
                }
            }
        }

        // ====================================
        // 営業お断り文言の検出
        // ====================================
        
        let textElements = document.querySelectorAll('p, li, u, label, span');
        let refusalElements = Array.from(textElements).filter(element =>
            element.innerText.includes('遠慮') ||
            element.innerText.includes('断り') ||
            element.innerText.includes('禁止') ||
            element.innerText.includes('控え') ||
            element.innerText.includes('営業権')
        );

        if (refusalElements.length > 0) {
            let salesRefusalElements = Array.from(refusalElements).filter(element =>
                element.innerText.includes('営業') ||
                element.innerText.includes('宣伝') ||
                element.innerText.includes('セールス') ||
                element.innerText.includes('売り込み')
            );

            if (salesRefusalElements.length > 0) {
                chrome.runtime.sendMessage({
                    action: "send",
                    success: false,
                    message: "営業お断りを検出",
                    detail: ""
                });
                return;
            }
        }

        // ====================================
        // セレクトボックスの処理
        // ====================================
        
        let selects = currentDocument.getElementsByTagName('select');
        for (let i = 0; i < selects.length; i++) {
            let select = selects[i];
            select.selectedIndex = select.options.length - 1;

            // 都道府県が一致する場合は選択
            for (let j = 0; j < select.options.length; j++) {
                if (select.options[j].text === profile.address1) {
                    select.selectedIndex = j;
                    break;
                }
            }
        }

        // ====================================
        // ラジオボタンの処理
        // ====================================
        
        let radioButtons = currentDocument.querySelectorAll('input[type="radio"]');
        for (let i = 0; i < radioButtons.length; i++) {
            let radio = radioButtons[i];
            radio.click();
        }

        // ====================================
        // チェックボックスの処理
        // ====================================
        
        let checkboxes = currentDocument.querySelectorAll('input[type="checkbox"]');
        let lastCheckbox = null;

        for (let i = 0; i < checkboxes.length; i++) {
            let checkbox = checkboxes[i];

            if (checkbox.checked == false) {
                checkbox.click();
            }

            // 同じ名前のチェックボックスが連続している場合の重複回避
            if (lastCheckbox !== null) {
                let lastCheckboxName = lastCheckbox.name;
                let currentCheckboxName = checkbox.name;

                if (currentCheckboxName && lastCheckboxName === currentCheckboxName && lastCheckbox.checked == true) {
                    lastCheckbox.checked = false;
                }
            }

            lastCheckbox = checkbox;
        }

        // ====================================
        // textareaの処理
        // ====================================
        
        let inputEvent = new Event('input', { bubbles: true, cancelable: true });
        let textareaTags = currentDocument.getElementsByTagName('textarea');

        if (textareaTags.length === 0) {
            chrome.runtime.sendMessage({
                action: "send",
                success: false,
                message: "問い合わせフォームが見つかりませんでした",
                detail: "textareaTags.length === 0"
            });
            return;
        }

        // 全てのtextareaにメッセージを入力
        for (let i = 0; i < textareaTags.length; i++) {
            let textarea = textareaTags[i];
            textarea.value = profile.message;
            textarea.dispatchEvent(inputEvent);
        }

        // ====================================
        // 電話番号・FAX・郵便番号の分割
        // ====================================
        
        let telParts = ['', '', ''];
        let faxParts = ['', '', ''];
        let zipParts = ['', ''];

        if (profile.tel) {
            const telMatch = profile.tel.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (telMatch) {
                telParts = [telMatch[1], telMatch[2], telMatch[3]];
            }
        }

        if (profile.fax) {
            const faxMatch = profile.fax.match(/(\d{2,4})-?(\d{3,4})-?(\d{4})/);
            if (faxMatch) {
                faxParts = [faxMatch[1], faxMatch[2], faxMatch[3]];
            }
        }

        if (profile.zip) {
            const zipMatch = profile.zip.match(/(\d{3})-?(\d{4})/);
            if (zipMatch) {
                zipParts = [zipMatch[1], zipMatch[2]];
            }
        }

        // ====================================
        // 入力フィールドの自動入力処理
        // ====================================
        
        let inputFields = currentDocument.getElementsByTagName('input');

        for (let i = 0; i < inputFields.length; i++) {
            let input = inputFields[i];
            let field = input;

            // スキップするフィールドタイプ
            if (field.type === 'file' || field.type === 'hidden' || field.type === 'submit' || 
                field.type === 'button' || field.type === 'radio' || field.type === 'checkbox') {
                continue;
            }

            // 親要素を遡ってラベルテキストを取得
            for (let j = 0; j < 10; j++) {
                let parent = field.parentElement;
                if (parent.tagName === 'DD') {
                    parent = parent.previousElementSibling;
                }

                let labelText = parent ? parent.innerText : "";

                // キーワード識別配列
                let identifyingKeywords = ['社名', '企業名', 'メール', 'TEL', '電話', '都道府県', '担当者', '名前', '氏名'];
                let keywordMatches = identifyingKeywords.filter(keyword => labelText.includes(keyword)).length >= 3;

                if (keywordMatches) {
                    break;
                }

                if (labelText.length > 100) {
                    input.value = "―";
                    break;
                }

                // 各種キーワード配列の定義
                let companyKeywords = ['社名', '企業名', '法人名', '個人', '組織', '所属', '団体', '勤務先', 'company', 'Company', 'COMPANY', 'corporate', 'Corporate'];
                let departmentKeywords = ['部署', '部門'];
                let industryKeywords = ['業種'];
                let positionKeywords = ['役職'];
                let subjectKeywords = ['件名', 'タイトル', '題名', 'Subject', 'subject'];
                let memberKeywords = ['従業員数', '社員数'];
                let seiKeywords = ['姓', '苗字'];
                let seiKanaKeywords = ['セイ'];
                let meiKanaKeywords = ['メイ'];
                let seiHiraKeywords = ['せい'];
                let meiHiraKeywords = ['めい'];
                let nameKeywords = ['名前', '氏名', '担当者', 'なまえ', 'Name', 'name'];
                let furiganaKeywords = ['フリガナ'];
                let hiraganaKeywords = ['ふりがな'];
                let emailKeywords = ['メール', 'MAIL', 'Mail', 'mail', '確認', '@'];
                let telKeywords = ['TEL', 'Tel', 'tel', '電話', '携帯', '直通', '連絡先'];
                let faxKeywords = ['FAX', 'Fax', 'fax', 'ファックス'];
                let zipKeywords = ['郵便', '〒'];
                let prefKeywords = ['都道府県'];
                let cityKeywords = ['市区町村'];
                let addressKeywords = ['番地'];
                let buildingKeywords = ['ビル', '建物'];
                let fullAddressKeywords = ['住所', '所在', 'ところ', 'ADDRESS', 'Address', 'address'];
                let urlKeywords = ['URL', 'WEB', 'Web', 'web', 'ホームページ', 'ウェブサイト', 'http', 'リンク'];

                /**
                 * 名前フィールドを分割して入力する
                 * @param {Element} parent - 親要素
                 * @param {string} firstName - 名
                 * @param {string} lastName - 姓
                 */
                function fillNameFields(parent, firstName, lastName) {
                    let inputEvent = new Event('input', { bubbles: true, cancelable: true });
                    let inputs = parent.getElementsByTagName('input');
                    let visibleInputs = Array.from(inputs).filter(input => input.type !== 'hidden');

                    if (visibleInputs.length == 2) {
                        let firstInput = visibleInputs[0];
                        firstInput.value = firstName;
                        firstInput.dispatchEvent(inputEvent);

                        let secondInput = visibleInputs[1];
                        secondInput.value = lastName;
                        secondInput.dispatchEvent(inputEvent);
                    }
                }

                /**
                 * 電話番号フィールドを分割して入力する
                 * @param {Element} parent - 親要素
                 * @param {string} part1 - 第1部
                 * @param {string} part2 - 第2部
                 * @param {string} part3 - 第3部
                 */
                function fillPhoneFields(parent, part1, part2, part3) {
                    let inputEvent = new Event('input', { bubbles: true, cancelable: true });
                    let inputs = parent.getElementsByTagName('input');
                    let visibleInputs = Array.from(inputs).filter(input => input.type !== 'hidden');

                    if (visibleInputs.length == 3) {
                        let input1 = visibleInputs[0];
                        input1.value = part1;
                        input1.dispatchEvent(inputEvent);

                        let input2 = visibleInputs[1];
                        input2.value = part2;
                        input2.dispatchEvent(inputEvent);

                        let input3 = visibleInputs[2];
                        input3.value = part3;
                        input3.dispatchEvent(inputEvent);
                    }
                }

                // キーワードマッチングによる自動入力
                if (emailKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.email;
                    input.dispatchEvent(inputEvent);
                } else if (urlKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.url;
                    input.dispatchEvent(inputEvent);
                } else if (companyKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.company;
                    input.dispatchEvent(inputEvent);
                } else if (departmentKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.department;
                    input.dispatchEvent(inputEvent);
                } else if (industryKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.industry;
                    input.dispatchEvent(inputEvent);
                } else if (positionKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.position;
                    input.dispatchEvent(inputEvent);
                } else if (subjectKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.subject;
                    input.dispatchEvent(inputEvent);
                } else if (memberKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.member;
                    input.dispatchEvent(inputEvent);
                } else if (seiKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.sei;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.sei, profile.mei);
                } else if (seiKanaKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.seiKana;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.seiKana, profile.meiKana);
                } else if (meiKanaKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.meiKana;
                    input.dispatchEvent(inputEvent);
                } else if (seiHiraKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.seiHira;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.seiHira, profile.meiHira);
                } else if (meiHiraKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.meiHira;
                    input.dispatchEvent(inputEvent);
                } else if (furiganaKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.seiKana + profile.meiKana;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.seiKana, profile.meiKana);
                } else if (hiraganaKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.seiHira + profile.meiHira;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.seiHira, profile.meiHira);
                } else if (nameKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.sei + profile.mei;
                    input.dispatchEvent(inputEvent);
                    fillNameFields(parent, profile.sei, profile.mei);
                } else if (telKeywords.some(keyword => labelText.includes(keyword))) {
                    if (telParts[0] && telParts[1] && telParts[2]) {
                        input.value = telParts.join('');
                        input.dispatchEvent(inputEvent);
                        fillPhoneFields(parent, telParts[0], telParts[1], telParts[2]);
                    } else if (profile.tel) {
                        input.value = profile.tel.replace(/-/g, '');
                        input.dispatchEvent(inputEvent);
                    }
                } else if (faxKeywords.some(keyword => labelText.includes(keyword))) {
                    if (faxParts[0] && faxParts[1] && faxParts[2]) {
                        input.value = faxParts.join('');
                        input.dispatchEvent(inputEvent);
                        fillPhoneFields(parent, faxParts[0], faxParts[1], faxParts[2]);
                    } else if (profile.fax) {
                        input.value = profile.fax.replace(/-/g, '');
                        input.dispatchEvent(inputEvent);
                    }
                } else if (zipKeywords.some(keyword => labelText.includes(keyword))) {
                    if (zipParts[0] && zipParts[1]) {
                        input.value = zipParts.join('-');
                        input.dispatchEvent(inputEvent);
                        fillNameFields(parent, zipParts[0], zipParts[1]);
                    } else if (profile.zip) {
                        input.value = profile.zip;
                        input.dispatchEvent(inputEvent);
                    }
                } else if (prefKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.address1;
                    input.dispatchEvent(inputEvent);
                } else if (cityKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.address2;
                    input.dispatchEvent(inputEvent);
                } else if (addressKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.address3;
                    input.dispatchEvent(inputEvent);
                } else if (buildingKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.address4;
                    input.dispatchEvent(inputEvent);
                } else if (fullAddressKeywords.some(keyword => labelText.includes(keyword))) {
                    input.value = profile.address1 + profile.address2 + profile.address3 + profile.address4;
                    input.dispatchEvent(inputEvent);
                }

                if (input.value !== '') {
                    break;
                }

                field = parent;
            }

            // 値が設定されていない場合はダッシュを入力
            if (input.value === '') {
                input.value = "―";
                input.dispatchEvent(inputEvent);
            }
        }

        // ====================================
        // メールフィールドの特別処理
        // ====================================
        
        let emailFields = currentDocument.querySelectorAll('input[type="email"], input[type="mail"]');
        for (let i = 0; i < emailFields.length; i++) {
            let emailField = emailFields[i];
            emailField.value = profile.email;
            emailField.dispatchEvent(inputEvent);
        }

        // 1秒待機
        await new Promise(resolve => setTimeout(resolve, 1000));

        // ====================================
        // 送信ボタンの検索
        // ====================================
        
        // テキストベースのボタン
        let textButtons = document.querySelectorAll('span, button');
        let textSubmitButtons = Array.from(textButtons).filter(button =>
            button.innerText.includes('送信') || button.innerText.includes('送 信') || button.innerText.includes('送　信') ||
            button.innerText.includes('確認') || button.innerText.includes('確 認') || button.innerText.includes('確　認') ||
            button.innerText.includes('Send') || button.innerText.includes('SEND') ||
            button.innerText.includes('Submit') || button.innerText.includes('SUBMIT') ||
            button.innerText.includes('次へ') || button.innerText.includes('次に進む') ||
            button.innerText.includes('はい') || button.innerText.includes('OK') ||
            button.innerText.includes('同意する') || button.innerText.includes('続行')
        );

        // input要素のボタン
        let inputButtons = currentDocument.querySelectorAll('input[type="submit"], input[type="button"]');
        let inputSubmitButtons = Array.from(inputButtons).filter(button =>
            button.value && (
                button.value.includes('送信') || button.value.includes('送 信') || button.value.includes('送　信') ||
                button.value.includes('確認') || button.value.includes('確 認') || button.value.includes('確　認') ||
                button.value.includes('Send') || button.value.includes('SEND') ||
                button.value.includes('Submit') || button.value.includes('SUBMIT') ||
                button.value.includes('問い合') || button.value.includes('問合') ||
                button.value.includes('次へ') || button.value.includes('次に進む') ||
                button.value.includes('はい') || button.value.includes('OK') ||
                button.value.includes('同意する') || button.value.includes('続行')
            )
        );

        // 画像ボタン
        let imageButtons = currentDocument.querySelectorAll('input[type="image"]');
        let imageSubmitButtons = Array.from(imageButtons).filter(button =>
            button.alt && (
                button.alt.includes('送信') || button.alt.includes('確認') ||
                button.alt.includes('Send') || button.alt.includes('SEND') ||
                button.alt.includes('Submit') || button.alt.includes('SUBMIT') ||
                button.alt.includes('問い合') || button.alt.includes('問合') ||
                button.alt.includes('次へ') || button.alt.includes('次に進む') ||
                button.alt.includes('はい') || button.alt.includes('OK') ||
                button.alt.includes('同意する') || button.alt.includes('続行')
            )
        );

        // 全送信ボタンを統合
        let allSubmitButtons = [].concat(
            Array.from(textSubmitButtons),
            Array.from(imageSubmitButtons),
            Array.from(inputSubmitButtons)
        );

        if (allSubmitButtons.length === 0) {
            chrome.runtime.sendMessage({
                action: "send",
                success: false,
                message: "対応できない問い合わせフォームです",
                detail: "submitButtons.length === 0"
            });
            return;
        }

        let submitButton = allSubmitButtons[allSubmitButtons.length - 1];

        // ====================================
        // reCAPTCHA検出
        // ====================================
        
        /**
         * reCAPTCHAを検出する
         * @param {Document} doc - 検索対象のドキュメント
         * @returns {Object} reCAPTCHA検出結果
         */
        function detectRecaptcha(doc) {
            const hasRecaptchaElement = doc.querySelector('.g-recaptcha') !== null ||
                                       doc.querySelector('iframe[src*="google.com/recaptcha"]') !== null;
            const hasRecaptchaScript = doc.querySelector('script[src*="recaptcha/api.js"]') !== null ||
                                      typeof grecaptcha !== 'undefined';
            const hasEnterpriseScript = doc.querySelector('script[src*="enterprise.js"]') !== null;

            return {
                v2: hasRecaptchaElement,
                v3: hasRecaptchaScript,
                enterprise: hasEnterpriseScript,
                exists: hasRecaptchaElement || hasRecaptchaScript || hasEnterpriseScript
            };
        }

        const recaptchaInfo = detectRecaptcha(currentDocument);
        const hasRecaptcha = recaptchaInfo.exists;

        // ====================================
        // 送信処理（reCAPTCHA対応）
        // ====================================
        
        if (hasRecaptcha) {
            // reCAPTCHAがある場合の処理
            chrome.runtime.sendMessage({ action: "keepalive" });
            await new Promise(resolve => setTimeout(resolve, 20000));
            chrome.runtime.sendMessage({ action: "keepalive" });

            for (let attempt = 0; attempt < 2; attempt++) {
                if (submitButton) {
                    submitButton.click();
                }

                chrome.runtime.sendMessage({ action: "keepalive" });
                await new Promise(resolve => setTimeout(resolve, 15000));
                chrome.runtime.sendMessage({ action: "keepalive" });

                // textareaが消えたかチェック
                let checkTextareas = currentDocument.getElementsByTagName('textarea');
                if (checkTextareas.length === 0) {
                    break;
                }

                let visibleTextareas = [];
                for (let i = 0; i < checkTextareas.length; i++) {
                    let textarea = checkTextareas[i];
                    if (textarea.style.display !== 'none') {
                        visibleTextareas.push(textarea);
                    }
                }

                let lastTextarea = visibleTextareas[visibleTextareas.length - 1];
                if (!lastTextarea || lastTextarea.value === '') {
                    break;
                }
            }
        } else {
            // reCAPTCHAがない場合の処理
            if (submitButton) {
                submitButton.click();
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // ====================================
        // 確認画面の処理
        // ====================================
        
        let checkTextareas = currentDocument.getElementsByTagName('textarea');
        let visibleTextareas = [];

        for (let i = 0; i < checkTextareas.length; i++) {
            let textarea = checkTextareas[i];
            if (textarea.style.display !== 'none') {
                visibleTextareas.push(textarea);
            }
        }

        if (visibleTextareas.length === 0) {
            // 確認ページの場合の最終送信ボタン処理
            let confirmTextButtons = document.querySelectorAll('span, button');
            let confirmTextSubmitButtons = Array.from(confirmTextButtons).filter(button =>
                button.innerText.includes('送信') || button.innerText.includes('送 信') || button.innerText.includes('送　信') ||
                button.innerText.includes('はい') || button.innerText.includes('OK') ||
                button.innerText.includes('同意する') || button.innerText.includes('続行')
            );

            let confirmInputButtons = document.querySelectorAll('input[type="submit"], input[type="button"]');
            let confirmInputSubmitButtons = Array.from(confirmInputButtons).filter(button =>
                button.value && (
                    button.value.includes('送信') || button.value.includes('送 信') || button.value.includes('送　信') ||
                    button.value.includes('問い合') || button.value.includes('問合') ||
                    button.value.includes('はい') || button.value.includes('OK') ||
                    button.value.includes('同意する') || button.value.includes('続行')
                )
            );

            let confirmButtons = [].concat(
                Array.from(confirmTextSubmitButtons),
                Array.from(confirmInputSubmitButtons)
            );

            if (confirmButtons.length === 0) {
                chrome.runtime.sendMessage({
                    action: "send",
                    success: true,
                    message: "",
                    detail: "buttons.length === 0"
                });
                return;
            }

            confirmButtons[confirmButtons.length - 1].click();
            await new Promise(resolve => setTimeout(resolve, 5000));

            chrome.runtime.sendMessage({
                action: "send",
                success: true,
                message: "",
                detail: "buttons[buttons.length - 1].click();"
            });
            return;
        } else {
            // textareaがまだ表示されている場合の処理
            let lastTextarea = visibleTextareas[visibleTextareas.length - 1];

            if (lastTextarea && lastTextarea.value == '') {
                chrome.runtime.sendMessage({
                    action: "send",
                    success: true,
                    message: "",
                    detail: "textareaTagAfter.value == ''"
                });
                return;
            }

            chrome.runtime.sendMessage({
                action: "send",
                success: false,
                message: "対応できない問い合わせフォームです",
                detail: "textareaTagAfter.value !== ''"
            });
            return;
        }

    } catch (error) {
        chrome.runtime.sendMessage({
            action: "send",
            success: false,
            message: "Webサイト解析不可",
            detail: error.message
        });
    }
}