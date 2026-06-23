import React, { useState, useEffect } from 'react';
import {
  Box, Button, Flex, Input, Select, Checkbox, Heading, Text, Badge, Stack,
} from '@chakra-ui/react';
import { StickyNote } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

interface Note {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

interface Tag {
  id: string;
  name: string;
}

export default function KnowledgeBase() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [notesData, categoriesData, tagsData] = await Promise.all([
        window.assistant.getNotes(),
        window.assistant.getCategories(),
        window.assistant.getTags(),
      ]);
      setNotes(notesData);
      setCategories(categoriesData);
      setTags(tagsData);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  }

  async function handleSaveNote() {
    if (!editTitle.trim()) return;
    try {
      const result = selectedNote
        ? await window.assistant.updateNote(selectedNote.id, editTitle, editContent, editCategoryId, editTagIds)
        : await window.assistant.createNote(editTitle, editContent, editCategoryId || categories[0]?.id || '', editTagIds);

      if (result.success) {
        await loadData();
        setMode('list');
        setSelectedNote(null);
        resetEdit();
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  }

  async function handleDeleteNote() {
    if (!selectedNote || !window.confirm('确定删除此笔记？')) return;
    try {
      await window.assistant.deleteNote(selectedNote.id);
      await loadData();
      setMode('list');
      setSelectedNote(null);
    } catch (err) {
      console.error('删除失败:', err);
    }
  }

  async function handleSearch() {
    if (!searchKeyword.trim()) {
      await loadData();
      return;
    }
    try {
      const result = await window.assistant.searchNotes(searchKeyword);
      setNotes(result.notes);
    } catch (err) {
      console.error('搜索失败:', err);
    }
  }

  function resetEdit() {
    setEditTitle('');
    setEditContent('');
    setEditCategoryId('');
    setEditTagIds([]);
  }

  function startEditNote(note: Note) {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditCategoryId(note.categoryId);
    setEditTagIds(note.tagIds);
    setMode('edit');
  }

  function startNewNote() {
    setSelectedNote(null);
    resetEdit();
    setEditCategoryId(categories[0]?.id || '');
    setMode('edit');
  }

  if (mode === 'edit') {
    return (
      <Flex direction="column" h="full" bg="white">
        <Box px={6} py={4}>
          <Stack gap={3}>
            <Flex gap={3} align="flex-start" wrap="wrap">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="笔记标题"
                variant="flushed"
                fontSize="xl"
                fontWeight="semibold"
                flex={1}
                minW="200px"
                autoFocus
              />
              <Flex gap={3} align="center" wrap="wrap">
                <Select size="sm" value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)} w="auto">
                  <option value="">选择分类...</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </Select>
                <Flex gap={2} wrap="wrap">
                  {tags.map((tag) => (
                    <Checkbox
                      key={tag.id}
                      size="sm"
                      isChecked={editTagIds.includes(tag.id)}
                      onChange={(e) => setEditTagIds(e.target.checked ? [...editTagIds, tag.id] : editTagIds.filter((id) => id !== tag.id))}
                    >
                      {tag.name}
                    </Checkbox>
                  ))}
                </Flex>
              </Flex>
            </Flex>
            <Flex gap={2} justify="flex-end">
              <Button size="sm" colorScheme="green" onClick={handleSaveNote}>保存</Button>
              {selectedNote && <Button size="sm" colorScheme="red" onClick={handleDeleteNote}>删除</Button>}
              <Button size="sm" variant="outline" onClick={() => { setMode('list'); resetEdit(); }}>返回</Button>
            </Flex>
          </Stack>
        </Box>

        <Box flex={1} overflow="auto">
          <MDEditor
            value={editContent}
            onChange={(val) => setEditContent(val || '')}
            preview="live"
            height={500}
            visibleDragbar={false}
          />
        </Box>
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full">
      <Flex justify="space-between" align="center" px={6} py={4} bg="white">
        <Heading size="md">知识库</Heading>
        <Button size="sm" colorScheme="blue" onClick={startNewNote}>新建笔记</Button>
      </Flex>

      <Box px={6} py={3} bg="white">
        <Input
          placeholder="搜索笔记..."
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          size="sm"
          maxW="400px"
        />
      </Box>

      <Box flex={1} overflow="auto" p={6}>
        {notes.length === 0 ? (
          <Flex direction="column" align="center" justify="center" py={20}>
            <Box color="gray.300" mb={2}>
              <StickyNote size={56} strokeWidth={1.6} />
            </Box>
            <Heading size="md" mb={1}>暂无笔记</Heading>
            <Text fontSize="sm" color="gray.400">点击上方"新建笔记"开始记录你的想法</Text>
          </Flex>
        ) : (
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))"
            gap={3}
          >
            {notes.map((note) => (
              <Box
                key={note.id}
                p={3}
                borderRadius="md"
                bg="gray.50"
                cursor="pointer"
                onClick={() => startEditNote(note)}
              >
                <Flex justify="space-between" align="flex-start" mb={1} gap={2}>
                  <Heading size="xs" flex={1}>{note.title}</Heading>
                  <Text fontSize="xs" color="gray.400" whiteSpace="nowrap">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </Text>
                </Flex>
                {note.content && (
                  <Text fontSize="xs" color="gray.500" noOfLines={2} mb={1}>{note.content}</Text>
                )}
                {note.tagIds.length > 0 && (
                  <Flex gap={1} wrap="wrap">
                    {note.tagIds.map((tagId) => {
                      const tag = tags.find((t) => t.id === tagId);
                      return tag && <Badge key={tagId} colorScheme="blue" variant="subtle" fontSize="xs">{tag.name}</Badge>;
                    })}
                  </Flex>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Flex>
  );
}
