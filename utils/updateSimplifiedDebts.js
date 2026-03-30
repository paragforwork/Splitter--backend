const mongoose = require('mongoose');

const toCents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => Math.round(value) / 100;
const pairKey = (from, to) => `${from}->${to}`;

const updateSimplifiedDebts = (existingDebts = [], newDebts = []) => {
  const ledger = new Map();

  const applyDebt = (from, to, amountCents) => {
    if (!from || !to || from === to || amountCents <= 0) return;

    const forward = pairKey(from, to);
    const reverse = pairKey(to, from);
    const reverseAmount = ledger.get(reverse) || 0;

    if (reverseAmount > 0) {
      if (reverseAmount === amountCents) {
        ledger.delete(reverse);
      } else if (reverseAmount > amountCents) {
        ledger.set(reverse, reverseAmount - amountCents);
      } else {
        ledger.delete(reverse);
        ledger.set(forward, (ledger.get(forward) || 0) + (amountCents - reverseAmount));
      }
      return;
    }

    ledger.set(forward, (ledger.get(forward) || 0) + amountCents);
  };

  for (const debt of existingDebts) {
    const from = debt.from?.toString?.() || debt.from?.toString();
    const to = debt.to?.toString?.() || debt.to?.toString();
    applyDebt(from, to, toCents(debt.amount));
  }

  for (const debt of newDebts) {
    const from = debt.from?.toString?.() || debt.from?.toString();
    const to = debt.to?.toString?.() || debt.to?.toString();
    applyDebt(from, to, toCents(debt.amount));
  }

  return [...ledger.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([entry, cents]) => {
      const [from, to] = entry.split('->');
      return {
        from: new mongoose.Types.ObjectId(from),
        to: new mongoose.Types.ObjectId(to),
        amount: fromCents(cents)
      };
    });
};

module.exports = updateSimplifiedDebts;
