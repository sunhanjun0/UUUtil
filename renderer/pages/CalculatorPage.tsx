import React from 'react';
import { Box } from '@chakra-ui/react';
import Calculator from '../components/Calculator';

export default function CalculatorPage() {
  return (
    <Box w="100%">
      <Box bg="white" borderRadius="sm" p={4}>
        <Calculator />
      </Box>
    </Box>
  );
}
