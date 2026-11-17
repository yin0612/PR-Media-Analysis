const brandKeywords = ["藍新金流", "藍新科技", "NewebPay"];
export const agentCommerce =
  /ai\s*(導購|購物)|buytalk agent|代理式(商務|支付)/i;

export function newsKeywords(text: string, topicId: string, query: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  if (topicId === "newebpay") {
    if (normalized.includes("藍新資訊")) return [];
    const matches = brandKeywords.filter((word) =>
      normalized.includes(word.toLowerCase()),
    );
    return matches.length
      ? matches
      : normalized.includes("藍新") && agentCommerce.test(normalized)
        ? ["藍新"]
        : [];
  }
  const words = [
    ...new Set(query.normalize("NFKC").split(/\s+/).filter(Boolean)),
  ];
  return words.every((word) => normalized.includes(word.toLowerCase()))
    ? words
    : [];
}
