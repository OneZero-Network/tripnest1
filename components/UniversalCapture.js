import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addExpense, addNote, addItineraryItem, addContribution, addCurrencyExchange, getLatestExchangeRate } from '../db';
import { pickAndAddDocument } from '../tripExport';
import { PrimaryButton, IconBadge, BottomSheet, Chip, SuccessToast, useTheme } from './UI';

const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB'];
const CATEGORIES = ['Food', 'Transport', 'Stay', 'Shopping', 'Other'];

// The whole point of this button is "don't make the organizer think about which tab to
// open." So each action here is the FULL, real path to a proper record — same fields the
// old standalone Expenses tab had (payer, funding source, category, currency), not a
// reduced "fix it later" version. That reduced version used to default the payer to
// "Unknown" with a note to "fix it in the Expenses tab afterward" — but expenses are
// immutable once created (financial history can't be edited after the fact, same rule
// that blocks removing a traveler with expenses on record), so there was never actually
// a way to fix it. This is the real fix: Add IS the one true entry point now.
const ALL_ACTIONS = [
  { key: 'expense', label: 'Add Expense', icon: 'expense' },
  { key: 'contribution', label: 'Add Contribution', icon: 'contribution' },
  { key: 'exchange', label: 'Exchange Currency', icon: 'exchange' },
  { key: 'note', label: 'Add Note', icon: 'note' },
  { key: 'plan', label: 'Add Plan Item', icon: 'itinerary' },
  { key: 'document', label: 'Attach Document', icon: 'document' },
  { key: 'draft', label: 'Quick Draft', icon: 'draft', tone: 'accent' },
];

export default function UniversalCapture({ tripId, navigation, travelers = [], baseCurrency = 'INR', hasTripBank = true, tripType = 'domestic', foreignCurrency = null, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const ACTIONS = ALL_ACTIONS.filter((a) => (a.key === 'contribution' ? hasTripBank : true)).filter((a) => (a.key === 'exchange' ? tripType === 'international' : true));
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState(null);
  const [fundingSource, setFundingSource] = useState('personal');
  const [category, setCategory] = useState(null);
  const [customCategory, setCustomCategory] = useState('');
  const [splitParticipants, setSplitParticipants] = useState(null); // null = everyone (default, unchanged behavior)
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom' | 'percentage' | 'shares'
  const [splitValues, setSplitValues] = useState({}); // { travelerName: string } — raw text input per method
  const [contribTraveler, setContribTraveler] = useState(null);
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [formError, setFormError] = useState(null);
  const [exFromAmount, setExFromAmount] = useState('');
  const [exToAmount, setExToAmount] = useState('');
  const [exCurrency, setExCurrency] = useState(foreignCurrency);
  const [exConvertedBy, setExConvertedBy] = useState(null);

  const isForeign = currency !== baseCurrency;

  const reset = () => {
    setActiveAction(null); setText(''); setAmount(''); setPayer(null);
    setFundingSource('personal'); setCategory(null); setCustomCategory(''); setContribTraveler(null);
    setCurrency(baseCurrency); setFxRate(''); setShowCurrency(false); setSplitParticipants(null);
    setSplitType('equal'); setSplitValues({});
    setExFromAmount(''); setExToAmount(''); setExCurrency(foreignCurrency); setExConvertedBy(null);
  };
  const close = () => { setOpen(false); reset(); setFormError(null); };

  // Toggling a traveler off the split, starting from the implicit "everyone" default —
  // only becomes an explicit list the moment someone's actually excluded.
  const toggleParticipant = (name) => {
    const current = splitParticipants ?? travelers.map((t) => t.name);
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
    // If toggling back to "everyone selected," return to null so a plain, unmodified
    // expense doesn't silently start carrying an explicit (if redundant) participant list.
    setSplitParticipants(next.length === travelers.length ? null : next);
  };

  const handleActionPress = async (key) => {
    if (key === 'document') {
      setOpen(false);
      await pickAndAddDocument(tripId);
      onChanged();
      return;
    }
    if (key === 'draft') {
      setOpen(false);
      navigation.navigate('Drafts', { tripId });
      return;
    }
    setActiveAction(key);
    setFormError(null);
    // Default "Who paid" to the first traveler — for most expenses the payer is either
    // the app's own user or whoever's already habit is to pay, so requiring an extra tap
    // to select someone who's selected 9 times out of 10 anyway was pure friction. Still
    // fully overridable with one tap on another chip.
    if (key === 'expense' && travelers.length > 0) setPayer(travelers[0].name);
    // On an international trip, day-to-day spend is overwhelmingly in the foreign
    // currency, not the home one — defaulting to base currency meant re-selecting the
    // foreign currency AND retyping its exchange rate on every single expense, even
    // though the rate was already known from the wallet's own conversion history. This
    // pre-fills both; the rate stays a plain editable field since it can drift entry to
    // entry, this is just a starting point, not a locked value.
    if (key === 'expense' && tripType === 'international' && foreignCurrency) {
      setCurrency(foreignCurrency);
      getLatestExchangeRate(tripId, foreignCurrency).then((rate) => {
        if (rate) setFxRate(String(rate));
      });
    }
    if (key === 'exchange') { setExCurrency(foreignCurrency); setExConvertedBy(travelers.length === 1 ? travelers[0].name : null); }
  };

  const submit = async () => {
    setFormError(null);
    if (activeAction === 'expense') {
      const amt = parseFloat(amount);
      // Silently returning here (the old behavior) left the user staring at a Save
      // button that just... didn't do anything, with no clue why. Every one of these
      // now tells them exactly what to fix, matching the "red border + message" ask.
      if (!amt) return setFormError('Enter an amount');
      if (!payer) return setFormError('Choose who paid');
      if (isForeign && !parseFloat(fxRate)) return setFormError('Enter an exchange rate');
      if (splitParticipants && splitParticipants.length === 0) return setFormError('Split between at least one person');
      // "Other" needs its own label — saving it as the literal string "Other" with no
      // way to say what it actually was is exactly what made this feel stuck/incomplete.
      const finalCategory = category === 'Other' ? (customCategory.trim() || 'Other') : category;
      const activeParticipants = splitParticipants ?? travelers.map((t) => t.name);
      const usesSplitType = splitType !== 'equal';
      try {
        await addExpense(tripId, payer, amt, text.trim() || null, {
          currency, fxRate: isForeign ? parseFloat(fxRate) : 1, category: finalCategory, fundingSource,
          participants: splitParticipants || (usesSplitType ? activeParticipants : undefined),
          splitType: usesSplitType ? splitType : undefined,
          splitValues: usesSplitType ? splitValues : undefined,
        });
      } catch (err) {
        // resolveSplit throws when custom amounts/percentages/shares don't reconcile —
        // surfaced as a form error, exactly like every other validation above, rather than
        // letting a mismatched split silently fail to save with no explanation.
        return setFormError(err.message || 'That split doesn\'t add up — check the numbers.');
      }
    } else if (activeAction === 'contribution') {
      const amt = parseFloat(amount);
      if (!amt) return setFormError('Enter an amount');
      if (!contribTraveler) return setFormError('Choose who contributed');
      await addContribution(tripId, contribTraveler, amt);
    } else if (activeAction === 'exchange') {
      const fromAmt = parseFloat(exFromAmount);
      const toAmt = parseFloat(exToAmount);
      if (!fromAmt) return setFormError(`Enter ${baseCurrency} given`);
      if (!exCurrency) return setFormError('Choose a currency');
      if (!toAmt) return setFormError(`Enter ${exCurrency} received`);
      await addCurrencyExchange(tripId, fromAmt, baseCurrency, toAmt, exCurrency, exConvertedBy);
    } else if (activeAction === 'note') {
      if (!text.trim()) return setFormError('Write something first');
      await addNote(tripId, text.trim());
    } else if (activeAction === 'plan') {
      if (!text.trim()) return setFormError('Give the plan a title');
      await addItineraryItem(tripId, text.trim(), Date.now(), null);
    }
    setSavedAt(Date.now());
    onChanged();
    close();
  };

  const active = ACTIONS.find(a => a.key === activeAction);

  return (
    <>
      <SuccessToast trigger={savedAt} message="Saved" />
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + theme.space.lg }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel="Add to trip"
        accessibilityRole="button"
      >
        <Feather name="plus" size={23} color="#fff" />
      </TouchableOpacity>

      <BottomSheet visible={open} onClose={close}>
        {!activeAction ? (
          <>
            <Text style={styles.title}>Add to trip</Text>
            <Text style={styles.subtitle}>Skip the tabs — capture it straight into the right place.</Text>
            {ACTIONS.map((a) => (
              <TouchableOpacity key={a.key} style={styles.actionRow} onPress={() => handleActionPress(a.key)}>
                <IconBadge type={a.icon} size={38} tone={a.tone} />
                <Text style={styles.actionText}>{a.label}</Text>
                <Feather name="chevron-right" size={16} color={theme.inkMute} />
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <View style={styles.activeHeaderRow}>
              <IconBadge type={active.icon} size={38} tone={active.tone} />
              <Text style={styles.title}>{active.label}</Text>
            </View>

            {activeAction === 'expense' && (
              <>
                <Text style={styles.fieldLabel}>Who paid?</Text>
                {travelers.length === 0 ? (
                  <Text style={styles.hint}>Add travelers first, from the Travelers tab.</Text>
                ) : (
                  <View style={styles.chipRow}>
                    {travelers.map((t) => (
                      <Chip key={t.id} label={t.name} active={payer === t.name} onPress={() => setPayer(t.name)} />
                    ))}
                  </View>
                )}

                {hasTripBank && (
                  <>
                    <Text style={styles.fieldLabel}>Paid from</Text>
                    <View style={styles.chipRow}>
                      <Chip label="Personal (settle 1:1)" active={fundingSource === 'personal'} onPress={() => setFundingSource('personal')} />
                      <Chip label="Trip Bank" active={fundingSource === 'bank'} onPress={() => setFundingSource('bank')} />
                    </View>
                  </>
                )}

                <View style={styles.amountRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }, formError === 'Enter an amount' && styles.inputError]} placeholder="Amount" placeholderTextColor={theme.inkMute} value={amount} onChangeText={setAmount} keyboardType="numeric" />
                  <Text style={styles.currencyToggle} onPress={() => setShowCurrency((v) => !v)}>{currency} {showCurrency ? '▴' : '▾'}</Text>
                </View>
                {showCurrency && (
                  <View style={styles.chipRow}>
                    {COMMON_CURRENCIES.map((c) => (
                      <Chip key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />
                    ))}
                  </View>
                )}
                {isForeign && (
                  <TextInput style={styles.input} placeholder={`Rate — 1 ${currency} = ? ${baseCurrency}`} placeholderTextColor={theme.inkMute} value={fxRate} onChangeText={setFxRate} keyboardType="numeric" />
                )}

                <Text style={styles.fieldLabel}>Category</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map((c) => (
                    <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                  ))}
                </View>
                {category === 'Other' && (
                  <TextInput
                    style={styles.input}
                    placeholder="What kind of expense?"
                    placeholderTextColor={theme.inkMute}
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    autoFocus
                  />
                )}

                {travelers.length > 1 && (
                  <>
                    <Text style={styles.fieldLabel}>Split between</Text>
                    <Text style={styles.hint}>Defaults to everyone — tap to leave someone out of just this expense.</Text>
                    <View style={styles.chipRow}>
                      {travelers.map((t) => {
                        const selected = splitParticipants ? splitParticipants.includes(t.name) : true;
                        return <Chip key={t.id} label={t.name} active={selected} onPress={() => toggleParticipant(t.name)} />;
                      })}
                    </View>

                    <Text style={styles.fieldLabel}>How should it be split?</Text>
                    <View style={styles.chipRow}>
                      {[
                        { key: 'equal', label: 'Equal' },
                        { key: 'custom', label: 'Custom amount' },
                        { key: 'percentage', label: 'Percentage' },
                        { key: 'shares', label: 'Shares' },
                      ].map((m) => (
                        <Chip key={m.key} label={m.label} active={splitType === m.key} onPress={() => { setSplitType(m.key); setSplitValues({}); }} />
                      ))}
                    </View>

                    {splitType !== 'equal' && (() => {
                      const activeNames = splitParticipants ?? travelers.map((t) => t.name);
                      const sum = activeNames.reduce((s, n) => s + (parseFloat(splitValues[n]) || 0), 0);
                      const target = splitType === 'percentage' ? 100 : (splitType === 'custom' ? parseFloat(amount) || 0 : null);
                      return (
                        <>
                          {activeNames.map((name) => (
                            <View key={name} style={styles.splitValueRow}>
                              <Text style={styles.splitValueName}>{name}</Text>
                              <TextInput
                                style={styles.splitValueInput}
                                placeholder={splitType === 'percentage' ? '%' : splitType === 'shares' ? 'shares' : '0.00'}
                                placeholderTextColor={theme.inkMute}
                                keyboardType="numeric"
                                value={splitValues[name] ?? ''}
                                onChangeText={(v) => setSplitValues((prev) => ({ ...prev, [name]: v }))}
                              />
                            </View>
                          ))}
                          {target != null && (
                            <Text style={styles.hint}>
                              {splitType === 'percentage'
                                ? `Total: ${sum.toFixed(2)}% (needs to be 100%)`
                                : `Total: ${sum.toFixed(2)} (needs to be ${target.toFixed(2)})`}
                            </Text>
                          )}
                          {splitType === 'shares' && (
                            <Text style={styles.hint}>Total shares: {sum.toFixed(2)} — split proportionally, any positive numbers.</Text>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
              </>
            )}

            {activeAction === 'contribution' && (
              <>
                <Text style={styles.fieldLabel}>Who's contributing?</Text>
                {travelers.length === 0 ? (
                  <Text style={styles.hint}>Add travelers first, from the Travelers tab.</Text>
                ) : (
                  <View style={styles.chipRow}>
                    {travelers.map((t) => (
                      <Chip key={t.id} label={t.name} active={contribTraveler === t.name} onPress={() => setContribTraveler(t.name)} />
                    ))}
                  </View>
                )}
                <TextInput style={[styles.input, formError === 'Enter an amount' && styles.inputError]} placeholder="Amount" placeholderTextColor={theme.inkMute} value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus />
              </>
            )}

            {activeAction === 'exchange' && (
              <>
                {travelers.length > 1 && (
                  <>
                    <Text style={styles.fieldLabel}>Who converted?</Text>
                    <View style={styles.chipRow}>
                      {travelers.map((t) => (
                        <Chip key={t.id} label={t.name} active={exConvertedBy === t.name} onPress={() => setExConvertedBy(t.name)} />
                      ))}
                    </View>
                  </>
                )}
                <Text style={styles.fieldLabel}>Currency</Text>
                <View style={styles.chipRow}>
                  {[foreignCurrency, ...['USD', 'EUR', 'GBP', 'AED', 'THB', 'SAR', 'JPY'].filter((c) => c !== foreignCurrency)].filter(Boolean).map((c) => (
                    <Chip key={c} label={c} active={exCurrency === c} onPress={() => setExCurrency(c)} />
                  ))}
                </View>
                <Text style={styles.fieldLabel}>{baseCurrency} given</Text>
                <TextInput
                  style={[styles.input, formError?.includes(baseCurrency) && styles.inputError]}
                  placeholder="0"
                  placeholderTextColor={theme.inkMute}
                  value={exFromAmount}
                  onChangeText={setExFromAmount}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldLabel}>{exCurrency || 'Foreign currency'} received</Text>
                <TextInput
                  style={[styles.input, formError?.includes('received') && styles.inputError]}
                  placeholder="0"
                  placeholderTextColor={theme.inkMute}
                  value={exToAmount}
                  onChangeText={setExToAmount}
                  keyboardType="numeric"
                />
                {exFromAmount && exToAmount && parseFloat(exToAmount) > 0 && (
                  <Text style={styles.hint}>Rate: 1 {exCurrency} = {baseCurrency}{(parseFloat(exFromAmount) / parseFloat(exToAmount)).toFixed(2)}</Text>
                )}
              </>
            )}

            {(activeAction === 'expense' || activeAction === 'note' || activeAction === 'plan') && (
              <TextInput
                style={styles.input}
                placeholder={activeAction === 'expense' ? 'Description (optional)' : activeAction === 'note' ? 'Quick note...' : "What's the plan?"}
                placeholderTextColor={theme.inkMute}
                value={text}
                onChangeText={setText}
                autoFocus={activeAction !== 'expense'}
              />
            )}

            {formError && (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={14} color={theme.danger} />
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}
            <PrimaryButton label="Save" icon="check" onPress={submit} style={{ marginTop: theme.space.sm }} />
          </>
        )}
      </BottomSheet>
    </>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.dangerWash || 'rgba(220,80,80,0.12)', borderRadius: theme.radius.sm, padding: theme.space.sm, marginTop: theme.space.sm },
  errorText: { color: theme.danger, fontSize: theme.type.caption, fontWeight: theme.weight.semibold, flex: 1 },
  fab: {
    position: 'absolute', end: theme.space.lg, width: 45, height: 45, borderRadius: 23,
    backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.brandDeep, shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 3, marginBottom: theme.space.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.bg, minHeight: theme.a11y.minTouchTarget },
  actionText: { flex: 1, fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.lg },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.sm, color: theme.ink },
  inputError: { borderColor: theme.danger },
  hint: { color: theme.inkMute, fontSize: 11.5, marginBottom: theme.space.sm },
  fieldLabel: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.inkMute, marginBottom: theme.space.xs, marginTop: theme.space.xs, textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.space.sm },
  splitValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space.xs ?? 6 },
  splitValueName: { color: theme.ink, fontSize: 14 },
  splitValueInput: { borderWidth: 1, borderColor: theme.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, width: 100, textAlign: 'right', color: theme.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  currencyToggle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.brandDeep, paddingHorizontal: 4, marginBottom: theme.space.sm },
});
