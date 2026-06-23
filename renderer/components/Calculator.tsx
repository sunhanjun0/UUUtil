import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, SimpleGrid, Text } from '@chakra-ui/react';

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
    <Box>
      <Box
        ref={displayRef}
        bg="gray.100"
        borderRadius="md"
        px={3} py={2}
        mb={1.5}
        h="132px"
        overflowY="auto"
      >
        <Box
          minH="100%"
          display="flex"
          flexDirection="column"
          justifyContent="flex-end"
          alignItems="flex-end"
        >
          {history.map((item, index) => (
            <Text key={`${item}-${index}`} fontSize="xs" color="gray.500" noOfLines={1}>
              {item}
            </Text>
          ))}
          <Box fontSize="lg" color="gray.700" wordBreak="break-all" textAlign="right">{expr || '0'}</Box>
          <Box fontSize="sm" color="blue.600" fontWeight="semibold" mt={1}>{result}</Box>
        </Box>
      </Box>

      <SimpleGrid columns={4} gap={1.5}>
        {keys.map((key) => {
          const isOp = '+-*/%'.includes(key);
          const isEqual = key === '=';
          const isClear = key === 'C';

          return (
            <Button
              key={key}
              size="md"
              onClick={() => handleKey(key)}
              colorScheme={isClear ? 'red' : isEqual ? 'blue' : 'gray'}
              variant={isClear || isEqual ? 'solid' : 'outline'}
              fontWeight={isOp || isEqual ? 'semibold' : 'normal'}
            >
              {key}
            </Button>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
