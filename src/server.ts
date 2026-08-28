import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT deve ser um número inteiro positivo.');
}

app.listen(port, () => {
  console.log(`OSGestor API disponível em http://localhost:${port}`);
});