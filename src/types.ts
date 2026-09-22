/** Точка у тривимірному просторі (міжнародна система, вісь Y спрямована вглиб, Z — вгору). */
export interface GeoPoint {
  id: string
  /** Позначення точки, напр. "A". */
  name: string
  x: number
  y: number
  z: number
  /** Номер групи (окремої прямої); точки з однаковим group утворюють ламану одного кольору. */
  group: number
}

/** Пара індексів суміжних точок ламаної (відрізок A-B, B-C, ...). */
export interface SegmentRef {
  fromIndex: number
  toIndex: number
}

/** Відрізок разом із аналітичним описом. */
export interface SegmentAnalysis {
  from: GeoPoint
  to: GeoPoint
  /** Позначення, напр. "AB". */
  label: string
  /** Проєкції різниці координат. */
  dx: number
  dy: number
  dz: number
  /** Натуральна довжина: sqrt(dx^2 + dy^2 + dz^2). */
  length: number
  /** Довжина горизонтальної (П1) проєкції: sqrt(dx^2 + dy^2). */
  lengthP1: number
  /** Довжина фронтальної (П2) проєкції: sqrt(dx^2 + dz^2). */
  lengthP2: number
  /** Довжина профільної (П3) проєкції: sqrt(dy^2 + dz^2). */
  lengthP3: number
  /** Кути до площин проєкцій у градусах (α — до П1, β — до П2, γ — до П3). */
  angleToP1: number
  angleToP2: number
  angleToP3: number
  position: SegmentPosition
  positionLabel: string
  /** Сліди прямої — точки перетину прямої з площинами проєкцій. */
  traces: LineTrace[]
}

/** Слід прямої на площині проєкцій (точка, де пряма протикає площину). */
export interface LineTrace {
  /** Площина проєкцій. */
  plane: 'П1' | 'П2' | 'П3'
  /** Координата, що дорівнює 0 у точці сліду. */
  zeroCoord: 'x' | 'y' | 'z'
  /** Параметр прямої (0 — початок, 1 — кінець); чи лежить слід у межах відрізка. */
  t: number
  onSegment: boolean
  x: number
  y: number
  z: number
  /** Позначення сліду, напр. "M₁". */
  label: string
}

/** Класифікація положення прямої (відрізка) у просторі. */
export type SegmentPosition =
  | 'лог'
  | 'горизонталь'
  | 'фронталь'
  | 'профільна'
  | 'проєціювальна-П1'
  | 'проєціювальна-П2'
  | 'проєціювальна-П3'
  | 'нульова'

/** Якій координаті дорівнює 0: яка умова визначає точку на площині/осі. */
export interface PlaneMembership {
  /** "П1", "П2", "П3". */
  plane: string
  /** Назва площини українською. */
  label: string
  /** Зафіксована координата (з дорівнює 0 для П1, тощо). */
  zeroCoord: 'x' | 'y' | 'z'
}

export interface AxisMembership {
  axis: 'Ox' | 'Oy' | 'Oz'
  label: string
  zeroCoords: Array<'x' | 'y' | 'z'>
}

export type CompetingKind =
  | 'горизонтально-конкуруючі (П1)'
  | 'фронтально-конкуруючі (П2)'
  | 'профільно-конкуруючі (П3)'

export interface CompetingPair {
  kind: CompetingKind
  /** Індекси точок у поточному списку. */
  aIndex: number
  bIndex: number
  a: GeoPoint
  b: GeoPoint
  /** Опис, яка точка закриває яку для спостерігача. */
  description: string
}

/** Повний звіт аналітики за набором точок. */
export interface AnalysisReport {
  pointCount: number
  segments: SegmentAnalysis[]
  totalLength: number | null
  /** Точки, що лежать на площинах проєкцій. */
  onPlanes: Array<{ point: GeoPoint; memberships: PlaneMembership[] }>
  /** Точки, що лежать на осях координат. */
  onAxes: Array<{ point: GeoPoint; memberships: AxisMembership[] }>
  /** Пари конкуруючих точок. */
  competing: CompetingPair[]
}

export type PresetId = 'polyline6' | 'triangle' | 'onPlanes'

export interface Preset {
  id: PresetId
  label: string
  points: GeoPoint[]
}