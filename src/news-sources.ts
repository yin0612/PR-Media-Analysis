export interface MediaSource {
  id: string;
  name: string;
  site: string;
  rss?: string;
}

export const supplementalNewsSources: readonly MediaSource[] = [
  { id: "ldplayer", name: "雷電模擬器", site: "news.ldplayer.tw" },
  { id: "ohmygod", name: "OHMYGOD 歐買尬", site: "news.omg.com.tw" },
  {
    id: "2000fun",
    name: "2000Fun",
    site: "2000fun.com",
    rss: "https://www.2000fun.com/feed",
  },
  {
    id: "3kingtw",
    name: "鑫台灣財經網",
    site: "3kingtw.com",
    rss: "https://3kingtw.com/feed/",
  },
  {
    id: "digitimes",
    name: "DIGITIMES 科技網",
    site: "digitimes.com.tw",
    rss: "https://www.digitimes.com.tw/tech/rss/xml/xmlrss_10_60.xml",
  },
  { id: "setn-finance", name: "三立新聞網", site: "inews.setn.com" },
  { id: "ttv-finance", name: "台視財經網", site: "www.ttv.com.tw/finance" },
  { id: "ebc-finance", name: "東森財經網", site: "fnc.ebc.net.tw" },
  { id: "wearn", name: "聚財網", site: "news.wearn.com" },
  { id: "wearn-x", name: "聚財X", site: "x.wearn.com" },
  { id: "cmoney", name: "CMoney", site: "cmoney.tw/forum" },
  { id: "smart-flow", name: "智流 Smart Flow", site: "smart-flow.rd.coach" },
  { id: "biggo", name: "BigGo 財經", site: "finance.biggo.com.tw" },
];
