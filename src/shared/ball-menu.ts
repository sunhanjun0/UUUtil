/**
 * 悬浮球环形菜单 —— 主进程与渲染进程共享的几何定义。
 *
 * 菜单打开时球窗口从 BALL_SIZE 扩大到 BALL_MENU_SIZE（球心位置不变），
 * 主进程依据这里的常量和 ballMenuItemCenters() 计算窗口 shape（可点区域），
 * 渲染进程依据同一份数据摆放菜单项，保证视觉与可点区域严格一致。
 */

/** 菜单展开时的窗口边长（关闭时为窗口常量 BALL_SIZE=96，见 main/windows.ts） */
export const BALL_MENU_SIZE = 160;

/** 菜单项数量（主进程 shape 与渲染层菜单配置都必须与此一致） */
export const BALL_MENU_ITEM_COUNT = 6;

/** 菜单项中心到球心的距离 */
export const BALL_MENU_RING_RADIUS = 50;

/** 菜单项可点区域半径（shape 用；比视觉圆略大，留出点击宽容度） */
export const BALL_MENU_ITEM_RADIUS = 22;

/** 菜单项视觉圆半径（白底圆；渲染层用，应明显小于球的视觉半径 22 以保持层级） */
export const BALL_MENU_ITEM_VISUAL_RADIUS = 18;

/** 菜单打开后的几何信息：主进程计算并返回给渲染进程 */
export interface BallMenuGeometry {
  /** 窗口边长（= BALL_MENU_SIZE） */
  size: number;
  /** 球心在窗口内的坐标（屏幕边缘钳制后不一定等于 size/2） */
  centerX: number;
  centerY: number;
  ringRadius: number;
  itemRadius: number;
}

/**
 * 菜单项中心坐标（窗口坐标系），从正上方开始顺时针均匀分布。
 * 渲染层菜单项顺序必须与此返回顺序一致。
 */
export function ballMenuItemCenters(
  centerX: number,
  centerY: number,
  count: number = BALL_MENU_ITEM_COUNT,
  ringRadius: number = BALL_MENU_RING_RADIUS,
): Array<{ x: number; y: number }> {
  const centers: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = (-90 + (i * 360) / count) * (Math.PI / 180);
    centers.push({
      x: Math.round(centerX + ringRadius * Math.cos(angle)),
      y: Math.round(centerY + ringRadius * Math.sin(angle)),
    });
  }
  return centers;
}
