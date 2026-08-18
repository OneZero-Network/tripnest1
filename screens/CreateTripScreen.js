import React, {useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getDB, logTimelineEvent } from '../db';
import { PrimaryButton, IconBadge, Chip, useTheme } from '../components/UI';

const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB'];

// HOOK: this screen's job is momentum, not data entry. The design brief is explicit —
// "only asks Trip Name + Travelers, everything else comes later" — because every extra
// field here is a chance for the organizer to close the app and never come back. Adding
// travelers right after naming the trip is the hook: it turns an abstract trip into a
// concrete group of real people before the organizer has invested any real effort.
export default function CreateTripScreen({ navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [travelerInput, setTravelerInput] = useState('');
  const [travelers, setTravelers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [hasTripBank, setHasTripBank] = useState(false);
  const [contributionAmounts, setContributionAmounts] = useState({}); // { travelerName: '500' }
  const [nameError, setNameError] = useState(false);
  const [contributionErrors, setContributionErrors] = useState({}); // { travelerName: true }
  const totalContributions = Object.values(contributionAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const [tripType, setTripType] = useState('domestic');
  const [foreignCurrency, setForeignCurrency] = useState('');
  const [exchangeRows, setExchangeRows] = useState([]); // [{ fromAmount, toAmount }]
  const [exFrom, setExFrom] = useState('');
  const [exTo, setExTo] = useState('');
  const totalExchanged = exchangeRows.reduce((s, r) => s + (parseFloat(r.toAmount) || 0), 0);

  const addTraveler = () => {
    const trimmed = travelerInput.trim();
    if (!trimmed) return;
    if (travelers.some((t) => t.toLowerCase() === trimmed.toLowerCase())) { setTravelerInput(''); return; }
    setTravelers((prev) => [...prev, trimmed]);
    setTravelerInput('');
  };

  const removeTraveler = (t) => setTravelers((prev) => prev.filter((x) => x !== t));

  const createTrip = async () => {
    if (saving) return;
    if (!name.trim()) { setNameError(true); return; }
    setNameError(false);
    // A negative contribution isn't a typo the engine can quietly absorb — it would
    // silently invert someone's Trip Bank balance (looking like they're owed money for
    // "contributing" a negative amount). Catch it here, on the exact field, rather than
    // downstream in a confusing settlement number with no visible cause.
    if (hasTripBank) {
      const bad = {};
      travelers.forEach((t) => {
        const v = parseFloat(contributionAmounts[t]);
        if (contributionAmounts[t] && (isNaN(v) || v < 0)) bad[t] = true;
      });
      if (Object.keys(bad).length > 0) { setContributionErrors(bad); return; }
    }
    setContributionErrors({});
    // International trips need a foreign currency picked before they're worth anything —
    // an "International" trip with no currency to convert into can't compute a wallet
    // balance, so this is required exactly the way "Trip name" is.
    if (tripType === 'international' && !foreignCurrency) { return; }
    setSaving(true);
    const db = await getDB();
    const id = String(Date.now());
    const ts = Date.now();
    // Wrapped in a transaction: trip creation is really one atomic action (trip + its
    // travelers + the timeline entry), not three independent writes. Without this, killing
    // the app mid-loop (common on memory-constrained Android devices) could leave a trip
    // row with only some of its travelers inserted, with no signal that it happened.
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO trips (id, name, base_currency, has_trip_bank, trip_type, foreign_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, name.trim(), baseCurrency, hasTripBank ? 1 : 0, tripType, tripType === 'international' ? foreignCurrency : null, ts);
        for (const t of travelers) {
          const tid = String(Date.now()) + Math.random().toString(36).slice(2);
          await db.runAsync('INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, ?)', tid, id, t);
        }
        // Initial contributions, done as part of the same atomic setup — the whole point
        // of asking "will everyone contribute?" during creation instead of leaving it for
        // an extra step right after. Raw inserts here, not the addContribution() helper,
        // since that does its own separate DB fetch per call; inside this transaction,
        // reusing the same connection for every write is what keeps it one atomic unit.
        let anyContribution = false;
        if (hasTripBank) {
          for (const t of travelers) {
            const amt = parseFloat(contributionAmounts[t]);
            if (amt > 0) {
              const cid = String(Date.now()) + Math.random().toString(36).slice(2);
              await db.runAsync(
                'INSERT INTO contributions (id, trip_id, traveler, amount, created_at, currency, fx_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
                cid, id, t, amt, ts, baseCurrency, 1
              );
              anyContribution = true;
            }
          }
        }
        await logTimelineEvent({ tripId: id, type: 'trip', title: `Trip created: ${name.trim()}`, timestamp: ts, idSuffix: '_created' });
        if (anyContribution) {
          await logTimelineEvent({ tripId: id, type: 'contribution', title: 'Initial contributions added at setup', timestamp: ts + 1, idSuffix: '_initcontrib' });
        }
        if (tripType === 'international' && exchangeRows.length > 0) {
          for (const row of exchangeRows) {
            const fromAmt = parseFloat(row.fromAmount);
            const toAmt = parseFloat(row.toAmount);
            if (!fromAmt || !toAmt) continue;
            const exId = String(Date.now()) + Math.random().toString(36).slice(2);
            await db.runAsync(
              'INSERT INTO currency_exchanges (id, trip_id, from_amount, from_currency, to_amount, to_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              exId, id, fromAmt, baseCurrency, toAmt, foreignCurrency, ts
            );
          }
          await logTimelineEvent({ tripId: id, type: 'exchange', title: 'Initial currency exchange added at setup', timestamp: ts + 2, idSuffix: '_initexchange' });
        }
      });
      navigation.replace('Trip', { tripId: id, tripName: name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.safe, { paddingTop: insets.top + 16 }]}
      // Android: app.json sets softwareKeyboardLayoutMode: 'resize', and this is a
      // regular full screen (not a Modal/Dialog) — unlike BottomSheet's Modal, THIS
      // screen genuinely does inherit that OS-level resize from the Activity window.
      // Also applying KeyboardAvoidingView's own 'height' resize on top of that shrinks
      // available space by the keyboard's height TWICE, which is what pushed the
      // "Create Trip" button (and the traveler/contribution fields above it) down past
      // the visible screen — the exact "keyboard takes over, can't see what's pending"
      // report. undefined on Android lets the OS-level resize (which already works) be
      // the only thing that happens; iOS has no equivalent OS behavior, so it still
      // needs KeyboardAvoidingView to do the work itself via 'padding'.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a New Trip</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.space.xxl }}>        <Text style={styles.label}>Trip Name</Text>
        <TextInput
          style={[styles.nameInput, nameError && styles.inputError]}
          placeholder="e.g. Goa Trip"
          placeholderTextColor={theme.inkMute}
          value={name}
          onChangeText={(t) => { setName(t); if (nameError) setNameError(false); }}
          autoFocus
        />
        {nameError && <Text style={styles.errorText}>Trip name required</Text>}

        <Text style={[styles.label, { marginTop: theme.space.xl }]}>Currency</Text>
        <View style={styles.currencyRow}>
          {COMMON_CURRENCIES.map((c) => (
            <Chip key={c} label={c} active={baseCurrency === c} onPress={() => setBaseCurrency(c)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: theme.space.xl }]}>Trip type</Text>
        <View style={styles.currencyRow}>
          <Chip label="Domestic" active={tripType === 'domestic'} onPress={() => setTripType('domestic')} />
          <Chip label="International" active={tripType === 'international'} onPress={() => setTripType('international')} />
        </View>

        {tripType === 'international' && (
          <View style={styles.contributionsBlock}>
            <Text style={styles.hint}>
              Pick the currency you'll be spending in day-to-day — this unlocks a running
              "how much foreign cash do I have left" wallet, separate from your expense total.
            </Text>
            <Text style={[styles.label, { marginTop: theme.space.md }]}>Foreign currency</Text>
            <View style={styles.currencyRow}>
              {COMMON_CURRENCIES.filter((c) => c !== baseCurrency).concat(['SAR', 'JPY']).filter((v, i, a) => a.indexOf(v) === i).map((c) => (
                <Chip key={c} label={c} active={foreignCurrency === c} onPress={() => setForeignCurrency(c)} />
              ))}
            </View>

            <Text style={[styles.label, { marginTop: theme.space.lg }]}>Currency exchange (optional)</Text>
            <Text style={styles.hint}>Log any conversions you've already made — you can add more anytime from the trip.</Text>
            <View style={styles.exchangeRow}>
              <TextInput
                style={[styles.contributionInput, { flex: 1 }]}
                placeholder={`${baseCurrency} given`}
                placeholderTextColor={theme.inkMute}
                keyboardType="numeric"
                value={exFrom}
                onChangeText={setExFrom}
              />
              <Feather name="arrow-right" size={16} color={theme.inkMute} style={{ marginHorizontal: 8 }} />
              <TextInput
                style={[styles.contributionInput, { flex: 1 }]}
                placeholder={`${foreignCurrency || 'FX'} received`}
                placeholderTextColor={theme.inkMute}
                keyboardType="numeric"
                value={exTo}
                onChangeText={setExTo}
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  if (!parseFloat(exFrom) || !parseFloat(exTo)) return;
                  setExchangeRows((prev) => [...prev, { fromAmount: exFrom, toAmount: exTo }]);
                  setExFrom(''); setExTo('');
                }}
              >
                <Feather name="plus" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            {exchangeRows.map((r, i) => (
              <View key={i} style={styles.exchangeChip}>
                <Text style={styles.exchangeChipText}>{baseCurrency}{r.fromAmount} → {foreignCurrency}{r.toAmount}</Text>
                <TouchableOpacity onPress={() => setExchangeRows((prev) => prev.filter((_, j) => j !== i))}>
                  <Feather name="x" size={16} color={theme.inkMute} />
                </TouchableOpacity>
              </View>
            ))}
            {totalExchanged > 0 && (
              <View style={styles.totalContribRow}>
                <Text style={styles.totalContribLabel}>Total converted</Text>
                <Text style={styles.totalContribValue}>{foreignCurrency} {totalExchanged.toLocaleString()}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.label, { marginTop: theme.space.xl }]}>Add Travelers</Text>
        <View style={styles.travelerRow}>
          <TextInput
            style={styles.travelerInput}
            placeholder="Name"
            placeholderTextColor={theme.inkMute}
            value={travelerInput}
            onChangeText={setTravelerInput}
            onSubmitEditing={addTraveler}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addTraveler}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12 }}>
          {travelers.length === 0 ? (
            <Text style={styles.hint}>You can add yourself and others now, or later from the Travelers tab.</Text>
          ) : (
            travelers.map((item) => (
              <View key={item} style={styles.travelerChip}>
                <IconBadge type="traveler" size={30} />
                <Text style={styles.travelerName}>{item}</Text>
                <TouchableOpacity onPress={() => removeTraveler(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={16} color={theme.inkMute} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* This was previously buried behind a "+ Advanced options" text link — one
            reviewer round said Trip Bank appeared too early and should be nearly
            invisible; the next round said hiding it entirely leaves the mental model
            incomplete, so settlement later feels unexplained. Both are right about
            different things: it should stay skippable by default (not forced, not
            pre-selected), but the CHOICE itself needs to be visible in the main flow,
            not hidden behind text most people will never tap. Skip is the highlighted
            default either way — nothing changes for someone who just wants to log
            expenses and settle directly. */}
        <Text style={styles.sharedMoneyLabel}>SHARED MONEY (OPTIONAL)</Text>
        <Text style={styles.sharedMoneyHint}>Will everyone pool money into one shared bank first, or just settle up directly later?</Text>
        <View style={styles.sharedMoneyChoiceRow}>
          <Chip label="Skip for now" active={!hasTripBank} onPress={() => setHasTripBank(false)} />
          <Chip label="Set up shared money" active={hasTripBank} onPress={() => setHasTripBank(true)} />
        </View>
        {hasTripBank && (
          <>
            <Text style={styles.learnMoreLink} onPress={() => navigation.navigate('HowItWorks')}>How does this work? →</Text>
            {travelers.length > 0 ? (
              <View style={styles.contributionsBlock}>
                <Text style={[styles.label, { marginTop: theme.space.lg }]}>Initial contributions (optional)</Text>
                {travelers.map((t) => (
                  <View key={t} style={styles.contributionRow}>
                    <Text style={styles.contributionName}>{t}</Text>
                    <TextInput
                      style={[styles.contributionInput, contributionErrors[t] && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={theme.inkMute}
                      keyboardType="numeric"
                      value={contributionAmounts[t] || ''}
                      onChangeText={(v) => {
                        setContributionAmounts((prev) => ({ ...prev, [t]: v }));
                        if (contributionErrors[t]) setContributionErrors((prev) => ({ ...prev, [t]: false }));
                      }}
                    />
                  </View>
                ))}
                {totalContributions > 0 && (
                  <View style={styles.totalContribRow}>
                    <Text style={styles.totalContribLabel}>Total contributions</Text>
                    <Text style={styles.totalContribValue}>{baseCurrency} {totalContributions.toLocaleString()}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.hint}>Add travelers above to set their initial contributions here.</Text>
            )}
          </>
        )}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={saving ? 'Creating…' : 'Create Trip'}
          onPress={createTrip}
          style={{ opacity: name.trim() ? 1 : 0.5 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: theme.weight.semibold, color: theme.ink },
  body: { flex: 1, paddingHorizontal: 20 },
  label: { fontSize: 13, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  nameInput: { backgroundColor: theme.surface, borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, fontWeight: theme.weight.semibold, color: theme.ink, borderWidth: 1, borderColor: theme.line },
  inputError: { borderColor: theme.danger },
  errorText: { color: theme.danger, fontSize: theme.type.caption, fontWeight: theme.weight.semibold, marginTop: 6 },
  totalContribRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: theme.space.md, paddingTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.line },
  totalContribLabel: { fontSize: theme.type.body, color: theme.inkMute },
  totalContribValue: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap' },
  travelerRow: { flexDirection: 'row', gap: 8 },
  travelerInput: { flex: 1, backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, color: theme.ink },
  addBtn: { backgroundColor: theme.brandDeep, width: 46, height: 46, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  travelerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, padding: 10, borderRadius: theme.radius.md, marginBottom: 8, borderWidth: 1, borderColor: theme.line, gap: 10 },
  travelerName: { flex: 1, fontSize: 15, fontWeight: theme.weight.semibold, color: theme.ink },
  hint: { fontSize: 13, color: theme.inkMute, lineHeight: 19, marginTop: 4 },
  advancedToggle: { marginTop: theme.space.lg, alignSelf: 'flex-start', minHeight: theme.a11y.minTouchTarget, justifyContent: 'center' },
  advancedToggleText: { fontSize: 13.5, fontWeight: theme.weight.semibold, color: theme.brandDeep },
  sharedMoneyLabel: { fontSize: 13, color: theme.inkMute, marginTop: theme.space.xl, textTransform: 'uppercase', letterSpacing: 0.4 },
  sharedMoneyHint: { fontSize: 12.5, color: theme.inkMute, marginTop: 4, lineHeight: 17 },
  sharedMoneyChoiceRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.space.sm },
  learnMoreLink: { fontSize: 12.5, color: theme.brandDeep, fontWeight: theme.weight.semibold, marginTop: theme.space.sm },
  contributionsBlock: { marginBottom: theme.space.md },
  contributionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.line },
  contributionName: { fontSize: 15, color: theme.ink, fontWeight: theme.weight.medium },
  contributionInput: { width: 90, backgroundColor: theme.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'right', color: theme.ink },
  exchangeRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.space.sm },
  exchangeChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, paddingVertical: 8, marginTop: theme.space.xs },
  exchangeChipText: { color: theme.ink, fontSize: theme.type.caption },
  footer: { padding: 20 },
});
