import React from 'react';
import { Box } from '@chakra-ui/react';
import Focus from '../components/Focus';

export default function FocusPage() {
  return (
    <Box w="100%" h="100%" bg="white" borderRadius="sm" overflow="hidden">
      <Focus />
    </Box>
  );
}
