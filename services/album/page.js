// The phone page served by manager.js. One self-contained HTML document (no outside
// files), in plain ES5 so it runs in any phone browser.

'use strict';

var STYLE = [
	'*{box-sizing:border-box}',
	'body{margin:0;padding:24px 18px 40px;background:#0b0b0b;color:#eee;font:17px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
	'h1{margin:0 0 4px;font-size:24px;font-weight:600}',
	'.sub{margin:0 0 24px;color:#999;font-size:15px}',
	'h2{margin:28px 0 10px;font-size:15px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:.08em}',
	'textarea{width:100%;min-height:84px;padding:12px;border:1px solid #333;border-radius:12px;background:#161616;color:#eee;font:inherit;resize:vertical}',
	'button{font:inherit;border:0;border-radius:12px;cursor:pointer}',
	'.add{width:100%;margin-top:10px;padding:14px;background:#eee;color:#000;font-weight:600}',
	'.add:disabled{opacity:.5}',
	'.msg{margin-top:12px;padding:12px;border-radius:12px;font-size:15px;display:none}',
	'.msg.ok{display:block;background:#12301c;color:#9be3b0}',
	'.msg.err{display:block;background:#3a1414;color:#f3a3a3}',
	'ul{list-style:none;margin:0;padding:0}',
	'li{display:flex;align-items:center;padding:14px 0;border-bottom:1px solid #222}',
	'li .t{flex:1;min-width:0;margin-right:12px}',
	'li .t b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
	'li .t span{color:#888;font-size:14px}',
	'.rm{padding:10px 14px;background:#2a2a2a;color:#f3a3a3}',
	'.empty{color:#777;padding:12px 0}',
	'.help{margin-top:28px;color:#777;font-size:14px}'
].join('');

var SCRIPT = [
	'(function(){',
	'var token=(location.search.match(/[?&]t=([^&]+)/)||[])[1]||"";',
	'var list=document.getElementById("list"),msg=document.getElementById("msg"),input=document.getElementById("link"),btn=document.getElementById("add");',
	'function show(text,ok){msg.textContent=text;msg.className="msg "+(ok?"ok":"err");}',
	'function call(path,body,done){var x=new XMLHttpRequest();x.open(body?"POST":"GET",path+"?t="+token);x.setRequestHeader("Content-Type","application/json");',
	' x.onload=function(){var d={};try{d=JSON.parse(x.responseText)}catch(e){}done(x.status,d)};x.onerror=function(){done(0,{error:"A TV não respondeu. O celular está no mesmo Wi-Fi?"})};x.send(body?JSON.stringify(body):null);}',
	'function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}',
	'function render(albums){if(!albums.length){list.innerHTML="<li class=\\"empty\\">Nenhum álbum na TV ainda.</li>";return;}',
	' list.innerHTML=albums.map(function(a,i){return "<li><div class=\\"t\\"><b>"+esc((a.title||"Álbum").split(" · ")[0])+"</b><span>"+(a.count||0)+" fotos</span></div><button class=\\"rm\\" data-i=\\""+i+"\\">Remover</button></li>"}).join("");',
	' var buttons=list.querySelectorAll(".rm");for(var k=0;k<buttons.length;k++){buttons[k].onclick=function(){var a=albums[this.getAttribute("data-i")];',
	'  if(!confirm("Remover \\""+(a.title||"este álbum").split(" · ")[0]+"\\" da TV?"))return;',
	'  call("/api/remove",{url:a.url},function(s,d){if(s===200){render(d.albums);show(d.note||"Removido.",true)}else show(d.error||"Não deu certo.",false)})}}}',
	'btn.onclick=function(){var link=input.value.trim();if(!link){show("Cole o link do álbum primeiro.",false);return;}',
	' btn.disabled=true;btn.textContent="Lendo o álbum…";',
	' call("/api/add",{url:link},function(s,d){btn.disabled=false;btn.textContent="Adicionar à TV";if(s===200){input.value="";render(d.albums);show(d.note||"Adicionado.",true)}else show(d.error||"Não deu certo.",false)})};',
	'call("/api/albums",null,function(s,d){if(s===200)render(d.albums);else show(d.error||"Não consegui falar com a TV.",false)});',
	'})();'
].join('\n');

function html () {
	return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
		+ '<meta name="viewport" content="width=device-width,initial-scale=1">'
		+ '<title>Álbuns da TV</title><style>' + STYLE + '</style></head><body>'
		+ '<h1>Álbuns da TV</h1>'
		+ '<p class="sub">As fotos desses álbuns aparecem na tela inicial da TV.</p>'
		+ '<h2>Adicionar álbum</h2>'
		+ '<textarea id="link" placeholder="Cole aqui o link do álbum compartilhado (photos.app.goo.gl/…)" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>'
		+ '<button class="add" id="add">Adicionar à TV</button>'
		+ '<div class="msg" id="msg"></div>'
		+ '<h2>Na TV agora</h2><ul id="list"><li class="empty">Carregando…</li></ul>'
		+ '<p class="help">No Google Fotos: abra o álbum, toque em Compartilhar e depois em Criar link. Quem tiver o link consegue ver o álbum.</p>'
		+ '<script>' + SCRIPT + '</script></body></html>';
}

function forbidden () {
	return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
		+ '<title>Álbuns da TV</title><style>' + STYLE + '</style></head><body>'
		+ '<h1>Link expirado</h1><p class="sub">Abra as fotos em tela cheia na TV, aperte OK e escaneie o QR Code de novo.</p></body></html>';
}

module.exports = {html: html, forbidden: forbidden};
