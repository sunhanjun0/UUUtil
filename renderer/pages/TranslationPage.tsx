import React, { useMemo, useState } from 'react';
import { useClipboard, useToast } from '@chakra-ui/react';
import { ArrowRight, Copy, Languages } from 'lucide-react';
import type { AiMessage } from '../../src/shared/types';

const languageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
];

const toneOptions = [
  { value: 'neutral', label: '中性' },
  { value: 'formal', label: '正式' },
  { value: 'friendly', label: '自然' },
  { value: 'concise', label: '简洁' },
];

export default function TranslationPage() {
  const toast = useToast();
  const [sourceText, setSourceText] = useState('Hello, this is a translation test.');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [tone, setTone] = useState('neutral');
  const [preserveFormatting, setPreserveFormatting] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);

  const { onCopy } = useClipboard(translatedText);

  const targetLanguageLabel = useMemo(
    () => languageOptions.find((option) => option.value === targetLanguage)?.label || targetLanguage,
    [targetLanguage]
  );

  async function handleTranslate() {
    if (!sourceText.trim()) {
      toast({ title: '请先输入要翻译的内容', status: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const messages: AiMessage[] = [
        {
          role: 'system',
          content: [
            '你是一个专业翻译助手。',
            `请将内容翻译为 ${targetLanguageLabel}。`,
            `语气要求：${tone === 'neutral' ? '中性' : tone === 'formal' ? '正式' : tone === 'friendly' ? '自然' : '简洁'}。`,
            preserveFormatting ? '请尽量保留原有段落、列表和换行格式。' : '无需保留格式，输出自然流畅的译文。',
            '只输出翻译结果，不要附带解释。',
          ].join('\n'),
        },
        { role: 'user', content: sourceText },
      ];

      const result = await window.assistant.ai.chat({ messages });
      if (!result.success) {
        throw new Error(result.error || '翻译失败');
      }

      setTranslatedText(result.content || '');
      toast({ title: '翻译完成', status: 'success' });
    } catch (err) {
      toast({ title: String(err), status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!translatedText.trim()) return;
    onCopy();
    toast({ title: '已复制翻译结果', status: 'success' });
  }

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">LINGUIST</span>
        <span className="zh">翻译</span>
        <span className="sub">PARSE // 多语互译</span>
      </div>

      {/* 控制台：目标语言 / 语气 / 开关 */}
      <div className="ck-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="ck-tools">
          <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.2em', flexShrink: 0 }}>LANG</span>
          {languageOptions.map((option) => (
            <button
              key={option.value}
              className={'ck-chip' + (targetLanguage === option.value ? ' on' : '')}
              onClick={() => setTargetLanguage(option.value)}
            >
              {option.label}
            </button>
          ))}
          <div className="ck-spacer" />
          <button
            className={'ck-chip' + (preserveFormatting ? ' on' : '')}
            onClick={() => setPreserveFormatting((v) => !v)}
          >
            FMT 保留格式
          </button>
          <button
            className={'ck-chip' + (showOriginal ? ' on' : '')}
            onClick={() => setShowOriginal((v) => !v)}
          >
            SRC 显示原文
          </button>
        </div>

        <div className="ck-tools">
          <span className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.2em', flexShrink: 0 }}>TONE</span>
          {toneOptions.map((option) => (
            <button
              key={option.value}
              className={'ck-chip' + (tone === option.value ? ' on' : '')}
              onClick={() => setTone(option.value)}
            >
              {option.label}
            </button>
          ))}
          <div className="ck-spacer" />
          <button className="ck-btn primary" onClick={handleTranslate} disabled={loading}>
            <ArrowRight size={12} /> {loading ? '翻译中…' : '开始翻译'}
          </button>
        </div>
      </div>

      {/* 源 / 译 双栏 */}
      <div style={{ display: 'flex', gap: 10, flex: 1, minHeight: 0, flexWrap: 'wrap', overflowY: 'auto' }}>
        <div className="ck-panel" style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 280 }}>
          <div className="ck-hairline" style={{ margin: 0 }}>SOURCE // 源文本</div>
          <div className="ck-input" style={{ alignItems: 'flex-start', padding: '8px 12px', flex: 1 }}>
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="输入要翻译的内容"
              style={{
                flex: 1,
                minWidth: 0,
                alignSelf: 'stretch',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--ink)',
                fontFamily: 'inherit',
                fontSize: 12.5,
                lineHeight: 1.6,
                resize: 'vertical',
                minHeight: 200,
              }}
            />
          </div>
        </div>

        <div className="ck-panel" style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="ck-hairline" style={{ margin: 0, flex: 1 }}>TARGET // 译文</div>
            <button className="ck-btn" onClick={handleCopy} disabled={!translatedText}>
              <Copy size={12} /> 复制结果
            </button>
          </div>

          {showOriginal && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 3, padding: '8px 10px' }}>
              <div className="ck-dim" style={{ fontSize: 10, letterSpacing: '0.2em', marginBottom: 4 }}>SRC // 原文</div>
              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)', fontSize: 12.5 }}>{sourceText}</div>
            </div>
          )}

          <div style={{
            flex: 1,
            minHeight: 200,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 12.5,
            color: translatedText ? 'var(--ink)' : 'var(--ink-3)',
          }}>
            {translatedText || (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Languages size={14} color="var(--uu-icon-muted)" />
                翻译结果会显示在这里。
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
