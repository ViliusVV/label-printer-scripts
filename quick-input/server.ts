import { Elysia } from "elysia";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dir, "../data/inputs.txt");
const PORT = 3000;

const html = `<!DOCTYPE html>
<html lang=en>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Quick Input</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:1rem;max-width:600px;color:#222}
  form{display:flex;gap:.5rem;margin-bottom:1rem}
  input{flex:1;font-size:1.4rem;padding:.7rem;border:2px solid #bbb;border-radius:.5rem;outline:none}
  input:focus{border-color:#2563eb}
  ul{list-style:none;padding:0;margin:0}
  li{padding:.6rem .7rem;border-bottom:1px solid #eee;font-size:1.05rem;border-radius:.3rem}
  li.new{animation:flash 2.5s ease-out forwards}
  @keyframes flash{0%{background:#fde68a}100%{background:transparent}}
  .empty{color:#888;font-style:italic;padding:.6rem .7rem}
</style>
</head>
<body>
<form id=f autocomplete=off>
  <input id=t name=t autofocus enterkeyhint=send autocapitalize=off autocorrect=off spellcheck=false placeholder="Type and press Enter">
</form>
<ul id=list></ul>
<script>
const f=document.getElementById('f'),t=document.getElementById('t'),list=document.getElementById('list');
async function load(highlight){
  const r=await fetch('/list');
  const lines=await r.json();
  list.innerHTML='';
  if(!lines.length){list.innerHTML='<div class=empty>No entries yet</div>';return}
  lines.forEach((line,i)=>{
    const li=document.createElement('li');
    li.textContent=line;
    if(highlight&&i===0)li.className='new';
    list.appendChild(li);
  });
}
f.addEventListener('submit',async e=>{
  e.preventDefault();
  const v=t.value.trim();
  if(!v)return;
  t.value='';
  t.focus();
  await fetch('/add',{method:'POST',headers:{'Content-Type':'text/plain'},body:v});
  load(true);
});
load(false);
</script>
</body>
</html>`;

new Elysia()
  .get("/", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }))
  .post("/add", async ({ body }) => {
    const text = (typeof body === "string" ? body : "").trim();
    if (text) await appendFile(FILE, text + "\n", "utf-8");
    return "ok";
  })
  .get("/list", async () => {
    try {
      const data = await readFile(FILE, "utf-8");
      return data.split("\n").filter(Boolean).reverse().slice(0, 10);
    } catch {
      return [];
    }
  })
  .listen({ hostname: "0.0.0.0", port: PORT });

console.log(`Quick Input listening on http://0.0.0.0:${PORT}  →  writing to ${FILE}`);
