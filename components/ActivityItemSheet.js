import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import {
  getNoteById, getDocumentById, getExpenseById, getExpenseSplits, getContributionById,
  getCurrencyExchangeById,
  updateNote, deleteNote, togglePinnedNote,
  togglePinnedDocument,
  updateExpense, deleteExpense,
  updateContribution, deleteContribution,
  updateCurrencyExchange, deleteCurrencyExchange,
} from '../db';
import { openDocument, deleteDocument } from '../tripExport';
import { BottomSheet, PrimaryButton, SecondaryButton, ConfirmDialog, Chip, currencySymbol, CATEGORY_EMOJI, useTheme } from './UI';

// Folding Expenses/Notes/Documents into Activity means a feed row needs to actually DO
// something when tapped, not just describe what happened. This sheet is that "something" —
// type-specific detail + actions. Expenses used to be read-only here ("financial history
// is immutable") — that's now resolved the other way: editable, but every edit/delete
// snapshots the prior row first (expense_history, via updateExpense/deleteExpense) and
// writes its own Activity entry, so "immutable" becomes "every version is on record"
// instead of "can never change."
export default function ActivityItemSheet({ tripId, event, baseCurrency, travelers = [], hasTripBank = true, onClose, onChanged }) {
  const theme = useTheme();
  const [record, setRecord] = useState(null);
  const [splits, setSplits] = useState([]);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);
  const [editingExpense, setEditingExpense] = useState(false);
  const [eAmount, setEAmount] = useState('');
  const [eCategory, setECategory] = useState(null);
  const [ePaidBy, setEPaidBy] = useState(null);
  const [eFundingSource, setEFundingSource] = useState('personal');
  const [eDescription, setEDescription] = useState('');
  const [eSplitParticipants, setESplitParticipants] = useState(null); // null = everyone
  const [eSplitType, setESplitType] = useState('equal');
  const [eSplitValues, setESplitValues] = useState({});
  const [eSplitError, setESplitError] = useState(null);
  const [cAmount, setCAmount] = useState('');
  const [editingContribution, setEditingContribution] = useState(false);
  const [xFromAmount, setXFromAmount] = useState('');
  const [xToAmount, setXToAmount] = useState('');
  const [editingExchange, setEditingExchange] = useState(false);

  const meta = (() => {
    try { return event?.metadata ? JSON.parse(event.metadata) : null; } catch { return null; }
  })();

  useEffect(() => {
    if (!event || !meta?.id) { setRecord(null); setSplits([]); return; }
    (async () => {
      if (event.type === 'note') setRecord(await getNoteById(meta.id));
      else if (event.type === 'document') setRecord(await getDocumentById(meta.id));
      else if (event.type === 'expense') {
        setRecord(await getExpenseById(meta.id));
        setSplits(await getExpenseSplits(meta.id));
      }
      else if (event.type === 'contribution') setRecord(await getContributionById(meta.id));
      else if (event.type === 'exchange') setRecord(await getCurrencyExchangeById(meta.id));
    })();
    setEditingExpense(false);
    setEditingContribution(false);
    setEditingExchange(false);
    // Keyed on the underlying RECORD's identity (type + metadata.id), not event.id.
    // event.id is the timeline row's own id when opened from Activity — but callers
    // opening a record directly (e.g. the Expenses tab, which has no timeline row to
    // reference) build a lightweight { type, metadata } object with no `id` at all.
    // Keying on event?.id silently broke exactly that path: switching between two
    // such objects looks like "no change" to React since both have the same
    // (undefined) id, so this effect never re-ran and the sheet stayed empty. Keying on
    // the actual record identity means it re-fetches correctly regardless of whether
    // the caller happens to also attach a timeline id.
  }, [event?.type, meta?.id]);

  useEffect(() => {
    if (record?.text != null) setEditText(record.text);
    if (record && event?.type === 'expense') {
      setEAmount(String(record.amount));
      setECategory(record.category);
      setEPaidBy(record.paid_by);
      setEFundingSource(record.funding_source);
      setEDescription(record.description || '');
    }
    if (record && event?.type === 'contribution') setCAmount(String(record.amount));
    if (record && event?.type === 'exchange') { setXFromAmount(String(record.from_amount)); setXToAmount(String(record.to_amount)); }
  }, [record]);

  const visible = !!event && !!meta?.id && ['note', 'document', 'expense', 'contribution', 'exchange'].includes(event.type);
  if (!visible) return null;

  const saveNote = async () => {
    if (!editText.trim()) return;
    await updateNote(record.id, tripId, editText.trim());
    onChanged();
    onClose();
  };

  const confirmDeleteNote = async () => {
    setPendingDelete(false);
    await deleteNote(record.id, tripId);
    onChanged();
    onClose();
  };

  const confirmRemoveDoc = async () => {
    setPendingDelete(false);
    await deleteDocument(record.id, record.uri, tripId, record.name);
    onChanged();
    onClose();
  };

  const saveExpense = async () => {
    const amt = parseFloat(eAmount);
    if (!amt || amt <= 0 || !ePaidBy) return;
    setESplitError(null);
    const usesSplitType = eSplitType !== 'equal';
    const result = await updateExpense(tripId, record.id, {
      amount: amt, category: eCategory, paidBy: ePaidBy, fundingSource: eFundingSource,
      description: eDescription.trim() || null,
      participants: eSplitParticipants || (usesSplitType ? travelers.map((t) => t.name) : undefined),
      splitType: usesSplitType ? eSplitType : (eSplitParticipants ? 'equal' : undefined),
      splitValues: usesSplitType ? eSplitValues : undefined,
    });
    if (result && result.ok === false) {
      // Rejected split — e.g. custom amounts don't sum to the (possibly just-changed)
      // total, or percentages don't sum to 100. Surface it and stay in the edit form
      // rather than silently closing as if nothing happened.
      setESplitError(result.error || 'That split doesn\'t add up — check the numbers.');
      return;
    }
    onChanged();
    onClose();
  };

  const confirmDeleteExpense = async () => {
    setPendingDelete(false);
    await deleteExpense(tripId, record.id);
    onChanged();
    onClose();
  };

  const saveContribution = async () => {
    const amt = parseFloat(cAmount);
    if (!amt || amt <= 0) return;
    await updateContribution(tripId, record.id, amt);
    onChanged();
    onClose();
  };
  const confirmDeleteContribution = async () => {
    setPendingDelete(false);
    await deleteContribution(tripId, record.id);
    onChanged();
    onClose();
  };

  const saveExchange = async () => {
    const fromAmt = parseFloat(xFromAmount);
    const toAmt = parseFloat(xToAmount);
    if (!fromAmt || !toAmt) return;
    await updateCurrencyExchange(tripId, record.id, fromAmt, toAmt);
    onChanged();
    onClose();
  };
  const confirmDeleteExchange = async () => {
    setPendingDelete(false);
    await deleteCurrencyExchange(tripId, record.id);
    onChanged();
    onClose();
  };

  const cs = currencySymbol(baseCurrency);
  const CATS = Object.keys(CATEGORY_EMOJI);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        {!record ? (
          <Text style={styles(theme).muted}>Loading…</Text>
        ) : event.type === 'note' ? (
          <>
            <Text style={styles(theme).title}>Note</Text>
            <TextInput
              style={styles(theme).textArea}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder="Note text"
              placeholderTextColor={theme.inkMute}
            />
            <View style={styles(theme).row}>
              <SecondaryButton label={record.pinned_emergency ? 'Unpin from Safe Mode' : 'Pin to Safe Mode'} onPress={async () => { await togglePinnedNote(record.id); onChanged(); onClose(); }} style={{ flex: 1 }} />
            </View>
            <View style={[styles(theme).row, { marginTop: theme.space.sm }]}>
              <PrimaryButton label="Save" onPress={saveNote} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Delete" onPress={() => setPendingDelete(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'document' ? (
          <>
            <Text style={styles(theme).title}>{record.name}</Text>
            <View style={[styles(theme).row, { marginTop: theme.space.md }]}>
              <PrimaryButton label="Open" onPress={() => openDocument(record.uri)} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label={record.pinned_emergency ? 'Unpin' : 'Pin to Safe Mode'} onPress={async () => { await togglePinnedDocument(record.id); onChanged(); onClose(); }} style={{ flex: 1 }} />
            </View>
            <SecondaryButton label="Remove" onPress={() => setPendingDelete(true)} style={{ marginTop: theme.space.sm }} />
          </>
        ) : event.type === 'expense' && !editingExpense ? (
          <>
            <Text style={styles(theme).title}>{record.category || 'Expense'}</Text>
            <DetailRow theme={theme} label="Paid by" value={record.paid_by} />
            <DetailRow theme={theme} label="Amount" value={`${cs}${record.amount}${record.currency !== baseCurrency ? ` ${record.currency}` : ''}`} />
            <DetailRow theme={theme} label="Paid from" value={record.funding_source === 'bank' ? 'Trip Bank' : 'Personal'} />
            {splits.length > 0 && (
              <DetailRow theme={theme} label="Split between" value={`${splits.map((s) => s.traveler_name).join(', ')} (${cs}${splits[0].share_amount} each)`} />
            )}
            {record.description ? <DetailRow theme={theme} label="Note" value={record.description} /> : null}
            <DetailRow theme={theme} label="Date" value={new Date(record.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} />
            {record.edited_at ? (
              <Text style={[styles(theme).muted, { marginTop: theme.space.xs, fontStyle: 'italic' }]}>
                Edited {new Date(record.edited_at).toLocaleDateString([], { dateStyle: 'medium' })}
              </Text>
            ) : null}
            <View style={[styles(theme).row, { marginTop: theme.space.lg }]}>
              <PrimaryButton label="Edit" icon="edit-2" onPress={() => {
                // Seed the split editor from what's actually on file — participants,
                // method, and original input values (40%/30%/30%, not just derived ₹) —
                // so editing a percentage/shares split doesn't force starting over.
                if (splits && splits.length > 0) {
                  setESplitParticipants(splits.map((s) => s.traveler_name));
                  setESplitType(record.split_type || 'equal');
                  const vals = {};
                  splits.forEach((s) => { if (s.input_value != null) vals[s.traveler_name] = String(s.input_value); });
                  setESplitValues(vals);
                } else {
                  setESplitParticipants(null);
                  setESplitType('equal');
                  setESplitValues({});
                }
                setESplitError(null);
                setEditingExpense(true);
              }} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Delete" onPress={() => setPendingDelete(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'expense' && editingExpense ? (
          <>
            <Text style={styles(theme).title}>Edit expense</Text>

            <Text style={styles(theme).label}>Who paid?</Text>
            <View style={styles(theme).chipRow}>
              {travelers.map((t) => (
                <Chip key={t.id} label={t.name} active={ePaidBy === t.name} onPress={() => setEPaidBy(t.name)} />
              ))}
            </View>

            {hasTripBank && (
              <>
                <Text style={styles(theme).label}>Paid from</Text>
                <View style={styles(theme).chipRow}>
                  <Chip label="Personal (settle 1:1)" active={eFundingSource === 'personal'} onPress={() => setEFundingSource('personal')} />
                  <Chip label="Trip Bank" active={eFundingSource === 'bank'} onPress={() => setEFundingSource('bank')} />
                </View>
              </>
            )}

            <Text style={styles(theme).label}>Amount</Text>
            <TextInput
              style={styles(theme).input}
              value={eAmount}
              onChangeText={setEAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={theme.inkMute}
            />

            <Text style={styles(theme).label}>Category</Text>
            <View style={styles(theme).chipRow}>
              {CATS.map((c) => (
                <Chip key={c} label={c} active={eCategory === c} onPress={() => setECategory(c)} />
              ))}
            </View>

            <Text style={styles(theme).label}>Description</Text>
            <TextInput
              style={styles(theme).input}
              value={eDescription}
              onChangeText={setEDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.inkMute}
            />

            {travelers.length > 1 && (
              <>
                <Text style={styles(theme).label}>Split between</Text>
                <View style={styles(theme).chipRow}>
                  {travelers.map((t) => {
                    const active = eSplitParticipants ? eSplitParticipants.includes(t.name) : true;
                    return (
                      <Chip
                        key={t.id}
                        label={t.name}
                        active={active}
                        onPress={() => {
                          const current = eSplitParticipants ?? travelers.map((tr) => tr.name);
                          const next = current.includes(t.name) ? current.filter((n) => n !== t.name) : [...current, t.name];
                          setESplitParticipants(next.length === travelers.length ? null : next);
                        }}
                      />
                    );
                  })}
                </View>

                <Text style={styles(theme).label}>How should it be split?</Text>
                <View style={styles(theme).chipRow}>
                  {[
                    { key: 'equal', label: 'Equal' },
                    { key: 'custom', label: 'Custom amount' },
                    { key: 'percentage', label: 'Percentage' },
                    { key: 'shares', label: 'Shares' },
                  ].map((m) => (
                    <Chip key={m.key} label={m.label} active={eSplitType === m.key} onPress={() => { setESplitType(m.key); setESplitValues({}); }} />
                  ))}
                </View>

                {eSplitType !== 'equal' && (() => {
                  const activeNames = eSplitParticipants ?? travelers.map((t) => t.name);
                  const sum = activeNames.reduce((s, n) => s + (parseFloat(eSplitValues[n]) || 0), 0);
                  const target = eSplitType === 'percentage' ? 100 : (eSplitType === 'custom' ? parseFloat(eAmount) || 0 : null);
                  return (
                    <>
                      {activeNames.map((name) => (
                        <View key={name} style={styles(theme).splitValueRow}>
                          <Text style={styles(theme).splitValueName}>{name}</Text>
                          <TextInput
                            style={styles(theme).splitValueInput}
                            placeholder={eSplitType === 'percentage' ? '%' : eSplitType === 'shares' ? 'shares' : '0.00'}
                            placeholderTextColor={theme.inkMute}
                            keyboardType="numeric"
                            value={eSplitValues[name] ?? ''}
                            onChangeText={(v) => setESplitValues((prev) => ({ ...prev, [name]: v }))}
                          />
                        </View>
                      ))}
                      {target != null && (
                        <Text style={styles(theme).muted}>
                          {eSplitType === 'percentage' ? `Total: ${sum.toFixed(2)}% (needs to be 100%)` : `Total: ${sum.toFixed(2)} (needs to be ${target.toFixed(2)})`}
                        </Text>
                      )}
                    </>
                  );
                })()}
                {eSplitError && <Text style={[styles(theme).muted, { color: theme.danger || 'red' }]}>{eSplitError}</Text>}
              </>
            )}

            <Text style={[styles(theme).muted, { marginTop: theme.space.sm }]}>
              This won't erase the original — the prior amount/category stays visible in Activity as an edit record.
            </Text>

            <View style={[styles(theme).row, { marginTop: theme.space.md }]}>
              <PrimaryButton label="Save changes" onPress={saveExpense} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Cancel" onPress={() => setEditingExpense(false)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'contribution' && !editingContribution ? (
          <>
            <Text style={styles(theme).title}>Contribution</Text>
            <DetailRow theme={theme} label="From" value={record.traveler} />
            <DetailRow theme={theme} label="Amount" value={`${cs}${record.amount}${record.currency !== baseCurrency ? ` ${record.currency}` : ''}`} />
            <DetailRow theme={theme} label="Date" value={new Date(record.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} />
            {record.edited_at ? (
              <Text style={[styles(theme).muted, { marginTop: theme.space.xs, fontStyle: 'italic' }]}>
                Edited {new Date(record.edited_at).toLocaleDateString([], { dateStyle: 'medium' })}
              </Text>
            ) : null}
            <View style={[styles(theme).row, { marginTop: theme.space.lg }]}>
              <PrimaryButton label="Edit" icon="edit-2" onPress={() => setEditingContribution(true)} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Delete" onPress={() => setPendingDelete(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'contribution' && editingContribution ? (
          <>
            <Text style={styles(theme).title}>Edit contribution</Text>
            <Text style={styles(theme).label}>Amount</Text>
            <TextInput
              style={styles(theme).input}
              value={cAmount}
              onChangeText={setCAmount}
              keyboardType="numeric"
              placeholder="Amount"
              placeholderTextColor={theme.inkMute}
            />
            <Text style={[styles(theme).muted, { marginTop: theme.space.sm }]}>
              The prior amount stays visible in Activity as an edit record.
            </Text>
            <View style={[styles(theme).row, { marginTop: theme.space.md }]}>
              <PrimaryButton label="Save changes" onPress={saveContribution} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Cancel" onPress={() => setEditingContribution(false)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'exchange' && !editingExchange ? (
          <>
            <Text style={styles(theme).title}>Currency exchange</Text>
            <DetailRow theme={theme} label="Given" value={`${record.from_amount} ${record.from_currency}`} />
            <DetailRow theme={theme} label="Received" value={`${record.to_amount} ${record.to_currency}`} />
            <DetailRow theme={theme} label="Rate" value={`1 ${record.to_currency} = ${record.from_currency}${(record.from_amount / record.to_amount).toFixed(2)}`} />
            <DetailRow theme={theme} label="Date" value={new Date(record.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} />
            {record.edited_at ? (
              <Text style={[styles(theme).muted, { marginTop: theme.space.xs, fontStyle: 'italic' }]}>
                Edited {new Date(record.edited_at).toLocaleDateString([], { dateStyle: 'medium' })}
              </Text>
            ) : null}
            <View style={[styles(theme).row, { marginTop: theme.space.lg }]}>
              <PrimaryButton label="Edit" icon="edit-2" onPress={() => setEditingExchange(true)} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Delete" onPress={() => setPendingDelete(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'exchange' && editingExchange ? (
          <>
            <Text style={styles(theme).title}>Edit exchange</Text>
            <Text style={styles(theme).label}>{record.from_currency} given</Text>
            <TextInput style={styles(theme).input} value={xFromAmount} onChangeText={setXFromAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.inkMute} />
            <Text style={styles(theme).label}>{record.to_currency} received</Text>
            <TextInput style={styles(theme).input} value={xToAmount} onChangeText={setXToAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.inkMute} />
            <Text style={[styles(theme).muted, { marginTop: theme.space.sm }]}>
              The prior amounts stay visible in Activity as an edit record.
            </Text>
            <View style={[styles(theme).row, { marginTop: theme.space.md }]}>
              <PrimaryButton label="Save changes" onPress={saveExchange} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Cancel" onPress={() => setEditingExchange(false)} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        visible={pendingDelete}
        title={event.type === 'note' ? 'Delete note?' : event.type === 'document' ? 'Remove document?' : event.type === 'contribution' ? 'Delete contribution?' : event.type === 'exchange' ? 'Delete exchange?' : 'Delete expense?'}
        message={event.type === 'expense' ? "This removes it from every balance and settlement. A record of it stays in Activity, but it won't be recoverable as a line item." : event.type === 'contribution' ? "This removes it from the Trip Bank balance. A record of it stays in Activity, but it won't be recoverable as a line item." : event.type === 'exchange' ? "This removes it from your foreign-currency wallet balance. A record of it stays in Activity, but it won't be recoverable as a line item." : undefined}
        confirmLabel={event.type === 'note' ? 'Delete' : event.type === 'document' ? 'Remove' : 'Delete'}
        destructive
        onConfirm={event.type === 'note' ? confirmDeleteNote : event.type === 'document' ? confirmRemoveDoc : event.type === 'contribution' ? confirmDeleteContribution : event.type === 'exchange' ? confirmDeleteExchange : confirmDeleteExpense}
        onCancel={() => setPendingDelete(false)}
      />
    </>
  );
}

function DetailRow({ theme, label, value }) {
  return (
    <View style={styles(theme).detailRow}>
      <Text style={styles(theme).detailLabel}>{label}</Text>
      <Text style={styles(theme).detailValue}>{value}</Text>
    </View>
  );
}

const styles = (theme) => StyleSheet.create({
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm },
  muted: { color: theme.inkMute, fontSize: theme.type.body, lineHeight: 20 },
  textArea: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, padding: theme.space.md, color: theme.ink, minHeight: 90, textAlignVertical: 'top', marginBottom: theme.space.sm },
  row: { flexDirection: 'row' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.line },
  detailLabel: { fontSize: theme.type.caption, color: theme.inkMute },
  detailValue: { fontSize: theme.type.body, color: theme.ink, fontWeight: theme.weight.medium, flexShrink: 1, textAlign: 'right' },
  label: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.inkMute, marginTop: theme.space.md, marginBottom: theme.space.xs, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, color: theme.ink },
  splitValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space.xs },
  splitValueName: { color: theme.ink, fontSize: 14 },
  splitValueInput: { borderWidth: 1, borderColor: theme.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, width: 100, textAlign: 'right', color: theme.ink },
});
