import React from 'react';
import { Box } from '@chakra-ui/react';
import ReminderCenter from '../components/ReminderCenter';

export default function ReminderCenterPage() {
  return (
    <Box w="100%" h="100%" bg="white" borderRadius="sm" overflow="hidden">
      <ReminderCenter />
    </Box>
  );
}
