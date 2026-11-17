const brandKeywords = ["藍新金流", "藍新科技", "NewebPay"];
export const agentCommerce =
  /ai\s*(導購|購物)|buytalk agent|代理式(商務|支付)/i;

export function cleanNewsIssue(text: string) {
  return text
    .trim()
    .replace(/^(藍新金流|藍新科技|藍新|newebpay)(?:\s+|$)/i, "")
    .replace(/\s+/g, " ");
}

export function newsGoogleTerms(
  query: string,
  topicId: string,
  issue?: string,
  aliases: readonly string[] = [],
) {
  if (issue) {
    const terms = aliases.length ? [issue, ...aliases] : issue.split(/\s+/);
    const quoted = terms.map((term) => '"' + term.replaceAll('"', "") + '"');
    return (
      '"藍新" ' +
      (aliases.length ? "(" + quoted.join(" OR ") + ")" : quoted.join(" "))
    );
  }
  return topicId === "newebpay"
    ? '("藍新金流" OR "藍新科技" OR NewebPay)'
    : query;
}

export function newsKeywords(
  text: string,
  topicId: string,
  query: string,
  issue?: string,
  aliases: readonly string[] = [],
) {
  const normalized = text.normalize("NFKC").toLowerCase();
  if (issue) {
    if (normalized.includes("藍新資訊")) return [];
    const brand =
      brandKeywords.find((word) => normalized.includes(word.toLowerCase())) ||
      (normalized.includes("藍新") ? "藍新" : "");
    if (!brand) return [];
    const words = issue.normalize("NFKC").split(/\s+/).filter(Boolean);
    const matched = aliases.filter((word) =>
      normalized.includes(word.toLowerCase()),
    );
    if (words.every((word) => normalized.includes(word.toLowerCase())))
      matched.unshift(...words);
    return matched.length ? [brand, ...new Set(matched)] : [];
  }
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
