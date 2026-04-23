import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import axios from 'axios';

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

async function startServer() {
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Proxy endpoint for Google Sheets to bypass CORS
  app.get('/api/proxy-sheet', async (req, res) => {
    const { gid } = req.query;
    const maxRetries = 3;
    let attempts = 0;

    const fetchWithRetry = async (): Promise<any> => {
      attempts++;
      try {
        const baseUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQtttJgxlXlRGy84m6PfCqE-R_YmkAPujL1CkyhHhjNmPDMz5nXKVznj6ybpIn2uVjQzhoce9Yi-Jgl/pub';
        return await axios.get(baseUrl, {
          params: {
            output: 'csv',
            gid: gid,
            single: 'true', // Required for some specific tabs
            t: Date.now()
          },
          timeout: 30000, 
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/csv, application/csv, text/plain'
          }
        });
      } catch (error: any) {
        if (attempts < maxRetries && (!error.response || error.response.status >= 500)) {
          console.log(`Retrying GID ${gid} (Attempt ${attempts + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchWithRetry();
        }
        throw error;
      }
    };

    try {
      const response = await fetchWithRetry();
      res.setHeader('Content-Type', 'text/csv');
      res.send(response.data);
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.warn(`GID ${gid} is NOT accessible. Please check if this tab is specifically "Published to the Web" in Google Sheets.`);
      } else {
        console.error(`Proxy Error for GID ${gid} after ${attempts} attempts:`, error.message);
      }
      
      if (error.response) {
        res.status(error.response.status).send(error.response.data);
      } else {
        res.status(504).json({ error: 'Gateway Timeout or Connection Failed after retries' });
      }
    }
  });

  // Webhook endpoint for Google Sheets
  // The user will set their Google Apps Script to hit this URL
  app.post('/api/webhook/sheet-update', (req, res) => {
    console.log('Received update signal from Google Sheet');
    // Notify all connected browsers to refresh their data
    io.emit('sheet-updated', { timestamp: Date.now() });
    res.status(200).json({ success: true, message: 'Update signal broadcasted' });
  });

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    // Production static serving (only if NOT on Vercel, Vercel handles static itself)
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if we're not in a serverless environment (detected by VERCEL env var)
  if (!process.env.VERCEL) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
