import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { routes } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(routes);