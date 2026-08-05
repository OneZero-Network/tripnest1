import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { getDB } from './db';

WebBrowser.maybeCompleteAuthSession();

// SETUP REQUIRED BEFORE THIS WORKS: this needs a real OAuth client ID registered in
// Google Cloud Console (APIs & Services → Credentials → OAuth client ID → Android/
// Expo), with the Google Drive API enabled on that project. There is no way to ship a
// working client ID without the founder's own Google Cloud project — this is real,
// necessary setup, not a placeholder that should be treated as "already working."
const GOOGLE_CLIENT_ID = 'REPLACE_WITH_YOUR_GOOGLE_CLOUD_OAUTH_CLIENT_ID';

// drive.file, not full Drive access: TripNest can only ever see files IT created through
// this app, never anything else already in the user's Drive. That's the actual privacy
// commitment here — "optional Google backup" should not quietly mean "read your Drive."
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const BACKUP_FILENAME = 'TripNest Backup.json';
const DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export async function signInWithGoogle() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'tripnest' });
  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Token, // implicit flow: simplest for a client-only app with no backend to hold a refresh token securely
  });
  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success') return null;
  return result.authentication?.accessToken || result.params?.access_token || null;
}

// ---- Export: every trip's structured data, as one JSON snapshot. Document attachments
// (the actual photo/PDF bytes) are NOT included in this first version — only their
// filenames and metadata. Restoring a backup gets every trip, traveler, expense,
// contribution, note, plan item, and settlement back, but re-attaching original document
// files is not yet part of this flow. Said here plainly rather than silently losing files
// on restore and letting someone discover that the hard way. ----
async function exportAllData() {
  const db = await getDB();
  const tables = ['trips', 'travelers', 'expenses', 'contributions', 'notes', 'documents', 'itinerary_items', 'settlements', 'timeline'];
  const data = {};
  for (const table of tables) {
    data[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  }
  return { version: 1, exportedAt: Date.now(), data };
}

// Idempotent merge, not a destructive overwrite: every row uses INSERT OR IGNORE, keyed
// on its existing id. Restoring onto an empty (new) device fully repopulates it. Restoring
// onto a device that already has some of this data just fills in whatever's missing —
// it will never silently delete or overwrite something already on the device.
async function importAllData(backup) {
  const db = await getDB();
  const tableColumns = {
    trips: ['id', 'name', 'created_at', 'status', 'contribution_per_person', 'custodian', 'base_currency', 'has_trip_bank'],
    travelers: ['id', 'trip_id', 'name'],
    expenses: ['id', 'trip_id', 'paid_by', 'amount', 'description', 'created_at', 'currency', 'fx_rate', 'category', 'funding_source'],
    contributions: ['id', 'trip_id', 'traveler', 'amount', 'created_at', 'currency', 'fx_rate'],
    notes: ['id', 'trip_id', 'text', 'created_at', 'pinned_emergency'],
    documents: ['id', 'trip_id', 'name', 'uri', 'mime_type', 'created_at', 'pinned_emergency'],
    itinerary_items: ['id', 'trip_id', 'title', 'location', 'scheduled_at', 'created_at', 'notification_id'],
    settlements: ['id', 'trip_id', 'from_traveler', 'to_traveler', 'amount', 'created_at'],
    timeline: ['id', 'trip_id', 'event', 'type', 'metadata', 'created_at'],
  };
  let restoredCount = 0;
  for (const [table, columns] of Object.entries(tableColumns)) {
    const rows = backup.data?.[table] || [];
    for (const row of rows) {
      const values = columns.map((c) => (row[c] === undefined ? null : row[c]));
      const placeholders = columns.map(() => '?').join(', ');
      await db.runAsync(
        `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        ...values
      );
      restoredCount++;
    }
  }
  return restoredCount;
}

async function findBackupFile(accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`)}&spaces=drive&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = await res.json();
  return json.files?.[0] || null;
}

export async function backupToGoogleDrive(accessToken) {
  const payload = await exportAllData();
  const content = JSON.stringify(payload);
  const existing = await findBackupFile(accessToken);

  const metadata = existing ? {} : { name: BACKUP_FILENAME, mimeType: 'application/json' };
  const boundary = 'tripnest_backup_boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const res = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  return true;
}

export async function restoreFromGoogleDrive(accessToken) {
  const file = await findBackupFile(accessToken);
  if (!file) return { restored: 0, found: false };

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const backup = await res.json();
  const restoredCount = await importAllData(backup);
  return { restored: restoredCount, found: true };
}
