import React, { useState } from 'react';
import { Box, Button, SimpleGrid } from '@chakra-ui/react';

export default function Calculator() {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');

  async function handleCalc() {
    if (!expr.trim()) return;
    const res = await window.assistant.calculate(expr);
    setResult(res);
  }

  function handleKey(key: string) {
    if (key === 'C') { setExpr(''); setResult(''); }
    else if (key === '=') { handleCalc(); }
    else { setExpr((prev) => prev + key); }
  }

  const keys = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '%', '='];

  return (
    <Box>
      <Box
        bg="gray.100"
        borderRadius="md"
        px={3} py={2}
        mb={1.5}
        minH={14}
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="flex-end"
      >
        <Box fontSize="lg" color="gray.700" wordBreak="break-all">{expr || '0'}</Box>
        <Box fontSize="sm" color="blue.600" fontWeight="semibold" mt={1}>{result}</Box>
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
