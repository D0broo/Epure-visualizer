/** Палітра кольорів для груп точок (окремих прямих). */
export const GROUP_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
]

export const groupColor = (g: number): string => GROUP_COLORS[((g % GROUP_COLORS.length) + GROUP_COLORS.length) % GROUP_COLORS.length]

export const groupLabel = (g: number): string => `пряма ${g + 1}`