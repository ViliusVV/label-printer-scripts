export function transformInput(text: string): string {
  const clean = text.trim().toLowerCase().replace(/^r/i, '');

  if (clean.endsWith('k')) {
    const num = parseFloat(clean.slice(0, -1));
    if (isNaN(num)) return text;
    const value = Math.round(num * 1000);
    if (value % 1000 === 0) {
      return `R${Math.round(value / 1000)}k`;
    }
    return `R${num}k`;
  }

  const num = parseFloat(clean);
  if (!isNaN(num)) {
    if (num >= 1000) {
      const k = num / 1000;
      if (k % 1 === 0) return `R${Math.round(k)}k`;
      return `R${k.toFixed(1)}k`;
    }
    return `R${Math.round(num)}`;
  }

  return text;
}
