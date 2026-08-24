"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LayoutList, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CategoryDialog } from "./category-dialog";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  toggleCategoryActiveAction,
} from "@/lib/actions/business/categories";
import { pickLocale } from "@/lib/i18n/localized";
import type { CategoryNode } from "@/lib/queries/business/catalog";
import { cn } from "@/lib/utils";

export type CategoryManagerProps = {
  categories: CategoryNode[];
  branches: { id: string; name: string }[];
  locales: string[];
  defaultLocale: string;
  currentLocale: string;
  canManage: boolean;
  labels: { category: string; categories: string; item: string };
};

/**
 * Drag-and-drop ordering with a keyboard path.
 *
 * `sortableKeyboardCoordinates` makes the list operable with arrow keys after
 * pressing space on a handle, so reordering is not mouse-only — the same reason
 * every handle carries an explicit aria-label.
 */
export function CategoryManager({
  categories,
  branches,
  locales,
  defaultLocale,
  currentLocale,
  canManage,
  labels,
}: CategoryManagerProps) {
  const router = useRouter();
  const [order, setOrder] = useState(categories);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CategoryNode | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setOrder(categories);
    setDirty(false);
  }, [categories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.findIndex((c) => c.id === active.id);
    const newIndex = order.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    setOrder(arrayMove(order, oldIndex, newIndex));
    setDirty(true);
  }

  function saveOrder() {
    startTransition(async () => {
      const result = await reorderCategoriesAction({
        orderedIds: order.map((c) => c.id),
      });
      if (result.ok) {
        toast.success(result.message ?? "Order saved");
        setDirty(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleActive(category: CategoryNode, isActive: boolean) {
    // Optimistic: the switch is a cheap, obviously-reversible change.
    setOrder((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, isActive } : c)),
    );
    startTransition(async () => {
      const result = await toggleCategoryActiveAction({
        categoryId: category.id,
        isActive,
      });
      if (!result.ok) {
        setOrder((prev) =>
          prev.map((c) =>
            c.id === category.id ? { ...c, isActive: !isActive } : c,
          ),
        );
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function remove(category: CategoryNode) {
    startTransition(async () => {
      const result = await deleteCategoryAction({
        categoryId: category.id,
        moveItemsTo: null,
      });
      if (result.ok) {
        toast.success(result.message ?? "Deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (order.length === 0) {
    return (
      <>
        <EmptyState
          icon={LayoutList}
          title={`No ${labels.categories.toLowerCase()} yet`}
          description={`${labels.categories} group your ${labels.item.toLowerCase()}s. Create the first one to get started.`}
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New {labels.category.toLowerCase()}
              </Button>
            ) : null
          }
        />
        {creating ? (
          <CategoryDialog
            open
            onOpenChange={setCreating}
            category={null}
            branches={branches}
            locales={locales}
            defaultLocale={defaultLocale}
            allCategories={order}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--foreground-muted)]">
          {canManage
            ? "Drag to reorder, or focus a handle and press space then the arrow keys."
            : "Read-only view."}
        </p>
        <div className="flex items-center gap-2">
          {dirty ? (
            <>
              <Badge tone="warning">Unsaved order</Badge>
              <Button size="sm" onClick={saveOrder} loading={pending}>
                Save order
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOrder(categories);
                  setDirty(false);
                }}
              >
                Discard
              </Button>
            </>
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New {labels.category.toLowerCase()}
            </Button>
          ) : null}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={order.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {order.map((category) => (
              <SortableRow
                key={category.id}
                category={category}
                canManage={canManage}
                currentLocale={currentLocale}
                defaultLocale={defaultLocale}
                branchNames={branches}
                labels={labels}
                onEdit={() => setEditing(category)}
                onToggle={(value) => toggleActive(category, value)}
                onDelete={() => remove(category)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {editing ? (
        <CategoryDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          category={editing}
          branches={branches}
          locales={locales}
          defaultLocale={defaultLocale}
          allCategories={order}
        />
      ) : null}

      {creating ? (
        <CategoryDialog
          open
          onOpenChange={setCreating}
          category={null}
          branches={branches}
          locales={locales}
          defaultLocale={defaultLocale}
          allCategories={order}
        />
      ) : null}
    </div>
  );
}

function SortableRow({
  category,
  canManage,
  currentLocale,
  defaultLocale,
  branchNames,
  labels,
  onEdit,
  onToggle,
  onDelete,
}: {
  category: CategoryNode;
  canManage: boolean;
  currentLocale: string;
  defaultLocale: string;
  branchNames: { id: string; name: string }[];
  labels: { category: string; item: string };
  onEdit: () => void;
  onToggle: (value: boolean) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    disabled: !canManage,
  });

  const name =
    pickLocale(category.name, currentLocale, defaultLocale) || category.slug;
  const scheduled =
    category.visibleFrom ||
    category.visibleUntil ||
    category.visibilitySchedule;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "surface-card flex flex-wrap items-center gap-3 p-3",
        isDragging && "z-10 opacity-90 shadow-[var(--shadow-raised)]",
      )}
    >
      {canManage ? (
        <button
          type="button"
          className="cursor-grab rounded p-1 text-[var(--foreground-subtle)] hover:bg-[var(--surface-muted)] active:cursor-grabbing"
          aria-label={`Reorder ${name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      {category.icon || category.imageUrl ? (
        <span
          className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-inset)] text-sm"
          style={
            category.color
              ? { backgroundColor: `${category.color}22` }
              : undefined
          }
        >
          {category.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={category.imageUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            category.icon
          )}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-xs text-[var(--foreground-subtle)]">
          /{category.slug} · {category.itemCount} {labels.item.toLowerCase()}
          {category.itemCount === 1 ? "" : "s"}
          {category.branchIds.length
            ? ` · ${category.branchIds
                .map((id) => branchNames.find((b) => b.id === id)?.name)
                .filter(Boolean)
                .join(", ")}`
            : " · all branches"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {scheduled ? <Badge tone="info">Scheduled</Badge> : null}
        {category.children.length ? (
          <Badge tone="neutral">{category.children.length} sub</Badge>
        ) : null}

        {canManage ? (
          <>
            <Switch
              checked={category.isActive}
              onCheckedChange={onToggle}
              tone="accent"
              aria-label={`${category.isActive ? "Hide" : "Show"} ${name}`}
            />
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onEdit}
              aria-label={`Edit ${name}`}
            >
              <Pencil />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={`Delete ${name}`}
                >
                  <Trash2 className="text-[var(--danger)]" />
                </Button>
              }
              title={`Delete ${name}?`}
              description={`This ${labels.category.toLowerCase()} is removed from your menu. Its ${labels.item.toLowerCase()}s are kept and become uncategorised — nothing is lost.`}
              confirmLabel="Delete"
              onConfirm={onDelete}
            />
          </>
        ) : (
          <Badge tone={category.isActive ? "success" : "neutral"}>
            {category.isActive ? "Visible" : "Hidden"}
          </Badge>
        )}
      </div>

      {category.children.length ? (
        <ul className="w-full space-y-1.5 ps-10">
          {category.children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm">
                {pickLocale(child.name, currentLocale, defaultLocale) ||
                  child.slug}
              </span>
              <Badge tone={child.isActive ? "success" : "neutral"}>
                {child.itemCount} {labels.item.toLowerCase()}
                {child.itemCount === 1 ? "" : "s"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
