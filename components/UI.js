import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, StyleSheet, useWindowDimensions, useColorScheme, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

// ---- Currency symbol lookup: falls back to the code itself + a space for anything not
// in this small common list, rather than guessing at a symbol that might be wrong. ----
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', THB: '฿' };

// Shared between Expenses and Activity — people recognize an expense by what it was
// before who paid for it. One definition, not two copies drifting apart.
export const CATEGORY_EMOJI = { Food: '🍔', Transport: '🚗', Stay: '🏨', Shopping: '🛍️', Other: '🧾' };
export function currencySymbol(code) {
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

// ---- Tablet support: layouts stay correct (flex-based, nothing hardcoded to phone
// width) at any size already — what tablets actually need on top of that is a content
// width cap, because a single-column phone layout stretched edge-to-edge across a 10"
// screen reads as broken, not "responsive." useIsTablet + Container below are the two
// pieces that fix that without a parallel tablet-specific layout to maintain. ----
export function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= theme.breakpoints.tablet;
}

// Wrap a screen's main content in this; it centers and caps width on tablets, and is a
// no-op (full width) on phones. One primitive instead of every screen reimplementing the
// same maxWidth/alignSelf check.
export function Container({ children, style, maxWidth = 640 }) {
  const isTablet = useIsTablet();
  return (
    <View style={[isTablet && { maxWidth, alignSelf: 'center', width: '100%' }, style]}>
      {children}
    </View>
  );
}

// ---- Design tokens ----
// TripNest Design System v1 — approved direction: calm over colorful, hierarchy over
// decoration, whitespace over borders, one accent color reserved for meaning (primary
// action, positive finance, success) rather than decoration. Every screen should read
// these tokens rather than hard-coding values, so a future re-theme is an edit here, not
// a find-and-replace across the app.
//
// Structural tokens (radius, spacing, type scale, weight, motion, a11y) don't change
// between light and dark — only the color values do. Split for that reason: one shared
// object, two color palettes, merged into lightTheme/darkTheme below.
const structuralTokens = {
  radius: { sm: 10, md: 16, lg: 20, xl: 26 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  breakpoints: { tablet: 768 },
  type: {
    hero: 25, title: 20, heading: 16, body: 15, label: 13, caption: 11.5,
  },
  // Weight ceiling: 600 max, everywhere. Nothing in this app should render at 700+ —
  // that was the "everything shouts" problem the design review called out. Body copy is
  // always 400; 600 is reserved for the one thing per screen that should draw the eye.
  weight: { regular: '400', medium: '500', semibold: '600' },

  // Motion: responsive, not theatrical. Every transition in the app should cite one of
  // these rather than picking a duration ad hoc.
  motion: {
    screenTransition: 240,
    sheet: 280,
    fabExpand: 180,
    cardPressScale: 0.98,
    successAnim: 380,
  },

  // Accessibility minimums — part of the design system, not a follow-up pass.
  a11y: {
    minTouchTarget: 48,
    minBodyFont: 15,
  },
};

const lightColors = {
  ink: '#14181C',
  inkSoft: '#414A55',
  inkMute: '#7B8695',
  surface: '#FFFFFF',
  bg: '#F7F8FA',
  line: '#E4E7EB',
  // Brand: a deeper, more distinct teal than the generic "fintech green" every expense-
  // splitting app defaults to — same calm register, less interchangeable with a competitor.
  brand: '#0E7C86',
  brandDeep: '#0B6169',
  brandWash: '#E3F4F5',
  accent: '#2563EB',
  accentWash: '#EFF4FF',
  danger: '#C2413A',
  dangerWash: '#FBEAE9',
  warn: '#B4790B',
  warnWash: '#FBF1E1',
  primary: '#0E7C86',
  primaryLight: '#E3F4F5',
  border: '#E4E7EB',
  muted: '#7B8695',
};

// Dark palette follows the same "calm, one accent" logic as light — not just an inverted
// light theme. Surfaces are dark neutrals (not pure black, which crushes contrast between
// stacked cards), the brand teal is lightened slightly so it stays legible at low ambient
// brightness, and wash colors become low-opacity tints instead of pale solids.
const darkColors = {
  ink: '#F1F3F5',
  inkSoft: '#C6CCD3',
  inkMute: '#8B939C',
  surface: '#1C2024',
  bg: '#121417',
  line: '#2C3136',
  brand: '#34A79A',
  brandDeep: '#3FBDAE',
  brandWash: '#1B3230',
  accent: '#5B9CF6',
  accentWash: '#1B2A40',
  danger: '#E5766D',
  dangerWash: '#3A2220',
  warn: '#E0A94B',
  warnWash: '#3A2E17',
  primary: '#34A79A',
  primaryLight: '#1B3230',
  border: '#2C3136',
  muted: '#8B939C',
};

export const lightTheme = { ...lightColors, ...structuralTokens };
export const darkTheme = { ...darkColors, ...structuralTokens };

// Static default export — kept so any file that hasn't migrated to useTheme() yet keeps
// working exactly as before (always light, same as pre-dark-mode behavior). Migrating a
// file means: import useTheme instead of theme, call const theme = useTheme() inside the
// component, and move its StyleSheet.create into a makeStyles(theme) factory called via
// useStyles() below.
export const theme = lightTheme;

// ---- Theme context: follows the OS light/dark setting via useColorScheme, no manual
// toggle UI yet (that's a reasonable next addition, not required for "supports dark mode"
// to be true — most users never override the system setting anyway). ----
const ThemeContext = React.createContext(lightTheme);

export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const value = scheme === 'dark' ? darkTheme : lightTheme;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

// ---- Card: the base surface every grouped piece of content sits on ----
export function Card({ children, style }) {
  const theme = useTheme();
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---- IconBadge: one consistent icon language everywhere, replacing raw emoji ----
// Feather icons only, same stroke weight, same circular badge — this is the fix for the
// "icon consistency" gap flagged in the engineering/UX review.
const ICON_MAP = {
  expense: 'dollar-sign', note: 'file-text', document: 'paperclip', itinerary: 'calendar',
  traveler: 'user', trip: 'flag', contribution: 'gift', draft: 'inbox',
  search: 'search', share: 'share-2', plan: 'map-pin', check: 'check', add: 'plus',
  settlement: 'check-circle', refund: 'arrow-down-circle', payOut: 'repeat',
};
export function IconBadge({ type, size = 36, tone = 'brand' }) {
  const theme = useTheme();
  const styles = useStyles();
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
export function StatHero({ label, value, sublabel, children, style }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.hero, style]}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      {sublabel && <Text style={styles.heroSublabel}>{sublabel}</Text>}
      {children}
    </View>
  );
}

// ---- SectionHeader ----
export function SectionHeader({ title, action, onAction }) {
  const theme = useTheme();
  const styles = useStyles();
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

// ---- ListRow: superseded by LedgerRow ----
// This component is dead code — nothing in the app imports it anymore now that every
// list has migrated to LedgerList/LedgerRow. Removed rather than left as an unused export,
// since an unused-but-present component is exactly the kind of duplication risk this
// audit was checking for: a second, slightly different row primitive that a future screen
// could accidentally reach for instead of the current one.

export function PrimaryButton({ label, onPress, style, icon }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress} activeOpacity={0.85}>
      {icon && <Feather name={icon} size={16} color="#fff" style={{ marginEnd: 6 }} />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---- SecondaryButton: same shape as Primary, neutral surface — for the second action on
// a screen that shouldn't compete with the one accent-colored primary action. ----
export function SecondaryButton({ label, onPress, style, icon }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity style={[styles.btnSecondary, style]} onPress={onPress} activeOpacity={0.85}>
      {icon && <Feather name={icon} size={16} color={theme.ink} style={{ marginEnd: 6 }} />}
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---- LedgerList / LedgerRow: the "professional ledger, not floating cards" pattern.
// One bordered container, hairline-divided rows inside — used for every repeated-record
// list in the app (expenses, notes, documents, travelers, trips). Pass `isLast` so the
// final row doesn't render a trailing divider.
export function LedgerList({ children, style }) {
  const theme = useTheme();
  const styles = useStyles();
  return <View style={[styles.ledgerList, style]}>{children}</View>;
}

export function LedgerRow({ onPress, children, icon, iconTone, actionLabel, onAction, actionColor, isLast }) {
  const theme = useTheme();
  const styles = useStyles();
  const content = (
    <View style={[styles.ledgerRow, !isLast && styles.ledgerRowDivider]}>
      {icon && <IconBadge type={icon} size={36} tone={iconTone} />}
      <View style={{ flex: 1, marginStart: icon ? 12 : 0 }}>{children}</View>
      {actionLabel && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.actionText, actionColor && { color: actionColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  if (!onPress) return content;
  return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
}

// ---- StatusChip: small labeled state indicator — pairs a color with a word, never color
// alone, per the accessibility rule (no information conveyed by color alone). ----
export function StatusChip({ label, tone = 'brand' }) {
  const theme = useTheme();
  const styles = useStyles();
  const bg = tone === 'danger' ? theme.dangerWash : tone === 'warn' ? theme.warnWash : theme.brandWash;
  const fg = tone === 'danger' ? theme.danger : tone === 'warn' ? theme.warn : theme.brandDeep;
  return (
    <View style={[styles.statusChip, { backgroundColor: bg }]}>
      <Text style={[styles.statusChipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ---- SearchBar: one consistent search input shape, used on Home and Search. ----
export function SearchBar({ value, onChangeText, placeholder = 'Search…', onSubmitEditing, autoFocus }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.searchBar}>
      <Feather name="search" size={16} color={theme.inkMute} />
      <TextInput
        style={styles.searchBarInput}
        placeholder={placeholder}
        placeholderTextColor={theme.inkMute}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
      />
    </View>
  );
}

// ---- Skeleton: loading placeholder for lists — replaces ad-hoc ActivityIndicator spinners
// for anything that's about to show a list, so the layout is visible before the data is. ----
export function SkeletonRow() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonIcon} />
      <View style={{ flex: 1 }}>
        <View style={[styles.skeletonLine, { width: '55%' }]} />
        <View style={[styles.skeletonLine, { width: '30%', marginTop: 6, backgroundColor: theme.bg }]} />
      </View>
    </View>
  );
}

export function SkeletonList({ rows = 3 }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <LedgerList>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={i < rows - 1 ? styles.ledgerRowDivider : null}>
          <SkeletonRow />
        </View>
      ))}
    </LedgerList>
  );
}

// ---- ConfirmDialog: the themed replacement for Alert.alert everywhere in the app ----
// The OS-native Alert cannot be restyled at all — it always renders in the platform's own
// system UI, not TripNest's. That's a direct conflict with "if someone sees any screen
// without the logo, they should still recognize it as TripNest" — a native Alert is the
// one moment that breaks the rule automatically, regardless of how consistent everything
// else is. This is a controlled Modal instead: same call shape (title, message, confirm/
// cancel), fully on-brand.
export function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {message && <Text style={styles.dialogMessage}>{message}</Text>}
          <View style={styles.dialogActions}>
            <TouchableOpacity style={styles.dialogBtnGhost} onPress={onCancel}>
              <Text style={styles.dialogBtnGhostText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dialogBtnSolid, destructive && styles.dialogBtnDanger]}
              onPress={onConfirm}
            >
              <Text style={styles.dialogBtnSolidText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---- BottomSheet: shared shell for Universal Capture and any future sheet — backdrop,
// rounded top sheet, drag handle. Feature content is passed as children. ----
export function BottomSheet({ visible, onClose, children }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
          <View style={styles.sheetCard} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            {children}
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---- ErrorState: what a screen shows when a load genuinely fails, instead of a blank
// screen or a silently-empty list. Distinct from EmptyState — this means "something went
// wrong," not "there's nothing here yet." ----
// ---- SuccessToast: the "did that actually work" feedback that was completely missing —
// saves happened instantly and silently, which reads as broken on a slower device even
// when it worked. Auto-dismisses; caller just flips `visible` true and forgets it. ----
export function SuccessToast({ trigger, message = 'Saved' }) {
  const theme = useTheme();
  const styles = useStyles();
  const [visible, setVisible] = React.useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(8)).current;

  React.useEffect(() => {
    if (trigger == null) return;
    setVisible(true);
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setVisible(false));
      }, theme.motion.successAnim);
    });
  }, [trigger]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <Feather name="check-circle" size={15} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

export function ErrorState({ title = 'Something went wrong', hint, onRetry }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Card style={{ padding: 20 }}>
      <View style={{ flexDirection: 'row' }}>
        <IconBadge type="check" size={44} tone="danger" />
        <View style={{ flex: 1, marginStart: 14 }}>
          <Text style={styles.emptyTitle}>{title}</Text>
          {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
          {onRetry && <SecondaryButton label="Try again" onPress={onRetry} style={{ marginTop: 12, alignSelf: 'flex-start' }} />}
        </View>
      </View>
    </Card>
  );
}

export function Chip({ label, active, onPress }) {
  const theme = useTheme();
  const styles = useStyles();
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
  const theme = useTheme();
  const styles = useStyles();
  // `text` kept as a fallback for any call site still using the old plain-string API.
  const heading = title || text;
  return (
    <Card style={{ padding: 20 }}>
      <View style={{ flexDirection: 'row' }}>
        {icon && <IconBadge type={icon} size={44} tone={tone} />}
        <View style={{ flex: 1, marginStart: icon ? 14 : 0 }}>
          <Text style={styles.emptyTitle}>{heading}</Text>
          {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
          {optional && <Text style={styles.emptyOptional}>This is optional — many trips never need it.</Text>}
          {cta && <PrimaryButton label={cta} onPress={onCta} style={{ marginTop: 12, alignSelf: 'flex-start' }} />}
        </View>
      </View>
    </Card>
  );
}

function useStyles() {
  const theme = useTheme();
  return React.useMemo(() => makeStyles(theme), [theme]);
}

const makeStyles = (theme) => StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.line,
  },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },
  hero: {
    backgroundColor: theme.brandDeep,
    borderRadius: theme.radius.xl,
    padding: theme.space.lg,
  },
  heroLabel: { color: 'rgba(255,255,255,0.72)', fontSize: theme.type.caption, fontWeight: theme.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroValue: { color: '#fff', fontSize: theme.type.hero, fontWeight: theme.weight.semibold, marginTop: 4, letterSpacing: -0.5 },
  heroSublabel: { color: 'rgba(255,255,255,0.65)', fontSize: theme.type.label, marginTop: 3 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  sectionHeaderText: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionAction: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.brandDeep },
  actionText: { color: theme.danger, fontWeight: '600', paddingStart: 10, fontSize: 12 },
  btn: { flexDirection: 'row', backgroundColor: theme.brandDeep, paddingHorizontal: 20, minHeight: theme.a11y.minTouchTarget, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: theme.weight.semibold, fontSize: theme.type.body },
  btnSecondary: { flexDirection: 'row', backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 20, minHeight: theme.a11y.minTouchTarget, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  btnSecondaryText: { color: theme.ink, fontWeight: theme.weight.semibold, fontSize: theme.type.body },
  ledgerList: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md, minHeight: theme.a11y.minTouchTarget },
  ledgerRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.sm },
  statusChipText: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, borderRadius: theme.radius.md, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget },
  searchBarInput: { flex: 1, fontSize: theme.type.body, color: theme.ink, paddingVertical: 10 },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md, gap: 12 },
  skeletonIcon: { width: 36, height: 36, borderRadius: theme.radius.sm, backgroundColor: theme.line },
  skeletonLine: { height: 10, borderRadius: 4, backgroundColor: theme.line },
  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(20,24,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: theme.space.xl },
  dialogCard: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.space.xl, width: '100%', maxWidth: 340 },
  dialogTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.2 },
  dialogMessage: { fontSize: theme.type.body, color: theme.inkSoft, marginTop: 8, lineHeight: 20 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm, marginTop: theme.space.xl },
  dialogBtnGhost: { minHeight: theme.a11y.minTouchTarget, paddingHorizontal: theme.space.lg, alignItems: 'center', justifyContent: 'center' },
  dialogBtnGhostText: { color: theme.inkSoft, fontWeight: theme.weight.semibold, fontSize: theme.type.body },
  dialogBtnSolid: { minHeight: theme.a11y.minTouchTarget, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.sm, backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center' },
  dialogBtnDanger: { backgroundColor: theme.danger },
  dialogBtnSolidText: { color: '#fff', fontWeight: theme.weight.semibold, fontSize: theme.type.body },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(20,24,28,0.4)', justifyContent: 'flex-end' },
  sheetCard: { backgroundColor: theme.surface, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.space.xl, paddingBottom: theme.space.xxl },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.line, alignSelf: 'center', marginBottom: theme.space.lg },
  toast: {
    position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.ink, borderRadius: theme.radius.sm, paddingVertical: 8, paddingHorizontal: 14,
  },
  toastText: { color: theme.bg, fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line, marginEnd: 8 },
  chipActive: { backgroundColor: theme.brandDeep, borderColor: theme.brandDeep },
  chipText: { color: theme.inkSoft, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  emptyTitle: { fontSize: 16, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.2 },
  emptyHint: { fontSize: 13.5, color: theme.inkMute, marginTop: 5, lineHeight: 19 },
  emptyOptional: { fontSize: 12, color: theme.inkMute, marginTop: 8, fontStyle: 'italic' },
});
