import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

// ---- Design tokens ----
// Translated from the mentor's reference design (colors, radius, shadow language) — not
// copied code, since that project is a different stack (React+Capacitor), but the same
// visual decisions: a real ink/surface/brand palette instead of one flat teal, larger
// rounded corners, and a defined type scale so text sizes stop being picked ad hoc per screen.
export const theme = {
  ink: '#0B0F14',
  inkSoft: '#414A55',
  inkMute: '#7B8695',
  surface: '#FFFFFF',
  bg: '#F5F7F9',
  line: '#E6E9ED',
  brand: '#059669',
  brandDeep: '#047857',
  brandWash: '#ECFDF5',
  accent: '#2563EB',
  accentWash: '#EFF4FF',
  danger: '#E5484D',
  dangerWash: '#FDECEC',
  warn: '#B4790B',

  // Legacy aliases so nothing else in the app breaks while every screen migrates gradually —
  // primary/primaryLight/border/muted were the old names used everywhere before this pass.
  primary: '#059669',
  primaryLight: '#ECFDF5',
  border: '#E6E9ED',
  muted: '#7B8695',

  radius: { sm: 10, md: 16, lg: 20, xl: 26 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  type: {
    hero: 40, title: 24, heading: 17, body: 15, label: 13, caption: 11.5,
  },
};

// ---- Card: the base surface every grouped piece of content sits on ----
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---- IconBadge: one consistent icon language everywhere, replacing raw emoji ----
// Feather icons only, same stroke weight, same circular badge — this is the fix for the
// "icon consistency" gap flagged in the engineering/UX review.
const ICON_MAP = {
  expense: 'dollar-sign', note: 'file-text', document: 'paperclip', itinerary: 'calendar',
  traveler: 'user', trip: 'flag', contribution: 'gift', draft: 'inbox',
  search: 'search', share: 'share-2', plan: 'map-pin', check: 'check', add: 'plus',
};
export function IconBadge({ type, size = 36, tone = 'brand' }) {
  const bg = tone === 'accent' ? theme.accentWash : tone === 'danger' ? theme.dangerWash : theme.brandWash;
  const fg = tone === 'accent' ? theme.accent : tone === 'danger' ? theme.danger : theme.brandDeep;
  return (
    <View style={[styles.iconBadge, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg }]}>
      <Feather name={ICON_MAP[type] || 'circle'} size={size * 0.48} color={fg} />
    </View>
  );
}

// ---- StatHero: the "one number that answers the main question" pattern ----
// Every screen used to give every stat equal visual weight. This makes the single most
// important number dominate, with everything else demoted to caption size beneath it.
export function StatHero({ label, value, sublabel, children }) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {sublabel && <Text style={styles.heroSublabel}>{sublabel}</Text>}
      {children}
    </View>
  );
}

// ---- SectionHeader ----
export function SectionHeader({ title, action, onAction }) {
  if (!title && !action) return null;
  return (
    <View style={styles.sectionHeaderRow}>
      {title && <Text style={styles.sectionHeaderText}>{title}</Text>}
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---- ListRow ----
export function ListRow({ onPress, children, actionLabel, onAction, actionColor, icon, iconTone }) {
  return (
    <View style={styles.row}>
      {icon && <IconBadge type={icon} size={34} tone={iconTone} />}
      <TouchableOpacity style={{ flex: 1, marginLeft: icon ? 12 : 0 }} onPress={onPress} disabled={!onPress}>
        {children}
      </TouchableOpacity>
      {actionLabel && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.actionText, actionColor && { color: actionColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function PrimaryButton({ label, onPress, style, icon }) {
  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress}>
      {icon && <Feather name={icon} size={16} color="#fff" style={{ marginRight: 6 }} />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---- EmptyState: guided, not just "no items yet" ----
// The mentor reference's core insight, worth adopting directly: an empty state's job isn't
// to report emptiness, it's to explain when the feature matters and whether it's optional,
// then offer the one action that resolves it. Plain "No X yet" text answers none of that.
export function EmptyState({ icon, title, hint, optional, cta, onCta, tone = 'brand', text }) {
  // `text` kept as a fallback for any call site still using the old plain-string API.
  const heading = title || text;
  return (
    <Card style={{ padding: 20 }}>
      <View style={{ flexDirection: 'row' }}>
        {icon && <IconBadge type={icon} size={44} tone={tone} />}
        <View style={{ flex: 1, marginLeft: icon ? 14 : 0 }}>
          <Text style={styles.emptyTitle}>{heading}</Text>
          {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
          {optional && <Text style={styles.emptyOptional}>This is optional — many trips never need it.</Text>}
          {cta && <PrimaryButton label={cta} onPress={onCta} style={{ marginTop: 12, alignSelf: 'flex-start' }} />}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.line,
    shadowColor: '#0B0F14', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  hero: {
    backgroundColor: theme.brandDeep,
    borderRadius: theme.radius.xl,
    padding: theme.space.xl,
    shadowColor: theme.brand, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroLabel: { color: 'rgba(255,255,255,0.72)', fontSize: theme.type.caption, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: '#fff', fontSize: theme.type.hero, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  heroSublabel: { color: 'rgba(255,255,255,0.65)', fontSize: theme.type.label, marginTop: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  sectionHeaderText: { fontSize: theme.type.label, fontWeight: '700', color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionAction: { fontSize: theme.type.label, fontWeight: '700', color: theme.brandDeep },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  actionText: { color: theme.danger, fontWeight: '600', paddingLeft: 10, fontSize: 12 },
  btn: { flexDirection: 'row', backgroundColor: theme.brandDeep, paddingHorizontal: 18, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: theme.type.body },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, marginRight: 8 },
  chipActive: { backgroundColor: theme.brandDeep, borderColor: theme.brandDeep },
  chipText: { color: theme.inkSoft, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.ink, letterSpacing: -0.2 },
  emptyHint: { fontSize: 13.5, color: theme.inkMute, marginTop: 5, lineHeight: 19 },
  emptyOptional: { fontSize: 12, color: theme.inkMute, marginTop: 8, fontStyle: 'italic' },
});
