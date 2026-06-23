import React from 'react';
import { Box } from '@chakra-ui/react';
import KnowledgeBase from '../components/KnowledgeBase';

export default function KnowledgeBasePage() {
  return (
    <Box w="100%" bg="white" borderRadius="sm" overflow="hidden">
      <KnowledgeBase />
    </Box>
  );
}
