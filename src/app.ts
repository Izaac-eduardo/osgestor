import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { routes } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean);
    callback(null, allowed.includes(origin) ? origin : false);
  },
}));
app.use(express.json());
app.use(routes);
