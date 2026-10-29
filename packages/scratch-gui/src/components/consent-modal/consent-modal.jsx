/* S-LLM modification: public license, source and consent integration; 2026-10-29. */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { setHasGlobalConsented } from '../../reducers/chat-history';
import styles from './consent-modal.css';

const ConsentModal = ({ hasGlobalConsented, onSetHasGlobalConsented }) => {
    const [isChecked, setIsChecked] = useState(false);

    if (hasGlobalConsented) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="sllm-consent-title">
                <div className={styles.headerTitle} id="sllm-consent-title">利用規約の確認</div>
                <div className={styles.bodyText} style={{ width: '100%' }}>
                    <p style={{ textAlign: 'left', marginBottom: '15px' }}>
                        当サービスはOpenAIのAPIを使用しています。ご利用にあたり、以下の事項への同意が必要です。
                    </p>
                    <ul style={{ textAlign: 'left', marginBottom: '20px', paddingLeft: '20px', lineHeight: '1.6' }}>
                        <li>13歳未満の方は本サービスをご利用いただけません。</li>
                        <li>13歳以上18歳未満の方は、保護者の同意が必要です。</li>
                        <li>18歳以上の方は、ご自身で内容を確認し同意してください。</li>
                        <li>AIの利用時は、入力・会話・処理に必要な作品情報をOpenAIへ送信します。</li>
                        <li>個人情報は入力しないでください。</li>
                        <li>AIの生成内容は必ずしも正確であるとは限りません。重要な情報は別途確認してください。</li>
                    </ul>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => setIsChecked(e.target.checked)}
                            style={{ marginRight: '8px', width: '18px', height: '18px', flexShrink: 0 }}
                        />
                        利用規約とプライバシー説明を確認し、18歳以上として同意するか、13歳以上18歳未満として保護者の同意を得ています。
                    </label>
                    <p>
                        <a href="terms.html" target="_blank" rel="noopener noreferrer">利用規約</a>
                        {' ・ '}
                        <a href="privacy.html" target="_blank" rel="noopener noreferrer">プライバシー・外部送信</a>
                        {' ・ '}
                        <a href="credits.html" target="_blank" rel="noopener noreferrer">ライセンス</a>
                    </p>
                </div>
                <button
                    className={styles.sendButton}
                    style={{ opacity: isChecked ? 1 : 0.5, cursor: isChecked ? 'pointer' : 'not-allowed' }}
                    disabled={!isChecked}
                    onClick={() => onSetHasGlobalConsented(true)}
                >
                    同意して始める
                </button>
            </div>
        </div>
    );
};

ConsentModal.propTypes = {
    hasGlobalConsented: PropTypes.bool.isRequired,
    onSetHasGlobalConsented: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    hasGlobalConsented: state.scratchGui.chatHistory.hasGlobalConsented
});

const mapDispatchToProps = dispatch => ({
    onSetHasGlobalConsented: hasGlobalConsented => dispatch(setHasGlobalConsented(hasGlobalConsented))
});

export default connect(mapStateToProps, mapDispatchToProps)(ConsentModal);
