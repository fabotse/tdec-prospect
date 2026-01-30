"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Send, Settings, ChevronLeft, ChevronRight } from "lucide-react";

const TRANSITION_DURATION = 200;

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Leads", href: "/leads", icon: Users },
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

  return (
    <aside
      className="fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col z-20"
      style={{
        width: `${width}px`,
        transition: isHydrated ? `width ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
      }}
    >
      {/* Navigation area with padding-top to clear header (64px) + extra spacing (16px) */}
      <nav
        role="navigation"
        aria-label="Sidebar navigation"
        className="flex-1 flex flex-col pt-[80px] px-3"
      >
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center h-11 px-3 rounded-md
                    transition-colors duration-150
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar
                    ${isActive
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
          })}
        </ul>
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
              <span className="ml-2 text-body-small">
                Recolher
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
