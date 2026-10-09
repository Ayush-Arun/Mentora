import React, { useState } from 'react';
import { 
  Home, 
  Calendar, 
  ClipboardList, 
  GraduationCap, 
  Archive, 
  Settings,
  Menu,
  BookOpen
} from 'lucide-react';

export default function LeftRail({ activeNav = 'home', onNavSelect, isExpanded, toggleExpand }) {
  const [hoveredNav, setHoveredNav] = useState(null);

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'todo', label: 'To-do', icon: ClipboardList, badge: true },
    { id: 'teaching', label: 'Enrolled / Teaching', icon: GraduationCap },
    { id: 'archived', label: 'Archived classes', icon: Archive },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <>
      {/* Collapsed Rail (Width 64px) */}
      <div style={{
        width: isExpanded ? '240px' : '64px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid var(--google-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExpanded ? 'stretch' : 'center',
        paddingTop: '8px',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 90,
        position: 'relative',
        flexShrink: 0
      }}>
        {/* Menu Item Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', padding: '0 8px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const isHovered = hoveredNav === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavSelect && onNavSelect(item.id)}
                onMouseEnter={() => setHoveredNav(item.id)}
                onMouseLeave={() => setHoveredNav(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  width: '100%',
                  height: '48px',
                  padding: isExpanded ? '0 16px' : '0 12px',
                  justifyContent: isExpanded ? 'flex-start' : 'center',
                  backgroundColor: isActive 
                    ? '#e8f0fe' 
                    : isHovered 
                    ? '#f1f3f4' 
                    : 'transparent',
                  color: isActive ? '#1a73e8' : '#3c4043',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background-color 0.15s ease'
                }}
                title={item.label}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                  {item.badge && (
                    <span style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#1a73e8',
                      border: '2px solid #ffffff'
                    }} />
                  )}
                </div>

                {isExpanded && (
                  <span style={{
                    fontSize: '14px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
