// Deliberately the /legacy entry point, not the bare 'expo-file-system' import: since
// Expo SDK 54, the default export replaced documentDirectory/getInfoAsync/copyAsync/
// deleteAsync/makeDirectoryAsync with a new File/Directory class API — calling any of the
// old function-style methods via the default import now throws at runtime. This file
// uses the old API throughout, so it needs the explicit /legacy path. This was very
// likely the actual cause of "document attachment is not functioning" — every call below
// would have failed silently or thrown.
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { getDB, computeFinance, logTimelineEvent } from './db';
const DOCS_DIR = FileSystem.documentDirectory + 'tripnest_documents/';

async function ensureDocsDir() {
  const info = await FileSystem.getInfoAsync(DOCS_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
}

// Documents must survive offline and outlive the OS picker cache,
// so we copy the picked file into our own sandboxed storage rather than
// keeping a reference to a transient content:// / cache URI.
export async function pickAndAddDocument(tripId) {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled) return null;

  const file = result.assets[0];
  await ensureDocsDir();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const destUri = `${DOCS_DIR}${id}${ext ? '.' + ext : ''}`;

  await FileSystem.copyAsync({ from: file.uri, to: destUri });

  const db = await getDB();
  await db.runAsync(
    'INSERT INTO documents (id, trip_id, name, uri, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, tripId, file.name, destUri, file.mimeType || null, Date.now()
  );
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'document', title: `Document attached: ${file.name}`, timestamp: ts, idSuffix: '_t' });
  return id;
}

export async function openDocument(uri) {
  const available = await Sharing.isAvailableAsync();
  if (available) await Sharing.shareAsync(uri);
}

export async function deleteDocument(id, uri, tripId, name) {
  const db = await getDB();
  await db.runAsync('DELETE FROM documents WHERE id = ?', id);
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
  if (tripId) {
    const ts = Date.now();
    await logTimelineEvent({ tripId, type: 'document', title: `Document removed: ${name ?? ''}`, timestamp: ts, idSuffix: '_dd' });
  }
}

// ---- Local Export ----
// Builds a self-contained HTML snapshot of the trip. This is the single
// source both the "Local Export" feature and the "Read-only Share Page"
// screen render from, so the two stay in sync by construction.
export async function buildTripHTML(tripId, tripName) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId);
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const expenses = await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at ASC', tripId);
  const notes = await db.getAllAsync('SELECT * FROM notes WHERE trip_id = ? ORDER BY created_at ASC', tripId);
  const documents = await db.getAllAsync('SELECT * FROM documents WHERE trip_id = ? ORDER BY created_at ASC', tripId);
  const timeline = await db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at ASC', tripId);
  const finance = await computeFinance(tripId);

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const settlementBlock = (s) => `
    ${Object.entries(s.balances).map(([name, bal]) => `<div class="item">${esc(name)}: ${bal >= 0 ? '+' : ''}${bal}</div>`).join('')}
    ${s.transactions.length ? '<p><b>Who pays whom:</b></p>' + s.transactions.map(t => `<div class="item">${esc(t.from)} → ${esc(t.to)}: ${t.amount}</div>`).join('') : '<p class="muted">All settled up.</p>'}`;

  return `
  <html><head><meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F5C56; padding: 24px; }
    h1 { border-bottom: 3px solid #0F5C56; padding-bottom: 8px; }
    h2 { margin-top: 28px; color: #0F5C56; }
    .item { padding: 6px 0; border-bottom: 1px solid #E1F0EE; }
    .muted { color: #6B8E89; font-size: 0.9em; }
    .badge { display: inline-block; background: #E1F0EE; border-radius: 12px; padding: 2px 10px; margin: 2px; }
    .statRow { display: flex; gap: 24px; margin: 8px 0; }
  </style></head>
  <body>
    <h1>${esc(tripName)}</h1>
    <p class="muted">Exported from TripNest${trip?.status === 'closed' ? ' — Closed Trip' : ''}. Complete trip record, generated on-device.</p>

    <h2>Trip Summary</h2>
    <div class="statRow">
      <span>Travelers: <b>${travelers.length}</b></span>
      <span>Expenses logged: <b>${expenses.length}</b></span>
      <span>Total spent: <b>${finance.totalSpent}</b></span>
    </div>

    <h2>Travelers</h2>
    ${travelers.map(t => `<span class="badge">${esc(t.name)}</span>`).join(' ') || '<p class="muted">None added.</p>'}

    <h2>Expenses</h2>
    ${expenses.map(e => `<div class="item">${esc(e.paid_by)} paid <b>${e.amount}</b> — ${esc(e.description)}</div>`).join('') || '<p class="muted">No expenses recorded.</p>'}

    <h2>Finance</h2>
    <div class="statRow">
      <span>Received: <b>${finance.totalReceived}</b></span>
      <span>Spent: <b>${finance.totalSpent}</b></span>
      <span>Cash remaining: <b>${finance.currentCash}</b></span>
    </div>
    ${finance.fundTarget != null ? `<p class="muted">Fund target: ${finance.perPerson} × ${finance.travelerCount} travelers = ${finance.fundTarget}</p>` : ''}
    ${finance.contributions.length ? finance.contributions.map(c => `<div class="item">${esc(c.traveler)} contributed ${c.amount}</div>`).join('') : '<p class="muted">No contributions recorded.</p>'}

    <h2>${trip?.status === 'closed' ? 'Final Settlement' : 'Live Forecast (trip still open)'}</h2>
    ${settlementBlock(trip?.status === 'closed' ? finance.finalSettlement : finance.liveForecast)}

    <h2>Notes</h2>
    ${notes.map(n => `<div class="item">${esc(n.text)}</div>`).join('') || '<p class="muted">No notes.</p>'}

    <h2>Documents Index</h2>
    ${documents.length
      ? '<p class="muted">File names only — attachments themselves aren\'t embedded in this PDF.</p>' +
        documents.map(d => `<div class="item">${esc(d.name)} — ${new Date(d.created_at).toLocaleDateString()}</div>`).join('')
      : '<p class="muted">No documents attached.</p>'}

    <h2>Timeline</h2>
    ${timeline.map(e => `<div class="item">${new Date(e.created_at).toLocaleString()} — ${esc(e.event)}</div>`).join('') || '<p class="muted">No events yet.</p>'}
  </body></html>`;
}

// Local Export: renders the HTML snapshot to a PDF file on-device, no network involved.
export async function exportTripPDF(tripId, tripName) {
  const html = await buildTripHTML(tripId, tripName);
  const { uri } = await Print.printToFileAsync({ html });
  const available = await Sharing.isAvailableAsync();
  if (available) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${tripName} — TripNest Export` });
  return uri;
}
