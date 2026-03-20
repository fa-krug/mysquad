import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { buildChildrenMap } from "@/lib/tree-utils";
import { copyToClipboard } from "@/lib/clipboard";
import type { TeamMember } from "@/lib/types";
import { MemberAvatar } from "./MemberAvatar";

interface OrgChartProps {
  members: TeamMember[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  picturesDir: string | null;
}

interface TreeNode {
  member: TeamMember;
  children: TreeNode[];
}

function buildTree(members: TeamMember[]): TreeNode[] {
  const active = members.filter((m) => !m.left_date);
  const childrenMap = buildChildrenMap(active);
  const activeIds = new Set(active.map((m) => m.id));

  function buildNode(member: TeamMember): TreeNode {
    const rawChildren = childrenMap.get(member.id) ?? [];
    const children = [...rawChildren]
      .sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
      )
      .map(buildNode);
    return { member, children };
  }

  // Roots: active members whose lead_id is null or points to a non-active member
  const roots = active
    .filter((m) => !m.lead_id || !activeIds.has(m.lead_id))
    .sort((a, b) =>
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
    )
    .map(buildNode);

  return roots;
}

interface NodeCardProps {
  node: TreeNode;
  selectedId: number | null;
  onSelect: (id: number) => void;
  picturesDir: string | null;
}

function NodeCard({ node, selectedId, onSelect, picturesDir }: NodeCardProps) {
  const isSelected = node.member.id === selectedId;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className={`cursor-pointer rounded-lg border p-3 flex flex-col items-center gap-1 w-32 text-center shadow-sm transition-colors
          ${isSelected ? "border-primary bg-muted" : "border-border bg-card hover:bg-muted/50"}`}
        onClick={() => onSelect(node.member.id)}
      >
        <MemberAvatar
          firstName={node.member.first_name}
          lastName={node.member.last_name}
          picturePath={node.member.picture_path}
          picturesDir={picturesDir}
          size="sm"
        />
        <div
          className="text-xs font-medium leading-tight truncate w-full cursor-pointer hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(`${node.member.first_name} ${node.member.last_name}`);
          }}
        >
          {node.member.first_name} {node.member.last_name}
        </div>
        {node.member.current_title_name && (
          <div
            className="text-[10px] text-muted-foreground leading-tight truncate w-full cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(node.member.current_title_name!);
            }}
          >
            {node.member.current_title_name}
          </div>
        )}
      </div>

      {/* Children subtree */}
      {node.children.length > 0 && (
        <>
          {/* Vertical line down from card */}
          <div className="w-px h-6 bg-border" />
          <div className="relative flex gap-6">
            {/* Horizontal connector bar spanning from center of first to center of last child */}
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-border left-[calc(50%/var(--n))] right-[calc(50%/var(--n))]"
                style={{ "--n": node.children.length } as React.CSSProperties}
              />
            )}
            {node.children.map((child) => (
              <div key={child.member.id} className="flex flex-col items-center flex-1">
                {/* Vertical stub up from child to horizontal bar */}
                <div className="w-px h-6 bg-border" />
                <NodeCard
                  node={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  picturesDir={picturesDir}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChart({ members, selectedId, onSelect, picturesDir }: OrgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const roots = useMemo(() => buildTree(members), [members]);

  // Fit to view
  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerRect = container.getBoundingClientRect();
    // Measure content at scale=1
    const contentW = content.scrollWidth;
    const contentH = content.scrollHeight;

    if (contentW === 0 || contentH === 0) return;

    const padding = 32;
    const scaleX = (containerRect.width - padding * 2) / contentW;
    const scaleY = (containerRect.height - padding * 2) / contentH;
    const newScale = Math.min(scaleX, scaleY, 1);

    const scaledW = contentW * newScale;
    const scaledH = contentH * newScale;
    const tx = (containerRect.width - scaledW) / 2;
    const ty = (containerRect.height - scaledH) / 2;

    setScale(newScale);
    setTranslate({ x: tx, y: ty });
  }, []);

  // Fit on mount
  useEffect(() => {
    // Wait for content to render
    const id = setTimeout(fitToView, 50);
    return () => clearTimeout(id);
  }, [fitToView, roots]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 5));
  }, []);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
  }, []);

  if (roots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No active team members
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Pan/zoom wrapper */}
      <div
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          display: "inline-flex",
          gap: "3rem",
          padding: "1rem",
        }}
        ref={contentRef}
      >
        {roots.map((root) => (
          <NodeCard
            key={root.member.id}
            node={root}
            selectedId={selectedId}
            onSelect={onSelect}
            picturesDir={picturesDir}
          />
        ))}
      </div>

      {/* Fit button */}
      <button
        className="absolute bottom-3 right-3 px-2 py-1 text-xs rounded border border-border bg-background text-muted-foreground hover:bg-muted transition-colors shadow-sm"
        onClick={fitToView}
      >
        Fit
      </button>
    </div>
  );
}
