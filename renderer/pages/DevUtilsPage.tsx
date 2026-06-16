import React from 'react';
import { Box } from '@chakra-ui/react';
import DevUtils from '../components/DevUtils';

export default function DevUtilsPage() {
  return (
    <Box w="100%">
      <Box bg="white" borderRadius="md" p={4}>
        <DevUtils />
      </Box>
    </Box>
  );
}
