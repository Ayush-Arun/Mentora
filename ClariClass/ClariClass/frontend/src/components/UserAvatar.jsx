import React from 'react';

const GRADIENTS = [
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Blue
  'linear-gradient(135deg, #10b981 0%, #047857 100%)', // Emerald
  'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)', // Amber
  'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', // Purple
  'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', // Pink
  'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)', // Cyan
  'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)', // Indigo
  'linear-gradient(135deg, #f97316 0%, #c2410c 100%)', // Orange
];

export function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getGradientForName(name) {
  if (!name) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

export default function UserAvatar({ 
  name = 'User', 
  avatarUrl = null, 
  size = 36, 
  className = '', 
  style = {},
  showStatus = false,
  statusColor = '#22c55e'
}) {
  const initials = getInitials(name);
  const gradient = getGradientForName(name);

  return (
    <div
      className={`user-avatar ${className}`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: avatarUrl ? '#e2e8f0' : gradient,
        color: '#ffffff',
        fontWeight: 700,
        fontSize: Math.max(10, Math.floor(size * 0.38)),
        letterSpacing: '0.02em',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        border: '2px solid #ffffff',
        overflow: 'hidden',
        userSelect: 'none',
        ...style
      }}
      title={name}
    >
      {avatarUrl ? (
        <img 
          src={avatarUrl} 
          alt={name} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            // Fallback to initials if image fails to load
            e.target.style.display = 'none';
          }}
        />
      ) : (
        <span>{initials}</span>
      )}

      {showStatus && (
        <span
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.max(7, Math.floor(size * 0.26)),
            height: Math.max(7, Math.floor(size * 0.26)),
            borderRadius: '50%',
            backgroundColor: statusColor,
            border: '1.5px solid #ffffff'
          }}
        />
      )}
    </div>
  );
}
