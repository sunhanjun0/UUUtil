import React, { useEffect, useState } from 'react';
import { Box, Flex, Input, Button, Text, Heading, Code, Badge, Stack } from '@chakra-ui/react';

interface PluginInfo {
  id: string;
  name: string;
  description?: string;
  version: string;
}

export default function HomePage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [greeting, setGreeting] = useState('');
  const [name, setName] = useState('');

  useEffect(() => { loadPlugins(); }, []);

  async function loadPlugins() {
    try {
      const list = await window.assistant.listPlugins();
      setPlugins(list);
    } catch { /* ignore */ }
  }

  async function handleGreet() {
    if (!name.trim()) return;
    await window.assistant.greet(name);
    setGreeting(`你好，${name}！消息已通过事件总线发送`);
    setName('');
  }

  return (
    <Box w="100%">
      <Box bg="white" borderRadius="md" p={4} mb={1.5}>
        <Heading size="xs" mb={1.5}>已加载插件</Heading>
        {plugins.length === 0 ? (
          <Text fontSize="sm" color="gray.400">暂无插件</Text>
        ) : (
          <Stack gap={2}>
            {plugins.map((p) => (
              <Box key={p.id} bg="gray.50" borderRadius="md" p={2} fontSize="sm">
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontWeight="semibold">{p.name}</Text>
                  <Badge fontSize="xs" colorScheme="gray" variant="subtle">v{p.version}</Badge>
                </Flex>
                <Code fontSize="xs" colorScheme="gray">{p.id}</Code>
                {p.description && <Text fontSize="xs" color="gray.500" mt={1}>{p.description}</Text>}
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <Box bg="white" borderRadius="md" p={4}>
        <Heading size="xs" mb={1.5}>事件通信测试</Heading>
        <Flex gap={2}>
          <Input
            flex={1}
            size="sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入名字"
            onKeyDown={(e) => e.key === 'Enter' && handleGreet()}
          />
          <Button size="sm" colorScheme="blue" onClick={handleGreet}>问候</Button>
        </Flex>
        {greeting && (
          <Box mt={2} p={2} bg="blue.50" borderRadius="md" fontSize="sm">{greeting}</Box>
        )}
      </Box>
    </Box>
  );
}
