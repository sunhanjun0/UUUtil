import React from 'react';
import { Box } from '@chakra-ui/react';
import ClipboardHistory from '../components/ClipboardHistory';

export default function ClipboardHistoryPage() {
  return (
    <Box w="100%" h="100%" bg="white" borderRadius="sm" overflow="hidden">
      <ClipboardHistory />
    </Box>
  );
}
