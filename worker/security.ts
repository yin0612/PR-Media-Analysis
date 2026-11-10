export function publicUrl(raw: string, allowlist: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("網址格式不正確");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port))
  )
    throw new Error("僅允許公開 HTTP／HTTPS 網址");
  const host = u.hostname.toLowerCase();
  if (
    host.includes(":") ||
    /^[\d.]+$/.test(host) ||
    !host.includes(".") ||
    ["localhost", "metadata.google.internal"].includes(host) ||
    /\.(local|internal|localhost)$/.test(host)
  )
    throw new Error("無法擷取內部網路或 IP 位址");
  if (
    !allowlist
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .includes(host)
  )
    throw new Error("此新聞網域尚未列入後端允許清單，可手動貼上內文");
  return u;
}
export function publicIP(ip: string) {
  if (ip.includes(":"))
    return /^(2|3)[0-9a-f]{0,3}:/i.test(ip) && !/^2001:(db8|0|2|10):/i.test(ip);
  const a = ip.split(".").map(Number);
  if (a.length !== 4 || a.some((x) => !Number.isInteger(x) || x < 0 || x > 255))
    return false;
  return !(
    a[0] === 0 ||
    a[0] === 10 ||
    a[0] === 127 ||
    a[0] >= 224 ||
    (a[0] === 169 && a[1] === 254) ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && [0, 168].includes(a[1])) ||
    (a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
    (a[0] === 198 && [18, 19].includes(a[1]))
  );
}
export async function verifyDNS(host: string) {
  const values = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!r.ok) throw new Error("無法驗證新聞網域");
      const d = (await r.json()) as {
        Answer?: { type: number; data: string }[];
      };
      return (d.Answer || [])
        .filter((x) => [1, 28].includes(x.type))
        .map((x) => x.data);
    }),
  );
  const ips = values.flat();
  if (!ips.length || ips.some((ip) => !publicIP(ip)))
    throw new Error("新聞網址未解析至允許的公開網路");
}
export async function readLimited(
  response: Pick<Response, "body">,
  max: number,
) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  let bytes = 0;
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        throw new Error("內容超過處理上限");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
