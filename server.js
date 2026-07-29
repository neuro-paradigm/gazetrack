import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Serve built frontend FIRST (before any API routes) ──────────────────────
// This must come first so .css/.js assets are served with correct MIME types
// and don't fall through to the catch-all HTML route.
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.css'))  res.setHeader('Content-Type', 'text/css');
    if (filePath.endsWith('.js'))   res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
  }
}));

app.use(cors());
// Increase payload limit for large CSV strings
app.use(express.json({ limit: '50mb' }));

// MongoDB Connection
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));
} else {
  console.warn('WARNING: MONGODB_URI environment variable not set. Sessions will not be saved to MongoDB.');
}

// Mongoose Schema
const sessionSchema = new mongoose.Schema({
  participantId: String,
  group: String,
  timestamp: { type: Date, default: Date.now },
  csvData: String // Save as raw CSV string as requested
});

const Session = mongoose.model('Session', sessionSchema);

// API Endpoint to save session
app.post('/api/sessions', async (req, res) => {
  try {
    const { participantId, group, csvData } = req.body;
    
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({ success: false, message: 'Database not configured' });
    }

    const session = new Session({
      participantId: participantId || 'Unknown',
      group: group || 'Unknown',
      csvData
    });

    await session.save();
    res.status(200).json({ success: true, message: 'Session saved successfully' });
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ success: false, message: 'Error saving session' });
  }
});

// Admin Dashboard - HTML Page
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>GazeTrack Admin</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #f0f4f8; padding: 40px; color: #1e293b; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; color: #475569; }
        .btn { display: inline-block; padding: 6px 12px; background: #0d9488; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; }
        .btn:hover { background: #0f766e; }
        .empty { text-align: center; padding: 40px; color: #64748b; font-style: italic; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>GazeTrack Sessions</h1>
        <p>All sessions securely saved to MongoDB are listed below.</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Participant ID</th>
              <th>Group</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="4" class="empty">Loading sessions...</td></tr>
          </tbody>
        </table>
      </div>
      <script>
        fetch('/api/admin/sessions')
          .then(res => res.json())
          .then(data => {
            const tbody = document.getElementById('table-body');
            if (!data.sessions || data.sessions.length === 0) {
              tbody.innerHTML = '<tr><td colspan="4" class="empty">No sessions found in database.</td></tr>';
              return;
            }
            tbody.innerHTML = data.sessions.map(s => \`
              <tr>
                <td>\${new Date(s.timestamp).toLocaleString()}</td>
                <td><strong>\${s.participantId}</strong></td>
                <td>\${s.group}</td>
                <td><a href="/api/admin/sessions/\${s._id}/csv" class="btn" download="\${s.participantId}_gaze.csv">Download CSV</a></td>
              </tr>
            \`).join('');
          })
          .catch(err => {
            document.getElementById('table-body').innerHTML = '<tr><td colspan="4" class="empty">Error loading sessions. Is MongoDB connected?</td></tr>';
          });
      </script>
    </body>
    </html>
  `);
});

// Admin API: List sessions (without raw CSV data to save bandwidth)
app.get('/api/admin/sessions', async (req, res) => {
  try {
    const sessions = await Session.find({}, { csvData: 0 }).sort({ timestamp: -1 });
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Admin API: Download specific CSV
app.get('/api/admin/sessions/:id/csv', async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).send('Session not found');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${session.participantId}_gaze.csv"`);
    res.send(session.csvData);
  } catch (error) {
    res.status(500).send('Error retrieving CSV');
  }
});

// Google Drive Proxy: List Stimuli Files
app.get('/api/stimuli/list', async (req, res) => {
  const apiKey = process.env.GDRIVE_API_KEY;
  const folderId = process.env.GDRIVE_STIMULI_FOLDER_ID;
  
  if (!apiKey || !folderId) {
    return res.status(500).json({ success: false, message: 'Google Drive proxy not configured (missing API key or Folder ID)' });
  }

  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&key=${apiKey}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Drive API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    
    // Filter out folders, only keep images/videos
    const mediaFiles = data.files.filter(f => f.mimeType.startsWith('video/') || f.mimeType.startsWith('image/'));
    res.json({ success: true, files: mediaFiles });
  } catch (error) {
    console.error('Error listing stimuli:', error);
    res.status(500).json({ success: false, message: 'Error fetching files from Google Drive' });
  }
});

// Google Drive Proxy: Stream Media
app.get('/api/stimuli/media/:id', async (req, res) => {
  const apiKey = process.env.GDRIVE_API_KEY;
  if (!apiKey) return res.status(500).send('Google Drive API key not configured');

  const fileId = req.params.id;
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;

  try {
    const headers = {};
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const response = await fetch(url, { headers });
    
    res.status(response.status);
    
    response.headers.forEach((value, key) => {
      // Don't forward Content-Encoding if it's going to mess up streaming
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error('Error streaming media:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

// Fallback for SPA — only send index.html for non-asset, non-API routes
app.use((req, res) => {
  // Don't serve index.html for API or asset requests
  if (req.path.startsWith('/api/') || req.path.match(/\.(js|css|wasm|png|jpg|svg|ico|map)$/)) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
