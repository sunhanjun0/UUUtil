import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Button, Flex, Input, Select, Heading, Text, Badge, Stack,
  Divider, IconButton, Tag, TagCloseButton, Menu, MenuButton,
  MenuList, MenuItem, Checkbox, HStack, Avatar,
} from '@chakra-ui/react';
import { StickyNote, Plus, Trash2, Search, FilterX, Tag as TagIcon, Folder } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import type { KnowledgeNote, KnowledgeCategory, KnowledgeTag } from '@shared/types';

// 颜色选项用于新建分类
const CATEGORY_COLORS = [
  '#3182CE', '#38A169', '#DD6B20', '#E53E3E', '#805AD5', '#D69E2E', '#ED64A6', '#00B5D8',
  '#2D3748', '#718096', '#4A5568', '#1A202C',
];

// 高亮搜索关键词
function HighlightText({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword || !text) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  const index = lowerText.indexOf(lowerKeyword);

  if (index === -1) {
    return <>{text.length > 100 ? text.slice(0, 100) + '...' : text}</>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + keyword.length);
  const after = text.slice(index + keyword.length);

  return (
    <>
      {before && before.length > 100 ? '...' + before.slice(before.length - 50) : before}
      <mark style={{ backgroundColor: '#fef08a', color: 'inherit', padding: '0 2px', borderRadius: '2px' }}>
        {match}
      </mark>
      {after.length > 50 ? after.slice(0, 50) + '...' : after}
    </>
  );
}

// 格式化相对时间
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes === 0 ? '刚刚' : `${diffMinutes}分钟前`;
    }
    return `${diffHours}小时前`;
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  }
  return date.toLocaleDateString();
}

export default function KnowledgeBase() {
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [selectedNote, setSelectedNote] = useState<KnowledgeNote | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);

  // 编辑状态
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  // 新建分类/标签输入状态
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [newTagName, setNewTagName] = useState('');

  // 快捷键支持
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (viewMode !== 'edit') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveNote();
    }
    if (e.key === 'Escape') {
      if (selectedNote) {
        cancelEdit();
      } else {
        backToList();
      }
    }
  }, [viewMode, editTitle, editContent, editCategoryId, editTagIds, selectedNote]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function loadData() {
    try {
      const [notesData, categoriesData, tagsData] = await Promise.all([
        filterCategoryId || filterTagId
          ? window.assistant.getNotes(filterCategoryId || undefined, filterTagId || undefined)
          : searchKeyword.trim()
            ? window.assistant.searchNotes(searchKeyword)
            : window.assistant.getNotes(),
        window.assistant.getCategories(),
        window.assistant.getTags(),
      ]);
      setNotes(Array.isArray(notesData) ? notesData : notesData.notes || []);
      setCategories(categoriesData);
      setTags(tagsData);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  }

  async function handleSaveNote() {
    if (!editTitle.trim()) {
      window.assistant.log('warn', 'knowledge-base', '标题不能为空');
      return;
    }
    try {
      const result = selectedNote
        ? await window.assistant.updateNote(selectedNote.id, editTitle, editContent, editCategoryId, editTagIds)
        : await window.assistant.createNote(editTitle, editContent, editCategoryId || (categories[0]?.id || ''), editTagIds);

      if (result.success) {
        await loadData();
        setViewMode('list');
        setSelectedNote(null);
        resetEdit();
      } else {
        console.error('保存失败:', result.error);
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
      setViewMode('list');
      setSelectedNote(null);
    } catch (err) {
      console.error('删除失败:', err);
    }
  }

  function resetEdit() {
    setEditTitle('');
    setEditContent('');
    setEditCategoryId('');
    setEditTagIds([]);
  }

  function startEditNote(note: KnowledgeNote) {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditCategoryId(note.categoryId);
    setEditTagIds(note.tagIds);
    setViewMode('edit');
  }

  function startNewNote() {
    setSelectedNote(null);
    resetEdit();
    setEditCategoryId(categories[0]?.id || '');
    setViewMode('edit');
  }

  function cancelEdit() {
    if (selectedNote) {
      setViewMode('list');
      setSelectedNote(null);
    } else {
      backToList();
    }
  }

  function backToList() {
    setViewMode('list');
    setSelectedNote(null);
    resetEdit();
    setSearchKeyword('');
    setFilterCategoryId(null);
    setFilterTagId(null);
  }

  function clearFilters() {
    setFilterCategoryId(null);
    setFilterTagId(null);
    loadData();
  }

  // 创建分类
  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await window.assistant.createCategory(newCategoryName.trim(), newCategoryColor);
      setNewCategoryName('');
      await loadData();
    } catch (err) {
      console.error('创建分类失败:', err);
    }
  }

  // 删除分类
  async function handleDeleteCategory(categoryId: string) {
    if (!window.confirm('确定删除此分类？笔记不会被删除，但会被移除分类关联。')) return;
    try {
      await window.assistant.deleteCategory(categoryId);
      if (filterCategoryId === categoryId) {
        setFilterCategoryId(null);
      }
      await loadData();
    } catch (err) {
      console.error('删除分类失败:', err);
    }
  }

  // 创建标签
  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    try {
      await window.assistant.createTag(newTagName.trim());
      setNewTagName('');
      await loadData();
    } catch (err) {
      console.error('创建标签失败:', err);
    }
  }

  // 删除标签
  async function handleDeleteTag(tagId: string) {
    if (!window.confirm('确定删除此标签？笔记不会被删除，但会被移除标签关联。')) return;
    try {
      await window.assistant.deleteTag(tagId);
      if (filterTagId === tagId) {
        setFilterTagId(null);
      }
      await loadData();
    } catch (err) {
      console.error('删除标签失败:', err);
    }
  }

  // 筛选 - 按分类
  function handleFilterByCategory(categoryId: string) {
    setFilterCategoryId(categoryId === filterCategoryId ? null : categoryId);
    setFilterTagId(null);
  }

  // 筛选 - 按标签
  function handleFilterByTag(tagId: string) {
    setFilterTagId(tagId === filterTagId ? null : tagId);
    setFilterCategoryId(null);
  }

  // 实时搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchKeyword.trim() && !filterCategoryId && !filterTagId) {
        loadData();
      } else if (searchKeyword.trim()) {
        (async () => {
          try {
            const result = await window.assistant.searchNotes(searchKeyword);
            setNotes(result.notes);
          } catch (err) {
            console.error('搜索失败:', err);
          }
        })();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 重新加载当筛选变化
  useEffect(() => {
    loadData();
  }, [filterCategoryId, filterTagId]);

  // 切换标签选中状态（编辑时）
  function toggleEditTag(tagId: string) {
    if (editTagIds.includes(tagId)) {
      setEditTagIds(editTagIds.filter(id => id !== tagId));
    } else {
      setEditTagIds([...editTagIds, tagId]);
    }
  }

  // 获取分类信息 by ID
  const getCategory = useCallback((id: string) => categories.find(c => c.id === id), [categories]);
  // 获取标签信息 by ID
  const getTag = useCallback((id: string) => tags.find(t => t.id === id), [tags]);

  // 过滤后的笔记已经在 loadData 中处理
  const displayedNotes = notes;

  // 是否有激活的筛选
  const hasActiveFilter = filterCategoryId || filterTagId;

  if (viewMode === 'edit') {
    return (
      <Flex direction="column" h="full" bg="white">
        <Box px={4} py={3} borderBottom="1px" borderColor="gray.200">
          <Stack gap={3}>
            {/* 标题输入 */}
            <Flex gap={3} align="flex-start" wrap="wrap">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="笔记标题"
                variant="flushed"
                fontSize="xl"
                fontWeight="semibold"
                flex={1}
                minW="250px"
                autoFocus
              />
            </Flex>

            {/* 分类选择 + 已选标签 */}
            <Flex gap={4} align="center" wrap="wrap">
              <Select
                size="sm"
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                w="180px"
                placeholder="选择分类"
              >
                <option value="">无分类</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>

              <Box flex={1}>
                <Text fontSize="xs" color="gray.500" mb={1}>已选标签：</Text>
                <HStack spacing={1} flexWrap="wrap">
                  {editTagIds.map(tagId => {
                    const tag = getTag(tagId);
                    return tag ? (
                      <Tag
                        key={tagId}
                        size="sm"
                        colorScheme="blue"
                        variant="subtle"
                      >
                        {tag.name}
                        <TagCloseButton onClick={() => toggleEditTag(tagId)} />
                      </Tag>
                    ) : null;
                  })}
                  {editTagIds.length === 0 && (
                    <Text fontSize="xs" color="gray.400">无标签</Text>
                  )}
                </HStack>
              </Box>
            </Flex>

            {/* 标签选择菜单 */}
            <Flex align="center">
              <Menu>
                <MenuButton as={Button} size="xs" variant="outline" leftIcon={<TagIcon size={14} />}>
                  添加标签
                </MenuButton>
                <MenuList maxH="200px" overflowY="auto" minW="150px">
                  {tags.filter(t => !editTagIds.includes(t.id)).map(tag => (
                    <MenuItem key={tag.id} onClick={() => toggleEditTag(tag.id)}>
                      {tag.name}
                    </MenuItem>
                  ))}
                  {tags.length === editTagIds.length && (
                    <MenuItem isDisabled>没有更多标签</MenuItem>
                  )}
                </MenuList>
              </Menu>
            </Flex>

            {/* 操作按钮 */}
            <Flex gap={2} justify="flex-end">
              <Text fontSize="xs" color="gray.400">
                快捷键: Ctrl/Cmd+S 保存, Esc 取消
              </Text>
              <Button size="sm" colorScheme="green" onClick={handleSaveNote}>保存</Button>
              {selectedNote && <Button size="sm" colorScheme="red" onClick={handleDeleteNote}>删除</Button>}
              <Button size="sm" variant="outline" onClick={cancelEdit}>取消</Button>
            </Flex>
          </Stack>
        </Box>

        <Box flex={1} overflow="auto">
          <MDEditor
            value={editContent}
            onChange={(val) => setEditContent(val || '')}
            preview="live"
            height="100%"
            minHeight={400}
            visibleDragbar={false}
          />
        </Box>
      </Flex>
    );
  }

  return (
    <Flex h="full" bg="gray.50">
      {/* 左侧边栏：分类 + 标签管理 */}
      <Box w="240px" bg="white" borderRight="1px" borderColor="gray.200" display="flex" flexDirection="column">
        {/* 分类区域 */}
        <Box p={3} flex={1} overflow="auto">
          <Heading size="sm" mb={3} display="flex" align="center" gap={1}>
            <Folder size={16} />
            分类
          </Heading>

          <Stack gap={1} mb={4}>
            {categories.map(category => (
              <Flex
                key={category.id}
                align="center"
                p={1}
                borderRadius="md"
                cursor="pointer"
                bg={filterCategoryId === category.id ? 'blue.50' : 'transparent'}
                _hover={{ bg: 'gray.100' }}
                onClick={() => handleFilterByCategory(category.id)}
              >
                <Box
                  w={3}
                  h={3}
                  borderRadius="full"
                  bg={category.color || '#999'}
                  mr={2}
                  flexShrink={0}
                />
                <Text flex={1} fontSize="sm" noOfLines={1}>
                  {category.name}
                </Text>
                <IconButton
                  aria-label="删除分类"
                  icon={<Trash2 size={14} />}
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(category.id);
                  }}
                />
              </Flex>
            ))}
            {categories.length === 0 && (
              <Text fontSize="xs" color="gray.400" textAlign="center" py={2}>
                暂无分类
              </Text>
            )}
          </Stack>

          {/* 新建分类 */}
          <Stack gap={2}>
            <Input
              size="sm"
              placeholder="分类名称"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
            />
            <Flex gap={1} wrap="wrap">
              {CATEGORY_COLORS.map(color => (
                <Box
                  key={color}
                  w={6}
                  h={6}
                  borderRadius="full"
                  bg={color}
                  cursor="pointer"
                  border={newCategoryColor === color ? '2px solid black' : '2px solid transparent'}
                  onClick={() => setNewCategoryColor(color)}
                />
              ))}
            </Flex>
            <Button
              size="sm"
              leftIcon={<Plus size={16} />}
              colorScheme="blue"
              isDisabled={!newCategoryName.trim()}
              onClick={handleCreateCategory}
            >
              添加分类
            </Button>
          </Stack>

          <Divider my={4} />

          {/* 标签区域 */}
          <Heading size="sm" mb={3} display="flex" align="center" gap={1}>
            <TagIcon size={16} />
            标签
          </Heading>

          <Stack gap={1} mb={4} maxH="200px" overflowY="auto">
            {tags.map(tag => (
              <Flex
                key={tag.id}
                align="center"
                p={1}
                borderRadius="md"
                cursor="pointer"
                bg={filterTagId === tag.id ? 'blue.50' : 'transparent'}
                _hover={{ bg: 'gray.100' }}
                onClick={() => handleFilterByTag(tag.id)}
              >
                <Text flex={1} fontSize="sm" noOfLines={1}>
                  {tag.name}
                </Text>
                <IconButton
                  aria-label="删除标签"
                  icon={<Trash2 size={14} />}
                  size="xs"
                  variant="ghost"
                  colorScheme="red"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTag(tag.id);
                  }}
                />
              </Flex>
            ))}
            {tags.length === 0 && (
              <Text fontSize="xs" color="gray.400" textAlign="center" py={2}>
                暂无标签
              </Text>
            )}
          </Stack>

          {/* 新建标签 */}
          <Stack gap={2}>
            <Input
              size="sm"
              placeholder="标签名称"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            />
            <Button
              size="sm"
              leftIcon={<Plus size={16} />}
              colorScheme="green"
              isDisabled={!newTagName.trim()}
              onClick={handleCreateTag}
            >
              添加标签
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* 右侧：搜索 + 笔记列表 */}
      <Flex direction="column" flex={1} bg="white">
        {/* 顶部操作栏 */}
        <Box px={4} py={3} borderBottom="1px" borderColor="gray.200">
          <Flex justify="space-between" align="center" mb={2}>
            <Heading size="md">知识库</Heading>
            <Button size="sm" colorScheme="blue" leftIcon={<Plus size={16} />} onClick={startNewNote}>
              新建笔记
            </Button>
          </Flex>

          <Flex gap={2} align="center">
            <Input
              placeholder="搜索标题或内容..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              size="sm"
              maxW="320px"
              leftElement={<Search size={14} style={{ marginLeft: 8 }} />}
            />

            {hasActiveFilter && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<FilterX size={16} />}
                onClick={clearFilters}
              >
                清除筛选
                {filterCategoryId
                  ? `(${getCategory(filterCategoryId)?.name})`
                  : filterTagId
                    ? `(${getTag(filterTagId)?.name})`
                    : ''}
              </Button>
            )}

            {displayedNotes.length > 0 && (
              <Text fontSize="sm" color="gray.500">
                共 {displayedNotes.length} 条笔记
              </Text>
            )}
          </Flex>
        </Box>

        {/* 笔记列表网格 */}
        <Box flex={1} overflow="auto" p={4}>
          {displayedNotes.length === 0 ? (
            <Flex direction="column" align="center" justify="center" py={20}>
              <Box color="gray.300" mb={2}>
                <StickyNote size={56} strokeWidth={1.6} />
              </Box>
              <Heading size="md" mb={1}>
                {searchKeyword || hasActiveFilter ? '未找到匹配的笔记' : '暂无笔记'}
              </Heading>
              <Text fontSize="sm" color="gray.400">
                {searchKeyword || hasActiveFilter
                  ? '尝试换个关键词或清除筛选'
                  : '点击上方"新建笔记"开始记录你的想法'
                }
              </Text>
            </Flex>
          ) : (
            <Box
              display="grid"
              gridTemplateColumns="repeat(auto-fill, minmax(260px, 1fr))"
              gap={3}
            >
              {displayedNotes.map((note) => (
                <Box
                  key={note.id}
                  p={3}
                  borderRadius="md"
                  border="1px"
                  borderColor="gray.200"
                  bg="white"
                  cursor="pointer"
                  _hover={{ shadow: 'md', borderColor: 'blue.200' }}
                  onClick={() => startEditNote(note)}
                >
                  <Flex justify="space-between" align="flex-start" mb={1} gap={2}>
                    <Heading size="xs" flex={1} lineHeight="tight">
                      <HighlightText text={note.title} keyword={searchKeyword} />
                    </Heading>
                    <Text fontSize="xs" color="gray.400" whiteSpace="nowrap">
                      {formatRelativeTime(note.updatedAt)}
                    </Text>
                  </Flex>

                  {/* 分类标签 */}
                  {note.categoryId && getCategory(note.categoryId) && (
                    <Badge
                      mb={1}
                      display="inline-block"
                      colorScheme="blue"
                      variant="subtle"
                      fontSize="xs"
                    >
                      {getCategory(note.categoryId)?.name}
                    </Badge>
                  )}

                  {/* 内容摘要 */}
                  {note.content && (
                    <Text fontSize="xs" color="gray.500" noOfLines={3} mb={2}>
                      <HighlightText text={note.content} keyword={searchKeyword} />
                    </Text>
                  )}

                  {/* 标签列表 */}
                  {note.tagIds.length > 0 && (
                    <Flex gap={1} wrap="wrap">
                      {note.tagIds.slice(0, 5).map((tagId) => {
                        const tag = getTag(tagId);
                        return tag && (
                          <Badge
                            key={tagId}
                            variant="outline"
                            fontSize="xs"
                            colorScheme="gray"
                          >
                            {tag.name}
                          </Badge>
                        );
                      })}
                      {note.tagIds.length > 5 && (
                        <Badge variant="outline" fontSize="xs">
                          +{note.tagIds.length - 5}
                        </Badge>
                      )}
                    </Flex>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Flex>
    </Flex>
  );
}
