import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, GripVertical } from "lucide-react";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  updateReport,
  getReportBlocks,
  addReportBlock,
  removeReportBlock,
  reorderReportBlocks,
} from "@/lib/db";
import { required } from "@/lib/validators";
import { showError } from "@/lib/toast";
import { BLOCK_LABELS } from "./blocks/BlockRenderer";
import { AddBlockMenu } from "./AddBlockMenu";
import type { Report, ReportBlock } from "@/lib/types";

interface ReportModalProps {
  report: Report;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportChange: (report: Report) => void;
}

export function ReportModal({ report, open, onOpenChange, onReportChange }: ReportModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(report);
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { save: saveName, error: nameError } = useAutoSave({
    onSave: async (val) => {
      await updateReport(report.id, "name", val);
      const updated = { ...local, name: val ?? "" };
      setLocal(updated);
      onReportChange(updated);
    },
    validate: required("Report name"),
  });

  const loadBlocks = useCallback(async () => {
    try {
      const b = await getReportBlocks(report.id);
      setBlocks(b);
    } catch {
      showError("Failed to load blocks");
    }
  }, [report.id]);

  useEffect(() => {
    setLocal(report);
  }, [report]);

  useEffect(() => {
    if (open) {
      loadBlocks();
      setTimeout(() => {
        nameRef.current?.focus();
        nameRef.current?.select();
      }, 100);
    }
  }, [open, loadBlocks]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocal((prev) => ({ ...prev, name: newVal }));
    saveName(newVal === "" ? null : newVal);
  };

  const handleToggle = async (
    field: "collect_statuses" | "include_stakeholders" | "include_projects",
    checked: boolean,
  ) => {
    const value = checked ? "1" : "0";
    try {
      await updateReport(report.id, field, value);
      const updated = { ...local, [field]: checked };
      setLocal(updated);
      onReportChange(updated);
    } catch {
      showError("Failed to update setting");
    }
  };

  const handleAddBlock = async (blockType: string) => {
    try {
      await addReportBlock(report.id, blockType);
      await loadBlocks();
    } catch {
      showError("Failed to add block");
    }
  };

  const handleRemoveBlock = async (blockId: number) => {
    try {
      await removeReportBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    } catch {
      showError("Failed to remove block");
    }
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...blocks];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setBlocks(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = async () => {
    setDragIdx(null);
    try {
      await reorderReportBlocks(
        report.id,
        blocks.map((b) => b.id),
      );
    } catch {
      showError("Failed to reorder blocks");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Report Name</Label>
            <Input
              ref={nameRef}
              value={local.name}
              onChange={handleNameChange}
              aria-invalid={!!nameError || undefined}
            />
            <div className="h-3 text-xs">
              {nameError && <span className="text-destructive truncate">{nameError}</span>}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Collect member statuses</Label>
              <Switch
                checked={local.collect_statuses}
                onCheckedChange={(c) => handleToggle("collect_statuses", c)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Include stakeholders</Label>
              <Switch
                checked={local.include_stakeholders}
                onCheckedChange={(c) => handleToggle("include_stakeholders", c)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Include projects</Label>
              <Switch
                checked={local.include_projects}
                onCheckedChange={(c) => handleToggle("include_projects", c)}
              />
            </div>
          </div>

          {/* Blocks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Blocks</Label>
              <AddBlockMenu
                existingBlockTypes={blocks.map((b) => b.block_type)}
                onAdd={handleAddBlock}
              />
            </div>

            {blocks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No blocks yet. Add blocks to build your report.
              </p>
            ) : (
              <ul className="space-y-1">
                {blocks.map((block, idx) => (
                  <li
                    key={block.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      dragIdx === idx ? "opacity-50" : ""
                    }`}
                  >
                    <GripVertical className="size-4 text-muted-foreground cursor-grab shrink-0" />
                    <span className="flex-1">
                      {BLOCK_LABELS[block.block_type] ?? block.block_type}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveBlock(block.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
