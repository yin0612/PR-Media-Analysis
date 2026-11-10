import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file='.local/Cloudflare服務存取碼.txt';
mkdirSync('.local',{recursive:true});
const code=existsSync(file)?readFileSync(file,'utf8').split(/\r?\n/)[0]:randomBytes(36).toString('base64url');
if(!existsSync(file))writeFileSync(file,code+'\n\n此為工作空間服務存取碼，請勿公開或提交至 GitHub。\n到網站「資料與服務設定」，貼上第一行並按「驗證存取碼並連線」。\nAI 與新聞擷取需此碼；專案與報導資料仍保存在目前瀏覽器。\n',{flag:'wx',mode:0o600});
const output=execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','put','SERVICE_ACCESS_KEY','--config','worker/wrangler.jsonc'],{input:code+'\n',encoding:'utf8',windowsHide:true});
console.log(output);console.log('Access code saved locally; excluded from Git.');
