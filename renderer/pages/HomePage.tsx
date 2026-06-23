import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, Heading, Input, Text, Textarea, useToast } from '@chakra-ui/react';
import { Eraser, Palette, Plus, StickyNote, Strikethrough, Trash2, Type as TypeIcon, Underline, Upload } from 'lucide-react';

const STORAGE_KEY = 'uuutil:whiteboard-items';
const noteColors = ['#fff7cc', '#e6f4ff', '#eaffea', '#fff0f6', '#f3e8ff'];
const textColors = [
  { value: 'gray.800', swatch: '#2d3748' },
  { value: 'red.500', swatch: '#e53e3e' },
  { value: 'blue.600', swatch: '#3182ce' },
  { value: 'green.600', swatch: '#38a169' },
  { value: 'purple.600', swatch: '#805ad5' },
];

type BoardItem =
  | { id: string; type: 'note'; x: number; y: number; width: number; height: number; title?: string; text: string; color: string; textColor?: string; fontSize?: number; bold?: boolean; underline?: boolean; strike?: boolean }
  | { id: string; type: 'text'; x: number; y: number; width: number; height: number; text: string; fontSize?: number; bold?: boolean; underline?: boolean; strike?: boolean; color?: string }
  | { id: string; type: 'image'; x: number; y: number; width: number; height: number; name: string; dataUrl: string }
  | { id: string; type: 'file'; x: number; y: number; width: number; height: number; name: string; mime: string; size: number; dataUrl: string };

interface Board {
  id: string;
  name: string;
  items: BoardItem[];
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBoard(index = 1): Board {
  return { id: makeId(), name: `画布 ${index}`, items: [] };
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getTextBoxSize(text: string, fontSize = 13) {
  if (!text.trim()) return { width: 220, height: 80 };

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const longestLineLength = Math.max(...lines.map((line) => line.length));
  const width = Math.max(120, Math.min(520, longestLineLength * fontSize * 0.62 + 18));
  const height = Math.max(36, Math.min(360, lines.length * fontSize * 1.45 + 14));

  return { width, height };
}

export default function HomePage() {
  const toast = useToast();
  const initialBoard = useRef(createBoard()).current;
  const [boards, setBoards] = useState<Board[]>([initialBoard]);
  const [activeBoardId, setActiveBoardId] = useState(initialBoard.id);
  const [loaded, setLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId?: string } | null>(null);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; width: number; height: number } | null>(null);
  const mousePosRef = useRef({ x: 80, y: 80 });
  const undoStackRef = useRef<{ activeBoardId: string; boards: Board[] }[]>([]);
  const lastSnapshotRef = useRef<{ activeBoardId: string; boards: Board[] } | null>(null);
  const restoringRef = useRef(false);

  const activeBoard = boards.find((board) => board.id === activeBoardId) || boards[0];
  const items = activeBoard?.items || [];

  useEffect(() => {
    async function loadState() {
      try {
        const saved = await window.assistant.getWhiteboardState();
        const fallback = localStorage.getItem(STORAGE_KEY);
        const raw = saved || fallback;
        if (!raw) return;

        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          const migrated = { ...createBoard(), name: '画布 1', items: data };
          setBoards([migrated]);
          setActiveBoardId(migrated.id);
          lastSnapshotRef.current = { activeBoardId: migrated.id, boards: [migrated] };
          return;
        }
        if (Array.isArray(data.boards) && data.boards.length > 0) {
          const nextActiveBoardId = data.activeBoardId || data.boards[0].id;
          setBoards(data.boards);
          setActiveBoardId(nextActiveBoardId);
          lastSnapshotRef.current = { activeBoardId: nextActiveBoardId, boards: data.boards };
        }
      } catch { /* ignore */ }
      finally {
        setLoaded(true);
      }
    }

    loadState();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    const previous = lastSnapshotRef.current;
    const current = { activeBoardId, boards };
    if (restoringRef.current) {
      restoringRef.current = false;
    } else if (previous) {
      undoStackRef.current = [...undoStackRef.current, previous].slice(-50);
    }
    lastSnapshotRef.current = current;

    const state = JSON.stringify(current);
    window.assistant.saveWhiteboardState(state).catch(() => {
      toast({ title: '白板保存失败', status: 'warning' });
    });
  }, [activeBoardId, boards, loaded, toast]);

  function setActiveItems(updater: (items: BoardItem[]) => BoardItem[]) {
    setBoards((prev) => prev.map((board) => (
      board.id === activeBoardId ? { ...board, items: updater(board.items) } : board
    )));
  }

  function undo() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    restoringRef.current = true;
    setBoards(previous.boards);
    setActiveBoardId(previous.activeBoardId);
    setActiveTextId(null);
    setEditingTextId(null);
    setActiveNoteId(null);
    lastSnapshotRef.current = previous;
  }

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isInputTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (isInputTarget && editingTextId) return;
        event.preventDefault();
        undo();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        if (isInputTarget && editingTextId) return;
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text.trim()) addText(text, mousePosRef.current);
        }).catch(() => {});
        return;
      }

      if (event.key === 'Escape') {
        closeMenu();
        setActiveTextId(null);
        setEditingTextId(null);
        setActiveNoteId(null);
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && activeTextId && !editingTextId && !isInputTarget) {
        event.preventDefault();
        removeItem(activeTextId);
        setActiveTextId(null);
        return;
      }

      if (isInputTarget) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;

      event.preventDefault();
      addText(event.key, mousePosRef.current, true);
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeTextId, editingTextId, activeBoardId, boards]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const resize = resizeRef.current;
      if (resize) {
        setActiveItems((prev) => prev.map((item) => {
          if (item.id !== resize.id) return item;
          const minWidth = item.type === 'text' ? 80 : 160;
          const minHeight = item.type === 'text' ? 28 : 120;
          return {
            ...item,
            width: Math.max(minWidth, resize.width + event.clientX - resize.startX),
            height: Math.max(minHeight, resize.height + event.clientY - resize.startY),
          };
        }));
        return;
      }

      const drag = dragRef.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      setActiveItems((prev) => prev.map((item) => {
        if (item.id !== drag.id) return item;
        const x = Math.max(0, Math.min(event.clientX - rect.left - drag.offsetX, rect.width - item.width));
        const y = Math.max(0, event.clientY - rect.top - drag.offsetY);
        return { ...item, x, y };
      }));
    }

    function onPointerUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeBoardId]);

  function handlePaste(event: ClipboardEvent | React.ClipboardEvent) {
    const target = event.target as HTMLElement | null;
    const isEditableTextarea = target instanceof HTMLTextAreaElement && !target.readOnly;
    if (target?.tagName === 'INPUT' || isEditableTextarea || target?.isContentEditable) return;

    const clipboard = event.clipboardData;
    const files = Array.from(clipboard?.files || []);
    const itemFiles = Array.from(clipboard?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const allFiles = files.length > 0 ? files : itemFiles;
    const text = clipboard?.getData('text/plain') || '';

    if (allFiles.length > 0) {
      event.preventDefault();
      addFiles(allFiles);
      return;
    }
    if (text.trim()) {
      event.preventDefault();
      addText(text, mousePosRef.current);
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      handlePaste(event);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeBoardId, items.length]);

  function nextPosition(index: number) {
    return { x: 24 + (index % 6) * 28, y: 24 + (index % 8) * 24 };
  }

  function addBoard() {
    const board = createBoard(boards.length + 1);
    setBoards((prev) => [...prev, board]);
    setActiveBoardId(board.id);
  }

  function deleteActiveBoard() {
    if (boards.length <= 1) {
      toast({ title: '至少保留一个画布', status: 'info' });
      return;
    }
    if (!window.confirm(`确定删除「${activeBoard.name}」？`)) return;
    const nextBoards = boards.filter((board) => board.id !== activeBoardId);
    setBoards(nextBoards);
    setActiveBoardId(nextBoards[0].id);
  }

  function renameActiveBoard(name: string) {
    setBoards((prev) => prev.map((board) => (
      board.id === activeBoardId ? { ...board, name } : board
    )));
  }

  function addNote(text = '', position?: { x: number; y: number }) {
    setActiveItems((prev) => {
      const pos = position || nextPosition(prev.length);
      return [
        ...prev,
        {
          id: makeId(),
          type: 'note',
          ...pos,
          width: 230,
          height: 180,
          title: '便签',
          text,
          color: noteColors[prev.length % noteColors.length],
          fontSize: 12,
          bold: false,
          underline: false,
          strike: false,
        },
      ];
    });
  }

  function addText(text = '', position?: { x: number; y: number }, focus = true) {
    const id = makeId();
    const fontSize = 13;
    const size = getTextBoxSize(text, fontSize);
    setActiveItems((prev) => {
      const pos = position || nextPosition(prev.length);
      return [
        ...prev,
        {
          id,
          type: 'text',
          ...pos,
          ...size,
          text,
          fontSize,
          bold: false,
          underline: false,
          strike: false,
        },
      ];
    });
    if (focus) {
      setActiveTextId(id);
      setEditingTextId(id);
    }
  }

  function updateTextStyle(id: string, patch: Partial<Extract<BoardItem, { type: 'text' }>>) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'text' ? { ...item, ...patch } : item));
  }

  async function addFiles(files: File[] | FileList) {
    const list = Array.from(files);
    if (list.length === 0) return;

    const baseIndex = items.length;
    const nextItems = await Promise.all(list.map(async (file, index): Promise<BoardItem> => {
      const dataUrl = await readFile(file);
      const pos = nextPosition(baseIndex + index);
      if (file.type.startsWith('image/')) {
        return {
          id: makeId(),
          type: 'image',
          ...pos,
          width: 260,
          height: 220,
          name: file.name || 'clipboard-image',
          dataUrl,
        };
      }
      return {
        id: makeId(),
        type: 'file',
        ...pos,
        width: 260,
        height: 132,
        name: file.name || 'clipboard-file',
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      };
    }));

    setActiveItems((prev) => [...prev, ...nextItems]);
  }

  function startDrag(event: React.PointerEvent, item: BoardItem) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      id: item.id,
      offsetX: event.clientX - rect.left - item.x,
      offsetY: event.clientY - rect.top - item.y,
    };
  }

  function updateNote(id: string, text: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? { ...item, text } : item));
  }

  function updateNoteTitle(id: string, title: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? { ...item, title } : item));
  }

  function updateNoteStyle(id: string, patch: Partial<Extract<BoardItem, { type: 'note' }>>) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'note' ? { ...item, ...patch } : item));
  }

  function updateText(id: string, text: string) {
    setActiveItems((prev) => prev.map((item) => item.id === id && item.type === 'text' ? { ...item, text } : item));
  }

  function startResize(event: React.PointerEvent, item: BoardItem) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { id: item.id, startX: event.clientX, startY: event.clientY, width: item.width, height: item.height };
  }

  function removeItem(id: string) {
    setActiveItems((prev) => prev.filter((item) => item.id !== id));
  }

  function clearBoard() {
    if (items.length === 0) return;
    if (!window.confirm('确定清空当前画布？')) return;
    setActiveItems(() => []);
  }

  function openCanvasMenu(event: React.MouseEvent) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  function openItemMenu(event: React.MouseEvent, itemId: string) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setContextMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, itemId });
  }

  async function pasteTextAsNote() {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      toast({ title: '剪贴板没有文本内容', status: 'info' });
      return;
    }
    addText(text, contextMenu ? { x: contextMenu.x, y: contextMenu.y } : undefined);
  }

  const selectedMenuItem = contextMenu?.itemId ? items.find((item) => item.id === contextMenu.itemId) : undefined;
  const editingTextItem = editingTextId ? items.find((item) => item.id === editingTextId && item.type === 'text') as Extract<BoardItem, { type: 'text' }> | undefined : undefined;
  const activeNoteItem = activeNoteId ? items.find((item) => item.id === activeNoteId && item.type === 'note') as Extract<BoardItem, { type: 'note' }> | undefined : undefined;
  const formatTarget = editingTextItem || activeNoteItem;

  return (
    <Flex w="100%" h="100%" minH="100%" gap={1.5}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <Flex
        direction="column"
        align="stretch"
        bg="whiteAlpha.900"
        borderRadius="sm"
        border="1px solid"
        borderColor="gray.200"
        p={1}
        w="44px"
        shrink={0}
        gap={1}
        overflow="hidden"
      >
        <Button size="xs" colorScheme="blue" onClick={addBoard} title="新增画布"><Plus size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => addNote()} title="添加便签"><StickyNote size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => addText('', mousePosRef.current)} title="添加文本框"><TypeIcon size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" variant="outline" onClick={() => fileInputRef.current?.click()} title="导入文件"><Upload size={15} strokeWidth={1.8} /></Button>
        <Button size="xs" colorScheme="red" variant="ghost" onClick={clearBoard} isDisabled={items.length === 0} title="清空当前画布"><Eraser size={15} strokeWidth={1.8} /></Button>
        <Box h="1px" bg="gray.200" my={1} />
        <Flex direction="column" gap={1} overflowY="auto" minH={0} flex={1}>
          {boards.map((board, index) => (
            <Button
              key={board.id}
              size="xs"
              variant={board.id === activeBoardId ? 'solid' : 'ghost'}
              colorScheme={board.id === activeBoardId ? 'blue' : 'gray'}
              onClick={() => setActiveBoardId(board.id)}
              title={board.name}
            >
              {index + 1}
            </Button>
          ))}
        </Flex>
        <Button size="xs" colorScheme="red" variant="ghost" onClick={deleteActiveBoard} isDisabled={boards.length <= 1} title="删除当前画布"><Trash2 size={15} strokeWidth={1.8} /></Button>
      </Flex>

      <Box
        ref={canvasRef}
        tabIndex={0}
        position="relative"
        bg="white"
        borderRadius="sm"
        h="100%"
        minH="560px"
        flex={1}
        overflow="hidden"
        border="1px solid"
        borderColor="gray.100"
        backgroundImage="linear-gradient(#edf2f7 1px, transparent 1px), linear-gradient(90deg, #edf2f7 1px, transparent 1px)"
        backgroundSize="24px 24px"
        outline="none"
        userSelect="none"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.detail > 1 && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setActiveTextId(null);
            setEditingTextId(null);
            setActiveNoteId(null);
            canvasRef.current?.focus();
          }
        }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          mousePosRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        }}
        onPaste={handlePaste}
        onContextMenu={openCanvasMenu}
      >
        <Box
          position="absolute"
          top={3}
          left={3}
          bg="whiteAlpha.900"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="sm"
          px={2}
          py={1}
          boxShadow="0 8px 24px rgba(0,0,0,0.12)"
          zIndex={10}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <Input
            value={activeBoard.name}
            onChange={(event) => renameActiveBoard(event.target.value)}
            variant="unstyled"
            size="xs"
            fontSize="xs"
            fontWeight="semibold"
            color="gray.600"
            w={`${Math.max(72, Math.min(260, (activeBoard.name || '画布名称').length * 14))}px`}
            minW="72px"
            maxW="260px"
            placeholder="画布名称"
            userSelect="text"
          />
        </Box>

        {items.length === 0 && (
          <Flex position="absolute" inset={0} align="center" justify="center" direction="column" color="gray.400" pointerEvents="none">
            <Heading size="sm" mb={1}>空白画布</Heading>
            <Text fontSize="sm">从左侧添加便签/文本框/导入文件，或直接键盘输入、粘贴文本。</Text>
          </Flex>
        )}

        {items.map((item) => (
          <Box
            key={item.id}
            position="absolute"
            left={`${item.x}px`}
            top={`${item.y}px`}
            w={`${item.width}px`}
            h={`${item.height}px`}
            bg={item.type === 'note' ? item.color : item.type === 'text' ? 'transparent' : 'white'}
            borderRadius="sm"
            boxShadow={item.type === 'text' ? 'none' : '0 8px 24px rgba(0,0,0,0.12)'}
            border="1px solid"
            borderColor={item.type === 'text' ? (activeTextId === item.id ? 'blue.300' : 'transparent') : 'blackAlpha.100'}
            overflow={item.type === 'text' ? 'visible' : 'hidden'}
            _hover={item.type === 'text' ? { borderColor: 'blue.200' } : undefined}
            onContextMenu={(event) => openItemMenu(event, item.id)}
            onPointerDown={(event) => {
              if (item.type === 'text') {
                setActiveTextId(item.id);
                setEditingTextId(null);
                setActiveNoteId(null);
                startDrag(event, item);
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              if (item.type === 'text') {
                event.stopPropagation();
                setActiveTextId(item.id);
                setEditingTextId(item.id);
                setActiveNoteId(null);
              }
            }}
          >
            {item.type !== 'text' && (
              <Flex
                align="center"
                justify="space-between"
                gap={1}
                px={2}
                py={1}
                bg="blackAlpha.50"
                cursor="move"
                onPointerDown={(event) => startDrag(event, item)}
              >
                {item.type === 'note' ? (
                  <Input
                    value={item.title ?? '便签'}
                    onChange={(event) => updateNoteTitle(item.id, event.target.value)}
                    variant="unstyled"
                    size="xs"
                    fontSize="xs"
                    color="gray.600"
                    fontWeight="semibold"
                    minW={0}
                    userSelect="text"
                    onPointerDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />
                ) : (
                  <Text fontSize="xs" color="gray.600" noOfLines={1}>{item.name}</Text>
                )}
                <Flex gap={1} onPointerDown={(event) => event.stopPropagation()}>
                  {item.type === 'note' && (
                    <Button
                      size="xs"
                      variant="ghost"
                      title="更换底色"
                      onClick={() => updateNoteStyle(item.id, { color: noteColors[(noteColors.indexOf(item.color) + 1) % noteColors.length] })}
                    >
                      <Palette size={13} strokeWidth={1.8} />
                    </Button>
                  )}
                  <Button size="xs" colorScheme="red" variant="ghost" title="删除" onClick={() => removeItem(item.id)}>
                    <Trash2 size={13} strokeWidth={1.8} />
                  </Button>
                </Flex>
              </Flex>
            )}

            {item.type === 'note' && (
              <>
                <Textarea
                  value={item.text}
                  onChange={(event) => updateNote(item.id, event.target.value)}
                  onFocus={() => {
                    setActiveNoteId(item.id);
                    setActiveTextId(null);
                    setEditingTextId(null);
                  }}
                  placeholder="输入临时记录..."
                  variant="unstyled"
                  p={2}
                  h={`calc(${item.height}px - 34px)`}
                  resize="none"
                  fontSize={`${item.fontSize || 12}px`}
                  fontWeight={item.bold ? 'semibold' : 'normal'}
                  color={item.textColor || 'gray.800'}
                  lineHeight="1.55"
                  userSelect="text"
                  sx={{ textDecoration: [item.underline ? 'underline' : '', item.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' }}
                />
                <Box
                  position="absolute"
                  right={1}
                  bottom={1}
                  w="12px"
                  h="12px"
                  cursor="nwse-resize"
                  borderRight="2px solid"
                  borderBottom="2px solid"
                  borderColor="blackAlpha.400"
                  onPointerDown={(event) => startResize(event, item)}
                />
              </>
            )}

            {item.type === 'text' && (
              <>
                <Textarea
                  autoFocus={editingTextId === item.id}
                  value={item.text}
                  onChange={(event) => updateText(item.id, event.target.value)}
                  onFocus={() => {
                    setActiveTextId(item.id);
                    if (editingTextId !== item.id) canvasRef.current?.focus();
                  }}
                  onPointerDown={(event) => {
                    if (editingTextId === item.id) event.stopPropagation();
                  }}
                  readOnly={editingTextId !== item.id}
                  cursor={editingTextId === item.id ? 'text' : 'default'}
                  placeholder={editingTextId === item.id ? '输入文本' : ''}
                  variant="unstyled"
                  p={1}
                  h="100%"
                  resize="none"
                  fontSize={`${item.fontSize || 13}px`}
                  fontWeight={item.bold ? 'semibold' : 'normal'}
                  color={item.color || 'gray.800'}
                  lineHeight="1.45"
                  sx={{ textDecoration: [item.underline ? 'underline' : '', item.strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none' }}
                  bg="transparent"
                  overflow="hidden"
                  userSelect={editingTextId === item.id ? 'text' : 'none'}
                />
                {activeTextId === item.id && (
                  <>
                    <Box
                      position="absolute"
                      right={0}
                      bottom={0}
                      w="10px"
                      h="10px"
                      cursor="nwse-resize"
                      borderRight="2px solid"
                      borderBottom="2px solid"
                      borderColor="blue.400"
                      onPointerDown={(event) => startResize(event, item)}
                    />
                  </>
                )}
              </>
            )}

            {item.type === 'image' && (
              <Box p={2} h={`calc(${item.height}px - 34px)`} display="flex" alignItems="center" justifyContent="center">
                <img src={item.dataUrl} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </Box>
            )}

            {item.type === 'file' && (
              <Box p={3}>
                <Text fontSize="sm" fontWeight="semibold" noOfLines={2}>{item.name}</Text>
                <Text fontSize="xs" color="gray.500" mt={1}>{item.mime}</Text>
                <Text fontSize="xs" color="gray.500" mb={3}>{formatSize(item.size)}</Text>
                <Button as="a" href={item.dataUrl} download={item.name} size="xs" colorScheme="blue">下载附件</Button>
              </Box>
            )}
          </Box>
        ))}

        {formatTarget && (
          <Flex
            position="absolute"
            left="50%"
            bottom={3}
            transform="translateX(-50%)"
            bg="whiteAlpha.950"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            boxShadow="0 12px 32px rgba(0,0,0,0.16)"
            px={2}
            py={1}
            gap={1}
            align="center"
            zIndex={15}
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              size="xs"
              variant={formatTarget.bold ? 'solid' : 'ghost'}
              fontWeight="bold"
              title="加粗"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { bold: !formatTarget.bold });
                else updateNoteStyle(formatTarget.id, { bold: !formatTarget.bold });
              }}
            >
              B
            </Button>
            <Button
              size="xs"
              variant={formatTarget.underline ? 'solid' : 'ghost'}
              title="下划线"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { underline: !formatTarget.underline });
                else updateNoteStyle(formatTarget.id, { underline: !formatTarget.underline });
              }}
            >
              <Underline size={13} strokeWidth={1.8} />
            </Button>
            <Button
              size="xs"
              variant={formatTarget.strike ? 'solid' : 'ghost'}
              title="删除线"
              onClick={() => {
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { strike: !formatTarget.strike });
                else updateNoteStyle(formatTarget.id, { strike: !formatTarget.strike });
              }}
            >
              <Strikethrough size={13} strokeWidth={1.8} />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const nextFontSize = Math.max(10, (formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)) - 1);
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { fontSize: nextFontSize });
                else updateNoteStyle(formatTarget.id, { fontSize: nextFontSize });
              }}
            >
              A-
            </Button>
            <Text fontSize="xs" color="gray.500" minW="32px" textAlign="center">{formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)}px</Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                const nextFontSize = Math.min(36, (formatTarget.fontSize || (formatTarget.type === 'text' ? 13 : 12)) + 1);
                if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { fontSize: nextFontSize });
                else updateNoteStyle(formatTarget.id, { fontSize: nextFontSize });
              }}
            >
              A+
            </Button>
            <Flex gap={1} align="center" ml={1}>
              {textColors.map((color) => {
                const current = formatTarget.type === 'text' ? (formatTarget.color || textColors[0].value) : (formatTarget.textColor || textColors[0].value);
                const selected = current === color.value;
                return (
                  <Button
                    key={color.value}
                    size="xs"
                    minW="18px"
                    w="18px"
                    h="18px"
                    p={0}
                    borderRadius="full"
                    border="2px solid"
                    borderColor={selected ? 'blue.400' : 'transparent'}
                    bg={color.swatch}
                    _hover={{ opacity: 0.85 }}
                    title="文字颜色"
                    onClick={() => {
                      if (formatTarget.type === 'text') updateTextStyle(formatTarget.id, { color: color.value });
                      else updateNoteStyle(formatTarget.id, { textColor: color.value });
                    }}
                  />
                );
              })}
            </Flex>
          </Flex>
        )}

        {contextMenu && (
          <Box
            position="absolute"
            left={`${contextMenu.x}px`}
            top={`${contextMenu.y}px`}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            boxShadow="0 12px 32px rgba(0,0,0,0.18)"
            p={1}
            zIndex={20}
            minW="150px"
            onClick={(event) => event.stopPropagation()}
          >
            {selectedMenuItem ? (
              <>
                <Button size="sm" colorScheme="red" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => removeItem(selectedMenuItem.id)}>删除</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => addNote('', { x: contextMenu.x, y: contextMenu.y })}>添加便签</Button>
                <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => addText('', { x: contextMenu.x, y: contextMenu.y })}>添加文本框</Button>
                <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={pasteTextAsNote}>粘贴文本</Button>
                <Button size="sm" variant="ghost" justifyContent="flex-start" w="100%" onClick={() => fileInputRef.current?.click()}>导入文件</Button>
                <Button size="sm" colorScheme="red" variant="ghost" justifyContent="flex-start" w="100%" onClick={clearBoard} isDisabled={items.length === 0}>清空当前画布</Button>
              </>
            )}
          </Box>
        )}
      </Box>
    </Flex>
  );
}
