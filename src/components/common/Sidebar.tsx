"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useCallback, useRef, KeyboardEvent } from "react";
import {
  Users,
  Send,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Database,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TRANSITION_DURATION = 200;
const STORAGE_KEY = "sidebar-expanded";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  subItems?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Leads",
    href: "/leads",
    icon: Users,
    subItems: [
      { label: "Buscar", href: "/leads", icon: Search },
      { label: "Meus Leads", href: "/leads/my-leads", icon: Database },
    ],
  },
  { label: "Campanhas", href: "/campaigns", icon: Send },
  { label: "Configurações", href: "/settings", icon: Settings },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
  isHydrated: boolean;
}

export function Sidebar({ isCollapsed, onToggleCollapse, width, isHydrated }: SidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Ignore invalid JSON
        }
      }
    }
    return [];
  });
  const subItemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const prevPathname = useRef<string | null>(null);
  const hasInitialized = useRef(false);

  // Auto-expand submenu when navigating to a child route
  // Only triggers on actual pathname changes to prevent re-expand after manual collapse
  useEffect(() => {
    const pathnameChanged = prevPathname.current !== pathname;

    // Skip if pathname hasn't changed (except first render)
    if (!pathnameChanged && hasInitialized.current) {
      return;
    }
    prevPathname.current = pathname;

    // Find items with children that match current path and expand them
    const itemsToExpand = navItems
      .filter((item) => item.subItems?.some(
        (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)
      ))
      .map((item) => item.href);

    if (itemsToExpand.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing sidebar state with URL pathname
      setExpandedItems((prev) => {
        const newItems = itemsToExpand.filter((href) => !prev.includes(href));
        if (newItems.length === 0) return prev;

        const updated = [...prev, ...newItems];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }

    hasInitialized.current = true;
  }, [pathname]);

  // Cleanup refs on unmount to prevent memory leaks
  useEffect(() => {
    const refs = subItemRefs.current;
    return () => {
      refs.clear();
    };
  }, []);

  // Persist expanded state to localStorage
  const persistExpandedState = useCallback((items: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const toggleExpand = useCallback(
    (href: string) => {
      setExpandedItems((prev) => {
        const updated = prev.includes(href)
          ? prev.filter((h) => h !== href)
          : [...prev, href];
        persistExpandedState(updated);
        return updated;
      });
    },
    [persistExpandedState]
  );

  const isParentActive = (item: NavItem): boolean => {
    if (item.subItems) {
      return item.subItems.some(
        (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const isSubItemActive = (subItem: NavItem): boolean => {
    return pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, item: NavItem) => {
      if (e.key === "Escape" && item.subItems) {
        setExpandedItems((prev) => {
          const updated = prev.filter((h) => h !== item.href);
          persistExpandedState(updated);
          return updated;
        });
      }
    },
    [persistExpandedState]
  );

  const handleSubItemKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLAnchorElement>,
      item: NavItem,
      subItems: NavItem[],
      currentIndex: number
    ) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = currentIndex + 1;
        if (nextIndex < subItems.length) {
          const nextHref = subItems[nextIndex].href;
          subItemRefs.current.get(nextHref)?.focus();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = currentIndex - 1;
        if (prevIndex >= 0) {
          const prevHref = subItems[prevIndex].href;
          subItemRefs.current.get(prevHref)?.focus();
        }
      } else if (e.key === "Escape") {
        setExpandedItems((prev) => {
          const updated = prev.filter((h) => h !== item.href);
          persistExpandedState(updated);
          return updated;
        });
      }
    },
    [persistExpandedState]
  );

  const renderNavItem = (item: NavItem) => {
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isExpanded = expandedItems.includes(item.href);
    const isActive = isParentActive(item);
    const Icon = item.icon;
    // Remove leading slash and replace remaining slashes with dashes for clean ID
    const submenuId = `submenu-${item.href.replace(/^\//, "").replace(/\//g, "-")}`;

    if (hasSubItems) {
      // Render expandable nav item with subitems
      return (
        <li key={item.href}>
          {isCollapsed ? (
            // Collapsed: show tooltip with submenu
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={`
                      flex items-center justify-center w-full h-11 px-3 rounded-md
                      transition-colors duration-150
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
                      ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-sidebar-primary -ml-[3px] pl-[calc(0.75rem+3px)]"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-[3px] border-transparent -ml-[3px] pl-[calc(0.75rem+3px)]"
                      }
                    `}
                    aria-expanded={isExpanded}
                    aria-haspopup="menu"
                    aria-controls={submenuId}
                    aria-label={item.label}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" align="start" className="p-2 w-40">
                  <div className="font-medium mb-2">{item.label}</div>
                  <div className="flex flex-col gap-1">
                    {item.subItems!.map((subItem) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = isSubItemActive(subItem);
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`
                            flex items-center gap-2 px-2 py-1.5 rounded text-sm
                            ${
                              isSubActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "hover:bg-sidebar-accent/50"
                            }
                          `}
                          aria-current={isSubActive ? "page" : undefined}
                        >
                          <SubIcon className="h-4 w-4" />
                          {subItem.label}
                        </Link>
                      );
                    })}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            // Expanded sidebar: show expandable button with submenu
            <>
              <button
                type="button"
                onClick={() => toggleExpand(item.href)}
                onKeyDown={(e) => handleKeyDown(e, item)}
                className={`
                  flex items-center justify-between w-full h-11 px-3 rounded-md
                  transition-colors duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
                  ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-sidebar-primary -ml-[3px] pl-[calc(0.75rem+3px)]"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-[3px] border-transparent -ml-[3px] pl-[calc(0.75rem+3px)]"
                  }
                `}
                aria-expanded={isExpanded}
                aria-haspopup="menu"
                aria-controls={submenuId}
                aria-label={item.label}
              >
                <span className="flex items-center">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="ml-3 text-body font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                </span>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                )}
              </button>

              {/* Submenu - only render content when expanded for better test reliability */}
              {/* Animation duration-200 matches TRANSITION_DURATION constant (200ms) */}
              {isExpanded && (
                <div
                  id={submenuId}
                  className="animate-in slide-in-from-top-1 duration-200"
                >
                  <ul role="menu">
                    {item.subItems!.map((subItem, index) => {
                      const SubIcon = subItem.icon;
                      const isSubActive = isSubItemActive(subItem);
                      return (
                        <li key={subItem.href} role="none">
                          <Link
                            ref={(el) => {
                              if (el) {
                                subItemRefs.current.set(subItem.href, el);
                              }
                            }}
                            href={subItem.href}
                            role="menuitem"
                            className={`
                              flex items-center h-10 pl-8 pr-3 rounded-md
                              transition-colors duration-150 text-body-small
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
                              ${
                                isSubActive
                                  ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/30"
                              }
                            `}
                            aria-current={isSubActive ? "page" : undefined}
                            onKeyDown={(e) =>
                              handleSubItemKeyDown(e, item, item.subItems!, index)
                            }
                          >
                            <SubIcon className="h-4 w-4 shrink-0" />
                            <span className="ml-3 whitespace-nowrap">{subItem.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </li>
      );
    }

    // Regular nav item without subitems
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={`
            flex items-center h-11 px-3 rounded-md
            transition-colors duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
            ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-sidebar-primary -ml-[3px] pl-[calc(0.75rem+3px)]"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-[3px] border-transparent -ml-[3px] pl-[calc(0.75rem+3px)]"
            }
          `}
          aria-current={isActive ? "page" : undefined}
          title={isCollapsed ? item.label : undefined}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {!isCollapsed && (
            <span
              className="ml-3 text-body font-medium whitespace-nowrap"
              style={{
                opacity: 1,
                transition: `opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
            >
              {item.label}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside
      className="fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col z-20"
      style={{
        width: `${width}px`,
        transition: isHydrated
          ? `width ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`
          : "none",
      }}
    >
      {/* Navigation area with padding-top to clear header (64px) + extra spacing (16px) */}
      <nav
        role="navigation"
        aria-label="Sidebar navigation"
        className="flex-1 flex flex-col pt-[80px] px-3"
      >
        <ul className="flex flex-col gap-1">{navItems.map(renderNavItem)}</ul>
      </nav>

      {/* Collapse/Expand Button */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`
            flex items-center justify-center w-full h-11 rounded-md
            text-sidebar-foreground hover:bg-sidebar-accent/50
            transition-colors duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
          `}
          aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span className="ml-2 text-body-small">Recolher</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
