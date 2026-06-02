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

// Serve static frontend in production
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for React Router (if used)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
