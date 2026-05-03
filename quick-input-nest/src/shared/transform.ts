export function transformInput(text: string): string | null {
  const clean = text.trim().toLowerCase().replace(/^r/i, '');
  if (!clean) return null;

  if (clean.endsWith('m')) {
    const num = parseFloat(clean.slice(0, -1));
    if (isNaN(num)) return null;
    const value = Math.round(num * 1_000_000);
    if (value % 1_000_000 === 0) {
      return `R${Math.round(value / 1_000_000)}m`;
    }
    if (value % 1000 === 0) {
      return `R${Math.round(value / 1000)}k`;
    }
    return `R${num}m`;
  }

  if (clean.endsWith('k')) {
    const num = parseFloat(clean.slice(0, -1));
    if (isNaN(num)) return null;
    const value = Math.round(num * 1000);
    if (value >= 1_000_000) {
      const m = value / 1_000_000;
      if (m % 1 === 0) return `R${Math.round(m)}m`;
      return `R${m.toFixed(1)}m`;
    }
    if (value % 1000 === 0) {
      return `R${Math.round(value / 1000)}k`;
    }
    return `R${num}k`;
  }

  const num = parseFloat(clean);
  if (!isNaN(num)) {
    if (num >= 1_000_000) {
      const m = num / 1_000_000;
      if (m % 1 === 0) return `R${Math.round(m)}m`;
      if ((num / 1000) % 1 === 0) return `R${Math.round(num / 1000)}k`;
      return `R${m.toFixed(1)}m`;
    }
    if (num >= 1000) {
      const k = num / 1000;
      if (k % 1 === 0) return `R${Math.round(k)}k`;
      return `R${k.toFixed(1)}k`;
    }
    return `R${Math.round(num)}`;
  }

  return null;
}
