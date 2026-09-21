import React, { useEffect, useState } from 'react';
import { useToast } from '@chakra-ui/react';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { foregroundRoutes } from '../router';
import type { RouteConfig } from '../router';
import type { TabLayout } from '../../src/shared/types';

interface TabItem {
  path: string;
  label: string;
  icon: RouteConfig['icon'];
  visible: boolean;
}

/** 依据布局配置把前台路由展开成有序、带显隐标记的列表（含被隐藏项）。 */
function buildItems(layout: TabLayout): TabItem[] {
  const byPath = new Map(foregroundRoutes.map((route) => [route.path, route]));
  const seen = new Set<string>();
  const ordered: RouteConfig[] = [];
  for (const path of layout.order) {
    const route = byPath.get(path);
    if (route && !seen.has(path)) {
      ordered.push(route);
      seen.add(path);
    }
  }
  for (const route of foregroundRoutes) {
    if (!seen.has(route.path)) ordered.push(route);
  }
  const hidden = new Set(layout.hidden);
  return ordered.map((route) => ({
    path: route.path,
    label: route.label,
    icon: route.icon,
    visible: !hidden.has(route.path),
  }));
}

export default function InterfaceSettingsPage() {
  const toast = useToast();
  const [items, setItems] = useState<TabItem[]>(() => buildItems({ order: [], hidden: [] }));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const layout = await window.assistant.ui.getTabLayout();
      setItems(buildItems(layout));
    } catch { /* browser 环境无 assistant */ }
  }

  function toggleVisible(path: string) {
    setItems((prev) => prev.map((item) => (item.path === path ? { ...item, visible: !item.visible } : item)));
  }

  function handleDrop(targetIndex: number) {
    setItems((prev) => {
      if (dragIndex === null || dragIndex === targetIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function save() {
    setSaving(true);
    try {
      const layout: TabLayout = {
        order: items.map((item) => item.path),
        hidden: items.filter((item) => !item.visible).map((item) => item.path),
      };
      const result = await window.assistant.ui.saveTabLayout(layout);
      if (result.success) {
        window.dispatchEvent(new Event('uuutil:tab-layout-changed'));
        toast({ title: '已保存', status: 'success', duration: 1500 });
      } else {
        toast({ title: '保存失败', status: 'error', duration: 2500 });
      }
    } catch {
      toast({ title: '保存失败', status: 'error', duration: 2500 });
    } finally {
      setSaving(false);
    }
  }

  function resetDefault() {
    setItems(buildItems({ order: [], hidden: [] }));
  }

  const visibleCount = items.filter((item) => item.visible).length;

  return (
    <div className="ck" style={{ padding: '18px 22px 20px', gap: 10, display: 'flex', flexDirection: 'column' }}>
      <div className="ck-head">
        <span className="code">SYSTEM CFG</span>
        <span className="zh">界面设置</span>
        <span className="sub">TAB LAYOUT // 布局持久化</span>
      </div>

      <div className="ck-tools">
        <span className="ck-dim" style={{ fontSize: 11 }}>当前显示 {visibleCount} / {items.length} 个标签</span>
        <div className="ck-spacer" />
        <button className="ck-btn" onClick={resetDefault}><RotateCcw size={12} /> 恢复默认</button>
        <button className="ck-btn primary" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      <div className="ck-list">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.path}
              className="ck-row"
              style={{
                opacity: item.visible ? 1 : 0.45,
                cursor: 'grab',
                boxShadow: dragIndex === index ? 'inset 0 0 0 1px var(--phos)' : undefined,
              }}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => setDragIndex(null)}
            >
              <span className="ck-dim" style={{ flexShrink: 0, display: 'flex' }}><GripVertical size={16} /></span>
              <span className="ck-phos" style={{ flexShrink: 0, display: 'flex' }}><Icon size={16} strokeWidth={1.8} /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
              <button
                className={'ck-ico' + (item.visible ? ' on' : '')}
                title={item.visible ? '隐藏' : '显示'}
                onClick={() => toggleVisible(item.path)}
              >
                {item.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}