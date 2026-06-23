import React, { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  useClipboard,
  useToast,
} from '@chakra-ui/react';
import type { AiMessage } from '../../src/shared/types';

const languageOptions = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
];

const toneOptions = [
  { value: 'neutral', label: '中性' },
  { value: 'formal', label: '正式' },
  { value: 'friendly', label: '自然' },
  { value: 'concise', label: '简洁' },
];

export default function TranslationPage() {
  const toast = useToast();
  const [sourceText, setSourceText] = useState('Hello, this is a translation test.');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [tone, setTone] = useState('neutral');
  const [preserveFormatting, setPreserveFormatting] = useState(true);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);

  const { onCopy } = useClipboard(translatedText);

  const targetLanguageLabel = useMemo(
    () => languageOptions.find((option) => option.value === targetLanguage)?.label || targetLanguage,
    [targetLanguage]
  );

  async function handleTranslate() {
    if (!sourceText.trim()) {
      toast({ title: '请先输入要翻译的内容', status: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const messages: AiMessage[] = [
        {
          role: 'system',
          content: [
            '你是一个专业翻译助手。',
            `请将内容翻译为 ${targetLanguageLabel}。`,
            `语气要求：${tone === 'neutral' ? '中性' : tone === 'formal' ? '正式' : tone === 'friendly' ? '自然' : '简洁'}。`,
            preserveFormatting ? '请尽量保留原有段落、列表和换行格式。' : '无需保留格式，输出自然流畅的译文。',
            '只输出翻译结果，不要附带解释。',
          ].join('\n'),
        },
        { role: 'user', content: sourceText },
      ];

      const result = await window.assistant.ai.chat({ messages });
      if (!result.success) {
        throw new Error(result.error || '翻译失败');
      }

      setTranslatedText(result.content || '');
      toast({ title: '翻译完成', status: 'success' });
    } catch (err) {
      toast({ title: String(err), status: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!translatedText.trim()) return;
    onCopy();
    toast({ title: '已复制翻译结果', status: 'success' });
  }

  return (
    <Box w="100%">
      <Box bg="white" borderRadius="sm" p={4} mb={1.5}>
        <Flex justify="space-between" align="center" mb={2}>
          <Box>
            <Heading size="sm">翻译助手</Heading>
            <Text fontSize="xs" color="gray.500" mt={1}>基于 AI 核心配置进行翻译，后续可扩展术语表、批量翻译和双语对照。</Text>
          </Box>
          <Badge colorScheme="blue">AI</Badge>
        </Flex>
      </Box>

      <Flex gap={1.5} wrap="wrap">
        <Box bg="white" borderRadius="sm" p={4} flex="1 1 320px">
          <Stack gap={3}>
            <FormControl>
              <FormLabel fontSize="xs">目标语言</FormLabel>
              <Select size="sm" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs">语气</FormLabel>
              <Select size="sm" value={tone} onChange={(e) => setTone(e.target.value)}>
                {toneOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </FormControl>
            <Flex justify="space-between" align="center">
              <Text fontSize="sm">保留格式</Text>
              <Switch isChecked={preserveFormatting} onChange={(e) => setPreserveFormatting(e.target.checked)} />
            </Flex>
            <Flex justify="space-between" align="center">
              <Text fontSize="sm">显示原文</Text>
              <Switch isChecked={showOriginal} onChange={(e) => setShowOriginal(e.target.checked)} />
            </Flex>
            <FormControl>
              <FormLabel fontSize="xs">源文本</FormLabel>
              <Textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} minH="180px" placeholder="输入要翻译的内容" />
            </FormControl>
            <Button colorScheme="blue" onClick={handleTranslate} isLoading={loading}>开始翻译</Button>
          </Stack>
        </Box>

        <Box bg="white" borderRadius="sm" p={4} flex="1 1 320px">
          <Flex justify="space-between" align="center" mb={3}>
            <Heading size="xs">译文</Heading>
            <Button size="xs" variant="outline" onClick={handleCopy} isDisabled={!translatedText}>复制结果</Button>
          </Flex>

          {showOriginal && (
            <Box mb={3} p={3} borderRadius="md" bg="gray.50">
              <Text fontSize="xs" color="gray.500" mb={1}>原文</Text>
              <Text fontSize="sm" whiteSpace="pre-wrap">{sourceText}</Text>
            </Box>
          )}

          <Box p={3} borderRadius="md" bg="gray.50" minH="220px">
            {translatedText ? (
              <Text fontSize="sm" whiteSpace="pre-wrap">{translatedText}</Text>
            ) : (
              <Text fontSize="sm" color="gray.400">翻译结果会显示在这里。</Text>
            )}
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}
