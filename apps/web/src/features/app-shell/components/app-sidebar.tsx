import type { TableMeta } from "@stack/shared";
import { cn } from "cn";
import {
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { useSession, useSignOut } from "#/features/auth";

interface AppSidebarProps {
  tables: Array<TableMeta>;
  activeTableId: string | null;
  creating: boolean;
  renaming: boolean;
  onSelect: (tableId: string) => void;
  onCreate: () => void;
  /** 返回是否成功（成功方关闭重命名对话框） */
  onRename: (tableId: string, name: string) => Promise<boolean>;
  onDelete: (tableId: string) => void;
}

/**
 * 应用侧边栏（收展规范见 best-practices/references/sidebar-collapse.md）：
 * - 容器仅 `transition-[width] duration-150`（w-64 ↔ w-14），禁止 transition-all；
 * - 侧栏内交互按钮一律 ghost 变体；
 * - 头部标题/表格列表为整块内容区：条件渲染 + 展开侧 `animate-in fade-in duration-150`；
 * - 收起/展开按钮互斥交叉淡入：收起态按钮 absolute left-3 固定偏移（w-14 轨道内居中），
 *   展开态按钮留在流内贴右；显隐挂在图标（svg）上（Button 基类 transition-all 会让
 *   隐藏侧的瞬时 opacity-0 变成 150ms 淡出，产生重影），隐藏侧 pointer-events-none + tabIndex=-1；
 * - 新建按钮、footer 头像为图标常驻型：固定 padding 链左锚定，且所有锚点统一在
 *   28px 中轴（= 收起轨道 w-14 的中心 = 展开态图标列轴），两态恒定、零横移、收起态居中；
 *   文字标签不对称淡入（收起瞬时 opacity-0，展开 150ms 淡入）；
 * - footer 整行是 DropdownMenu 触发器，退出登录在气泡菜单中（收起态点头像同样可开）。
 */
export function AppSidebar({
  tables,
  activeTableId,
  creating,
  renaming,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TableMeta | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TableMeta | null>(null);

  const { data: me } = useSession();
  const signOut = useSignOut();

  const openRename = (table: TableMeta) => {
    setRenameTarget(table);
    setRenameDraft(table.name);
  };

  const confirmRename = async () => {
    if (!renameTarget) {
      return;
    }
    const name = renameDraft.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    const ok = await onRename(renameTarget.id, name);
    if (ok) {
      setRenameTarget(null);
    }
  };

  /** 删除是危险操作，确认后才交给父层发请求（乐观更新在 mutation 内部） */
  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }
    onDelete(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        collapsed ? "w-14" : "w-64",
      )}
    >
      {/* 头部：标题块整块显隐；收起态的展开按钮 absolute left-3（12px），
          恰好居中于 w-14（56px）轨道，位置与宽度无关。
          显隐放在图标（svg）自身：Button 基类带 transition-all，若 opacity 挂在
          Button 上，隐藏侧没有 transition 类覆盖基类，瞬时隐藏会变成 150ms 淡出，
          与进场侧重叠成重影（视觉漂移） */}
      <div className="relative flex h-12 shrink-0 items-center gap-2 pl-3 pr-2">
        {!collapsed && (
          <div className="flex min-w-0 flex-1 animate-in fade-in items-center duration-150">
            <span className="truncate text-sm font-medium">数据表格</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="收起侧边栏"
          tabIndex={collapsed ? -1 : 0}
          className={cn("shrink-0", collapsed && "pointer-events-none")}
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftClose
            className={cn(
              "size-4",
              collapsed ? "opacity-0" : "opacity-100 transition-opacity duration-150",
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="展开侧边栏"
          tabIndex={collapsed ? 0 : -1}
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2",
            !collapsed && "pointer-events-none",
          )}
          onClick={() => setCollapsed(false)}
        >
          <PanelLeftOpen
            className={cn(
              "size-4",
              collapsed ? "opacity-100 transition-opacity duration-150" : "opacity-0",
            )}
          />
        </Button>
      </div>

      {/* 新建按钮：图标常驻型。外层 px-2 + 按钮 px-3 固定 padding 链，
          图标中心两态恒为 28px（收起轨道中轴），收展零横移且收起态居中；
          文字不对称淡入 + truncate */}
      <div className="px-2 pb-2">
        <Button
          variant="ghost"
          disabled={creating}
          onClick={onCreate}
          aria-label="新建表格"
          className="w-full justify-start overflow-hidden px-3"
        >
          <Plus className="size-4 shrink-0" />
          <span
            className={cn(
              "min-w-0 truncate",
              collapsed ? "opacity-0" : "opacity-100 transition-opacity duration-150",
            )}
          >
            新建表格
          </span>
        </Button>
      </div>

      {/* 表格列表：整块内容区（收起用占位撑住 flex，展开 150ms 入场淡入） */}
      {collapsed ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <nav className="min-h-0 flex-1 animate-in fade-in space-y-0.5 overflow-y-auto px-2 duration-150">
          {tables.length > 0 ? (
            tables.map((table) => (
              <SidebarItem
                key={table.id}
                table={table}
                active={table.id === activeTableId}
                onSelect={onSelect}
                onRename={openRename}
                onDelete={setDeleteTarget}
              />
            ))
          ) : (
            <p className="px-2 py-6 text-center text-xs text-sidebar-foreground/60">
              还没有表格
            </p>
          )}
        </nav>
      )}

      {/* footer：整行是气泡菜单触发器，退出登录移入菜单。头像常驻左锚定：
          外层 px-2 + 按钮内 pl-1 = 12px，中心恒为 28px（收起轨道中轴），
          两态零横移、收起态居中；姓名/邮箱为文字标签，不对称淡入 */}
      <div className="shrink-0 border-t px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={me ? `账户菜单：${me.name}` : "账户菜单"}
              className="flex h-10 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md pl-1 pr-2 text-left outline-none hover:bg-sidebar-accent/50 data-[state=open]:bg-sidebar-accent/50"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                {initialOf(me?.name)}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-0.5",
                  collapsed ? "opacity-0" : "opacity-100 transition-opacity duration-150",
                )}
              >
                <p className="truncate text-sm font-medium">{me?.name ?? "未登录"}</p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {me?.email ?? ""}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{me?.name ?? "未登录"}</p>
              <p className="truncate text-xs text-muted-foreground">{me?.email ?? ""}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 重命名对话框（侧边栏内部状态，成功由父层回调决定关闭） */}
      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名表格</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void confirmRename();
              }
            }}
            placeholder="表格名称"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button
              disabled={!renameDraft.trim() || renaming}
              onClick={() => void confirmRename()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框：删除不可撤销，须显式确认后才发起请求 */}
      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除表格</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.name}
              」吗？表格的列与行数据将一并删除，该操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/** 表格项：整行点击选中；文本占满整行，hover/菜单展开时右端以渐变遮罩 + "更多"按钮
 *  叠在文本上方浮现（ChatGPT 式，150ms 淡入，见 best-practices sidebar-collapse.md 节奏规范） */
function SidebarItem({
  table,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  table: TableMeta;
  active: boolean;
  onSelect: (tableId: string) => void;
  onRename: (table: TableMeta) => void;
  onDelete: (table: TableMeta) => void;
}) {
  // 菜单展开态需 JS 驱动遮罩显隐：下拉内容渲染在 body portal，悬停菜单时行已不处于 hover
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayVisible = menuOpen;

  return (
    <div
      className={cn(
        "group relative flex h-9 items-center rounded-md px-3 text-sm",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/50",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center text-left outline-none"
        onClick={() => onSelect(table.id)}
      >
        <span className="min-w-0 flex-1 truncate" title={table.name}>
          {table.name}
        </span>
      </button>
      {/* 渐变遮罩：右端 60% 完全不透明（盖死按钮下方文本），仅左侧 40% 渐隐。
          颜色取行背景的等效不透明色——行 hover 背景是 accent/50 半透明色，
          直接当遮罩会透出文字，故用 color-mix 与 sidebar 底色预合成（active 行本身是实底）。 */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-16 rounded-r-md bg-gradient-to-l from-60% to-transparent transition-opacity duration-150",
          active
            ? "from-sidebar-accent"
            : "from-[color-mix(in_oklab,var(--sidebar-accent)_50%,var(--sidebar))]",
          overlayVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`更多操作：${table.name}`}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 transition-opacity duration-150",
              overlayVisible
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onRename(table)}>
            <Pencil />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(table)}>
            <Trash2 />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function initialOf(name: string | undefined): ReactNode {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}
