import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for React Router (if used)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
