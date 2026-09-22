import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Button, Flex, Input, InputGroup, InputLeftElement, Select, Heading, Text, Badge, Stack,
  Divider, IconButton, Tag, TagCloseButton, Menu, MenuButton,
  MenuList, MenuItem, Checkbox, HStack, Avatar,
} from '@chakra-ui/react';
import { StickyNote, Plus, Trash2, Search, FilterX, Tag as TagIcon, Folder } from 'lucide-react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import type { KnowledgeNote, KnowledgeCategory, KnowledgeTag, OvLibraryHit } from '@shared/types';
import { useThemeMode } from '../theme';

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
      <mark style={{ backgroundColor: 'var(--uu-note-yellow)', color: 'inherit', padding: '0 2px', borderRadius: '2px' }}>
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
  const { mode: themeMode } = useThemeMode();
  const [notes, setNotes] = useState<KnowledgeNote[]>([]);
  const [ovHits, setOvHits] = useState<OvLibraryHit[] | null>(null);
  const [expandedOv, setExpandedOv] = useState<{ uri: string; content: string | null } | null>(null);
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

  // 加载序列号：丢弃过期响应，避免搜索/筛选快速切换时结果抖动
  const loadSeq = useRef(0);

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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function loadData() {
    const seq = ++loadSeq.current;
    try {
      const keyword = searchKeyword.trim();
      // 规范化：后端两个接口返回结构不一（数组或 { notes }），统一成数组
      const normalize = (r: any): KnowledgeNote[] =>
        Array.isArray(r) ? r : r?.notes || [];

      let notesPromise: Promise<KnowledgeNote[]>;
      if (keyword) {
        // 联合检索：本地笔记 + OpenViking 共享库（本地部分再在客户端按分类/标签叠加过滤）
        notesPromise = window.assistant.searchKbLibrary(searchKeyword).then((r) => {
          setOvHits(r?.ov ?? null);
          return normalize(r?.local).filter(
            (n) =>
              (!filterCategoryId || n.categoryId === filterCategoryId) &&
              (!filterTagId || n.tagIds.includes(filterTagId)),
          );
        });
      } else if (filterCategoryId || filterTagId) {
        setOvHits(null);
        notesPromise = window.assistant
          .getNotes(filterCategoryId || undefined, filterTagId || undefined)
          .then(normalize);
      } else {
        setOvHits(null);
        notesPromise = window.assistant.getNotes().then(normalize);
      }

      const [notesData, categoriesData, tagsData] = await Promise.all([
        notesPromise,
        window.assistant.getCategories(),
        window.assistant.getTags(),
      ]);
      // 丢弃过期响应：期间又触发了更新的加载
      if (seq !== loadSeq.current) return;
      setNotes(notesData);
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
    // 无需手动 loadData：筛选 state 变化会触发统一的防抖 effect 自动刷新
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

  // 筛选 / 搜索统一入口：搜索输入防抖 300ms，筛选变化立即刷新；
  // 单一 effect + loadData 内序列号共同保证过期响应被丢弃，结果不抖动。
  useEffect(() => {
    const delay = searchKeyword.trim() ? 300 : 0;
    const timer = setTimeout(() => loadData(), delay);
    return () => clearTimeout(timer);
  }, [searchKeyword, filterCategoryId, filterTagId]);

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
      <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
        <div className="ck-head">
          <span className="code">ARCHIVE</span>
          <span className="zh">知识库</span>
          <span className="sub">DATABANK // 本地档案</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="ck-input" style={{ padding: '10px 14px' }}>
            <span className="prompt">▸</span>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="笔记标题"
              autoFocus
              style={{ fontSize: 16, fontWeight: 600 }}
            />
          </div>

          <div className="ck-tools">
            <Select
              size="sm"
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(e.target.value)}
              w="180px"
            >
              <option value="">无分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </Select>

            <span className="ck-dim" style={{ fontSize: 11 }}>标签：</span>
            {editTagIds.map(tagId => {
              const tag = getTag(tagId);
              return tag ? (
                <span key={tagId} className="ck-chip on" style={{ padding: '2px 8px' }}>
                  {tag.name}
                  <span style={{ cursor: 'pointer', marginLeft: 4, color: 'var(--ink-3)' }} onClick={() => toggleEditTag(tagId)}>×</span>
                </span>
              ) : null;
            })}
            {editTagIds.length === 0 && <span className="ck-dim" style={{ fontSize: 11 }}>无标签</span>}

            <div className="ck-spacer" />

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
          </div>

          <div className="ck-tools">
            <span className="ck-dim" style={{ fontSize: 10 }}>快捷键: Ctrl/Cmd+S 保存 · Esc 取消</span>
            <div className="ck-spacer" />
            <button className="ck-btn primary" onClick={handleSaveNote}>保存</button>
            {selectedNote && <button className="ck-btn danger" onClick={handleDeleteNote}>删除</button>}
            <button className="ck-btn" onClick={cancelEdit}>取消</button>
          </div>
        </div>

        <Box flex={1} overflow="auto">
          <MDEditor
            data-color-mode={themeMode === 'cockpit' ? 'dark' : 'light'}
            value={editContent}
            onChange={(val) => setEditContent(val || '')}
            preview="live"
            height="100%"
            minHeight={400}
            visibleDragbar={false}
          />
        </Box>
      </div>
    );
  }

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">ARCHIVE</span>
        <span className="zh">知识库</span>
        <span className="sub">DATABANK // 本地档案</span>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 12 }}>
      {/* 左侧边栏：分类 + 标签管理 */}
      <div className="ck-aside" style={{ width: 240, minWidth: 240, borderRight: '1px solid var(--line)', padding: '12px 10px', gap: 10 }}>
        <div className="ck-hairline" style={{ marginTop: 0 }}><Folder size={13} /> 分类</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {categories.map(category => (
            <div
              key={category.id}
              className={'ck-chip' + (filterCategoryId === category.id ? ' on' : '')}
              style={{ justifyContent: 'flex-start', width: '100%' }}
              onClick={() => handleFilterByCategory(category.id)}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: category.color || '#999', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.name}</span>
              <button className="ck-ico" style={{ width: 20, height: 20 }} title="删除分类" onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}><Trash2 size={12} /></button>
            </div>
          ))}
          {categories.length === 0 && <div className="ck-dim" style={{ fontSize: 11, textAlign: 'center', padding: 6 }}>暂无分类</div>}
        </div>

        <div className="ck-input" style={{ padding: '6px 10px' }}>
          <span className="prompt">›</span>
          <input placeholder="分类名称" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CATEGORY_COLORS.map(color => (
            <span
              key={color}
              onClick={() => setNewCategoryColor(color)}
              style={{ width: 16, height: 16, borderRadius: '50%', background: color, cursor: 'pointer', border: newCategoryColor === color ? '2px solid var(--ink)' : '2px solid transparent', boxSizing: 'border-box' }}
            />
          ))}
        </div>
        <button className="ck-btn" style={{ justifyContent: 'center' }} disabled={!newCategoryName.trim()} onClick={handleCreateCategory}><Plus size={13} /> 添加分类</button>

        <div className="ck-hairline"><TagIcon size={13} /> 标签</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}>
          {tags.map(tag => (
            <div
              key={tag.id}
              className={'ck-chip' + (filterTagId === tag.id ? ' on' : '')}
              style={{ justifyContent: 'flex-start', width: '100%' }}
              onClick={() => handleFilterByTag(tag.id)}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.name}</span>
              <button className="ck-ico" style={{ width: 20, height: 20 }} title="删除标签" onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}><Trash2 size={12} /></button>
            </div>
          ))}
          {tags.length === 0 && <div className="ck-dim" style={{ fontSize: 11, textAlign: 'center', padding: 6 }}>暂无标签</div>}
        </div>

        <div className="ck-input" style={{ padding: '6px 10px' }}>
          <span className="prompt">›</span>
          <input placeholder="标签名称" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()} />
        </div>
        <button className="ck-btn" style={{ justifyContent: 'center' }} disabled={!newTagName.trim()} onClick={handleCreateTag}><Plus size={13} /> 添加标签</button>
      </div>

      {/* 右侧：搜索 + 笔记列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div className="ck-tools" style={{ marginBottom: 8 }}>
          <div className="ck-input" style={{ flex: 1, padding: '7px 12px' }}>
            <span className="prompt">›</span>
            <input placeholder="搜索标题或内容..." value={searchKeyword} onChange={(e) => setSearchKeyword(e.target.value)} />
            <kbd>⌘F</kbd>
          </div>
          {hasActiveFilter && (
            <button className="ck-chip on" onClick={clearFilters}>
              <FilterX size={13} /> 清除{filterCategoryId ? `(${getCategory(filterCategoryId)?.name})` : filterTagId ? `(${getTag(filterTagId)?.name})` : ''}
            </button>
          )}
          <span className="ck-dim" style={{ fontSize: 11 }}>{displayedNotes.length > 0 ? `共 ${displayedNotes.length} 条笔记` : ''}</span>
          <div className="ck-spacer" />
          <button className="ck-btn primary" onClick={startNewNote}><Plus size={13} /> 新建笔记</button>
        </div>

        <div className="ck-list">
          {displayedNotes.length === 0 ? (
            <div className="ck-empty">
              <div className="code">NO DATA</div>
              {searchKeyword || hasActiveFilter ? '未找到匹配的笔记' : '点击上方「新建笔记」开始记录你的想法'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {displayedNotes.map((note) => (
                <div key={note.id} className="ck-panel" style={{ cursor: 'pointer' }} onClick={() => startEditNote(note)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div className="ck-item-title" style={{ fontWeight: 700 }}><HighlightText text={note.title} keyword={searchKeyword} /></div>
                    <span className="ck-dim" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{formatRelativeTime(note.updatedAt)}</span>
                  </div>
                  {note.categoryId && getCategory(note.categoryId) && (
                    <span className="ck-badge phos" style={{ marginBottom: 6 }}>{getCategory(note.categoryId)?.name}</span>
                  )}
                  {note.content && (
                    <div className="ck-dim" style={{ fontSize: 11.5, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      <HighlightText text={note.content} keyword={searchKeyword} />
                    </div>
                  )}
                  {note.tagIds.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {note.tagIds.slice(0, 5).map((tagId) => {
                        const tag = getTag(tagId);
                        return tag && <span key={tagId} className="ck-badge">{tag.name}</span>;
                      })}
                      {note.tagIds.length > 5 && <span className="ck-badge">+{note.tagIds.length - 5}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        {/* OpenViking 共享库检索结果（仅搜索时展示，与本地结果同滚动） */}
        {searchKeyword.trim() && ovHits && ovHits.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="ck-hairline">OPENVIKING // 共享库 <span className="n">{ovHits.length}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {ovHits.map((hit) => (
                <div
                  key={hit.uri}
                  className="ck-panel"
                  style={{ cursor: 'pointer' }}
                  onClick={async () => {
                    if (expandedOv?.uri === hit.uri) {
                      setExpandedOv(null);
                      return;
                    }
                    setExpandedOv({ uri: hit.uri, content: null });
                    const content = await window.assistant.readKbOvContent(hit.uri);
                    setExpandedOv((prev) => (prev?.uri === hit.uri ? { uri: hit.uri, content } : prev));
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div className="ck-item-title" style={{ fontWeight: 700 }}>{hit.title}</div>
                    <span className={'ck-badge' + (hit.contextType === 'memory' ? ' phos' : '')}>
                      {hit.contextType === 'memory' ? 'MEM' : 'RES'} {Math.round(hit.score * 100)}%
                    </span>
                  </div>
                  {hit.abstract && (
                    <div className="ck-dim" style={{ fontSize: 11.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {hit.abstract}
                    </div>
                  )}
                  <div className="ck-dim" style={{ fontSize: 9, marginTop: 6, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hit.uri}</div>
                  {expandedOv?.uri === hit.uri && (
                    <div className="ck-term" style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', fontSize: 11.5 }}>
                      {expandedOv.content ?? 'LOADING…'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
