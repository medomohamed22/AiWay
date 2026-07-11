import { json, method } from './_lib/http.js';
import { MODELS, PACKAGES } from './_lib/catalog.js';

export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  const piPrice = Number(process.env.PI_USD_PRICE);
  json(res, 200, {
    models: MODELS,
    packages: PACKAGES.map(({ id, usd, tokens }) => ({ id, usd, tokens })),
    piUsdPrice: Number.isFinite(piPrice) && piPrice > 0 ? piPrice : null,
    paymentsEnabled: Number.isFinite(piPrice) && piPrice > 0
  });
}
