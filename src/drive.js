const GDRIVE_CLIENT_ID = '864707039212-vosjr7obitpbcd7hjol8d2cvq5d6aj7u.apps.googleusercontent.com';
const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GDRIVE_FOLDER = 'GazeTrack Sessions';
export const AUTHORISED_EMAIL = 'aashna.v01@gmail.com';

export function getGoogleToken() {
  return new Promise((resolve, reject) => {
    if (!window.google) { reject(new Error('Google Identity Services not loaded')); return; }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPE + ' https://www.googleapis.com/auth/userinfo.email',
      prompt: '',
      hint: AUTHORISED_EMAIL,
      callback: async (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        try {
          const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: 'Bearer ' + resp.access_token } });
          const { email } = await info.json();
          if (email.toLowerCase() !== AUTHORISED_EMAIL.toLowerCase()) {
            reject(new Error('WRONG_ACCOUNT:' + email)); return;
          }
        } catch { /* allow through */ }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

export async function findOrCreateFolder(name, token) {
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return (await create.json()).id;
}

export async function uploadFile(csvText, filename, folderId, token) {
  const boundary = '-------GazeTrackBoundary';
  const body = `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--`;
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
  return resp.json();
}

export async function uploadToDrive(csvText, filename, onStatus) {
  onStatus('☁️', 'Saving to Google Drive…', 'var(--border)');
  const token = await getGoogleToken();
  const folderId = await findOrCreateFolder(GDRIVE_FOLDER, token);
  onStatus('⬆️', 'Uploading…', 'rgba(0,229,176,0.4)');
  const result = await uploadFile(csvText, filename, folderId, token);
  onStatus('✅', 'Saved! Click "Open in Drive" to view', 'rgba(0,229,176,0.4)');
  return { fileId: result.id || null, folderId };
}
