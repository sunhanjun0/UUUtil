import React, { useEffect, useRef, useState } from 'react';

export default function Calculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const displayRef = useRef<HTMLDivElement | null>(null);

  async function handleCalc() {
    const expression = expr.trim();
    if (!expression) return;
    const res = await window.assistant.calculate(expression);
    setResult(res);
    setHistory((prev) => [...prev, `${expression} = ${res}`].slice(-10));
    if (res !== 'Error') setExpr(res);
  }

  function handleKey(key: string) {
    if (key === 'C') { setExpr(''); setResult(''); }
    else if (key === 'Backspace') { setExpr((prev) => prev.slice(0, -1)); setResult(''); }
    else if (key === '=') { handleCalc(); }
    else { setExpr((prev) => prev + key); setResult(''); }
  }

  useEffect(() => {
    const display = displayRef.current;
    if (display) display.scrollTop = display.scrollHeight;
  }, [history, expr, result]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return;

      const keyMap: Record<string, string> = {
        Enter: '=',
        Escape: 'C',
        Delete: 'C',
        Backspace: 'Backspace',
        x: '*',
        X: '*',
      };
      const key = keyMap[event.key] || event.key;
      if (!/^[0-9()+\-*/%.=]$/.test(key) && key !== 'C' && key !== 'Backspace') return;

      event.preventDefault();
      handleKey(key);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const keys = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '%', '='];

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">COMPUTE</span>
        <span className="zh">计算器</span>
        <span className="sub">EVAL // 表达式计算</span>
      </div>

      <div
        className="ck-panel brackets"
        ref={displayRef}
        style={{ height: 132, overflowY: 'auto' }}
      >
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 2 }}>
          {history.map((item, index) => (
            <div key={`${item}-${index}`} className="ck-dim" style={{ fontSize: 11 }}>{item}</div>
          ))}
          <div className="ck-phos" style={{ fontSize: 22, fontWeight: 700, wordBreak: 'break-all', textAlign: 'right' }}>
            {expr || '0'}
          </div>
          {result !== '' && (
            <div className={result === 'Error' ? 'ck-err' : 'ck-phos'} style={{ fontSize: 14 }}>
              {result}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {keys.map((key) => {
          const isOp = '+-*/%'.includes(key);
          const isEqual = key === '=';
          const isClear = key === 'C';

          let cls = 'ck-btn';
          if (isClear) cls += ' danger';
          else if (isEqual) cls += ' primary';
          else if (isOp) cls += ' ck-warn';

          return (
            <button
              key={key}
              className={cls}
              style={{ justifyContent: 'center', fontWeight: isOp || isEqual ? 700 : 400 }}
              onClick={() => handleKey(key)}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}