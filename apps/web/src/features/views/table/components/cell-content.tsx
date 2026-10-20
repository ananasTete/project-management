import type {
  Attachment,
  CellValue,
  RowHeight,
  SelectOption,
  TableColumn,
} from "@stack/shared";
import { cn } from "cn";
import { Paperclip } from "lucide-react";
import { optionColorClasses } from "../lib/palette";
import { ROW_HEIGHT_SPECS } from "../lib/row-height";

/**
 * 按列类型渲染单元格内容：渲染器由 type 决定（配置里没有函数，可整体 JSON 序列化）。
 * 值缺失/类型不符（历史脏数据）一律安全降级：空内容或回退样式，不抛错。
 *
 * 垂直布局契约：行高固定后垂直 padding 退役，统一用居中表达——
 * 各类型内容组件 h-full + items-center（文本/数字等单行内容随之居中），
 * 高度与裁剪由外层壳（table-cell.tsx 的固定高包装 div）统一执行，
 * 各类型只决定自己在壳内怎么摆（文本按档位多行省略、标签自由换行等）。
 */

/** 单选/多选的彩色标签；color 缺失或 token 非法时回退 gray */
function OptionTag({ option }: { option: SelectOption }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        optionColorClasses[option.color ?? "gray"] ?? optionColorClasses.gray,
      )}
    >
      {option.label}
    </span>
  );
}

function AttachmentChip({ file }: { file: Attachment }) {
  return (
    <span
      className="inline-flex max-w-40 items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground"
      title={file.name}
    >
      <Paperclip className="size-3 shrink-0" />
      <span className="truncate">{file.name}</span>
    </span>
  );
}

export function CellContent({
  column,
  value,
  rowHeight,
}: {
  column: TableColumn;
  value: CellValue | undefined;
  rowHeight: RowHeight;
}) {
  switch (column.type) {
    case "text":
    case "date":
      // break-words：长连续串（URL 等）也参与换行，否则会横向溢出被硬裁、无省略号；
      // 非字符串值（数组等脏数据）降级为空，不进 JSX 子节点；
      // line-clamp 类来自行高唯一真源（lib/row-height.ts），自带 overflow-hidden
      return (
        <div className="flex h-full items-center">
          <div
            className={cn("min-w-0 break-words", ROW_HEIGHT_SPECS[rowHeight].clampClass)}
          >
            {typeof value === "string" || typeof value === "number" ? value : ""}
          </div>
        </div>
      );
    case "number":
      return (
        <div className="flex h-full items-center justify-end">
          {typeof value === "number" ? (
            <span className="truncate tabular-nums">{value}</span>
          ) : null}
        </div>
      );
    case "singleSelect": {
      const option = column.options?.find((item) => item.id === value);
      return (
        <div className="flex h-full items-center">
          {option ? <OptionTag option={option} /> : null}
        </div>
      );
    }
    case "multiSelect": {
      const ids = (Array.isArray(value) ? value : []).filter(
        (item): item is string => typeof item === "string",
      );
      return (
        <div className="flex h-full flex-wrap items-center gap-1">
          {ids.flatMap((id) => {
            const option = column.options?.find((item) => item.id === id);
            return option ? [<OptionTag key={id} option={option} />] : [];
          })}
        </div>
      );
    }
    case "attachment": {
      const files = Array.isArray(value) ? (value as Array<Attachment>) : [];
      return (
        <div className="flex h-full flex-wrap items-center gap-1">
          {files.map((file) => (
            <AttachmentChip key={file.id} file={file} />
          ))}
        </div>
      );
    }
  }
}
