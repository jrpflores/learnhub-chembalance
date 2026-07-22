"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type ActionMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
};

type ActionMenuGroup = {
  items: ActionMenuItem[];
};

type ActionMenuProps = {
  label?: string;
  groups: ActionMenuGroup[];
  className?: string;
  buttonClassName?: string;
  iconTrigger?: boolean;
  ariaLabel?: string;
};

const VIEWPORT_PADDING = 8;
const MENU_GAP = 8;
const ITEM_HEIGHT = 48;

function estimateMenuHeight(groups: ActionMenuGroup[]) {
  const itemCount = groups.reduce((sum, group) => sum + group.items.length, 0);
  const dividerCount = Math.max(0, groups.length - 1);
  return Math.max(ITEM_HEIGHT, itemCount * ITEM_HEIGHT + dividerCount);
}

export function ActionMenu({
  label = "Options",
  groups,
  className,
  buttonClassName,
  iconTrigger = true,
  ariaLabel = "Open actions",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const defaultWidth = iconTrigger ? 256 : Math.max(240, rect.width);
      const menuWidth = Math.min(defaultWidth, window.innerWidth - VIEWPORT_PADDING * 2);

      let left = iconTrigger ? rect.right - menuWidth : rect.left;
      left = Math.max(
        VIEWPORT_PADDING,
        Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PADDING),
      );

      const measuredHeight = menuRef.current?.offsetHeight ?? 0;
      const preferredHeight = measuredHeight > 0 ? measuredHeight : estimateMenuHeight(groups);
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING;
      const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PADDING;
      const openUpward = preferredHeight > spaceBelow && spaceAbove > spaceBelow;

      if (openUpward) {
        // Anchor to trigger top so short menus stay next to the button (not viewport top).
        setMenuStyle({
          position: "fixed",
          top: "auto",
          bottom: window.innerHeight - rect.top + MENU_GAP,
          left,
          width: menuWidth,
          maxHeight: Math.max(120, spaceAbove),
          zIndex: 200,
        });
        return;
      }

      setMenuStyle({
        position: "fixed",
        top: rect.bottom + MENU_GAP,
        bottom: "auto",
        left,
        width: menuWidth,
        maxHeight: Math.max(120, spaceBelow),
        zIndex: 200,
      });
    }

    updatePosition();
    // Remeasure after paint so actual menu height drives flip/clamp.
    const frame = window.requestAnimationFrame(updatePosition);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, iconTrigger, groups]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            style={menuStyle ?? { position: "fixed", visibility: "hidden", zIndex: 200 }}
            className="overflow-auto rounded-xl border border-[var(--line-300)] bg-white shadow-xl"
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            {groups.map((group, groupIndex) => (
              <div key={`action-group-${groupIndex}`} className={groupIndex > 0 ? "border-t border-[var(--line-200)]" : ""}>
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (item.disabled) {
                        return;
                      }
                      item.onSelect();
                      setOpen(false);
                    }}
                    disabled={item.disabled}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-[var(--line-100)] disabled:cursor-not-allowed disabled:opacity-50",
                      item.tone === "danger" ? "text-[var(--danger-600)]" : "text-[var(--ink-800)]",
                    )}
                  >
                    {item.icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={cn(iconTrigger ? "ml-auto w-auto" : "w-full sm:w-auto", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            iconTrigger
              ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white text-[var(--ink-700)] transition hover:bg-[var(--line-100)]"
              : "inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-900)] transition hover:bg-[var(--line-100)] sm:w-auto",
            buttonClassName,
          )}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={iconTrigger ? ariaLabel : undefined}
        >
          {iconTrigger ? (
            <MoreVertical className="h-4 w-4" />
          ) : (
            <>
              {label}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "")} />
            </>
          )}
        </button>
        {menu}
      </div>
    </div>
  );
}
