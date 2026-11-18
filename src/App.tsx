import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useLocalParticipant, useParticipants, useRoomContext } from '@livekit/components-react';
import { ConnectionState, RoomEvent, Track, createLocalScreenTracks } from 'livekit-client';
import { Copy, Link2, LogOut, MonitorUp, Play, Send, Users, Volume2, Film, MessageCircle, Crown, ShieldCheck, Clapperboard, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
type Credentials = { token:string; serverUrl:string; roomName:string; participantName:string; isHost:boolean };
type ChatMessage = { id:string; name:string; text:string; time:string; system?:boolean };
const randomRoom = () => 'wt-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const roomFromUrl = () => new URLSearchParams(location.search).get('room') || '';

export default function App() {
  const [roomCode,setRoomCode] = useState(roomFromUrl());
  const [name,setName] = useState(localStorage.getItem('wt-name') || '');
  const [credentials,setCredentials] = useState<Credentials|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function enter(code:string, create:boolean) {
    setError('');
    if (!name.trim()) { setError('Informe seu nome para entrar.'); return; }
    setBusy(true);
    try {
      const roomName = create ? randomRoom() : code.trim();
      if (!/^wt-[a-zA-Z0-9-]{8,40}$/.test(roomName)) throw new Error('Código de sala inválido.');
      const response = await fetch(`${API}/api/token`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({roomName, participantName:name.trim()}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar na sala.');
      localStorage.setItem('wt-name',name.trim());
      const isHost = create || data.isHost;
      setCredentials({...data, roomName, participantName:name.trim(), isHost});
      setRoomCode(roomName);
      history.replaceState({},'',`?room=${encodeURIComponent(roomName)}`);
    } catch(e) { setError(e instanceof Error ? e.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }
  if (credentials) return <LiveKitRoom serverUrl={credentials.serverUrl} token={credentials.token} connect audio video options={{adaptiveStream:true,dynacast:true}} onDisconnected={()=>{setCredentials(null);history.replaceState({},'',location.pathname);}}><RoomAudioRenderer/><WatchRoom credentials={credentials} onLeave={()=>setCredentials(null)}/></LiveKitRoom>;
  return <main className="landing"><nav className="topbar"><div className="brand"><span className="brand-icon"><Clapperboard size={21}/></span>watch<span>together</span></div><div className="secure"><ShieldCheck size={15}/> Salas privadas</div></nav>
    <section className="hero"><div className="eyebrow"><span className="pulse"/> SUA SESSÃO, SUA GALERA</div><h1>O melhor da diversão<br/><em>é assistir junto.</em></h1><p className="lead">Crie uma sala privada, compartilhe a tela ou um vídeo e curta o momento com seus amigos, mesmo de longe.</p>
    <div className="join-card"><label>SEU NOME</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Como podemos te chamar?" maxLength={32}/><button className="primary full" disabled={busy} onClick={()=>enter('',true)}><Film size={18}/> Criar sala privada</button><div className="or"><span/> ou entre em uma sala <span/></div><div className="join-row"><input value={roomCode} onChange={e=>setRoomCode(e.target.value)} placeholder="Cole o código da sala"/><button className="secondary" disabled={busy} onClick={()=>enter(roomCode,false)}>Entrar <Link2 size={16}/></button></div>{error&&<p className="error">{error}</p>}</div>
    <div className="features"><div><MonitorUp/><b>Compartilhe sua tela</b><small>Com áudio quando suportado</small></div><div><Play/><b>Vídeos sincronizados</b><small>YouTube e links compatíveis</small></div><div><Users/><b>Até 10 pessoas</b><small>Uma sala só de vocês</small></div></div></section><footer>WATCHTOGETHER <span>•</span> FEITO PARA ASSISTIR JUNTO</footer></main>;
}

function SharedScreen({track}:{track:Track}) {
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{const el=ref.current;if(!el)return;track.attach(el);return()=>{track.detach(el);};},[track]);
  return <video ref={ref} className="screen-video" autoPlay playsInline />;
}
function WatchRoom({credentials,onLeave}:{credentials:Credentials;onLeave:()=>void}) {
  const room = useRoomContext(); const participants = useParticipants(); const {localParticipant}=useLocalParticipant();
  const [messages,setMessages]=useState<ChatMessage[]>([]); const [draft,setDraft]=useState(''); const [url,setUrl]=useState(''); const [videoId,setVideoId]=useState(''); const [playing,setPlaying]=useState(false); const [notice,setNotice]=useState(''); const [screenOn,setScreenOn]=useState(false); const [screenTrack,setScreenTrack]=useState<Track|null>(null); const [copied,setCopied]=useState(false);
  const chatEnd=useRef<HTMLDivElement>(null); const player=useRef<any>(null); const isHost=credentials.isHost || room.localParticipant.identity===participants[0]?.identity;
  const connection=useConnectionState();
  useEffect(()=>{ const handler=(payload:Uint8Array)=>{try{const data=JSON.parse(new TextDecoder().decode(payload)); if(data.type==='chat')setMessages(m=>[...m,data.message]); if(data.type==='video'){setVideoId(data.videoId);setUrl(data.url);setPlaying(false);} if(data.type==='control'){setPlaying(data.playing); if(player.current&&data.videoId===videoId){data.playing?player.current.playVideo?.():player.current.pauseVideo?.();player.current.seekTo?.(data.time,true);}} if(data.type==='system')setMessages(m=>[...m,{id:crypto.randomUUID(),name:'WatchTogether',text:data.text,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),system:true}]);}catch{} };
    room.on(RoomEvent.DataReceived,handler); return()=>{room.off(RoomEvent.DataReceived,handler);};},[room,videoId]);
  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'});},[messages]);
  useEffect(()=>{ if(!videoId)return; const load=()=>{if((window as any).YT?.Player){ if(player.current?.destroy)player.current.destroy(); player.current=new (window as any).YT.Player('youtube-player',{videoId,playerVars:{autoplay:0,controls:1,rel:0},events:{onStateChange:(e:any)=>{if(isHost&&(e.data===1||e.data===2)){setPlaying(e.data===1);send({type:'control',playing:e.data===1,time:e.target.getCurrentTime(),videoId});}}}});}}; if(!(window as any).YT){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';document.body.appendChild(s);(window as any).onYouTubeIframeAPIReady=load;}else load(); return()=>{player.current?.destroy?.();player.current=null;};},[videoId]);
  function send(data:any){room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)),{reliable:true});}
  function sendChat(){const text=draft.trim();if(!text)return;const message={id:crypto.randomUUID(),name:credentials.participantName,text,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};setMessages(m=>[...m,message]);send({type:'chat',message});setDraft('');}
  function addVideo(){const match=url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);if(!match){setNotice('Insira um link válido do YouTube. Para outros players, use Compartilhar tela.');return;}setVideoId(match[1]);setPlaying(false);send({type:'video',videoId:match[1],url});setNotice('Vídeo enviado para a sala. O anfitrião controla a reprodução.');}
  async function shareScreen(){try{const tracks = await createLocalScreenTracks({
  audio: true,
  video: {
    displaySurface: 'browser'
  }
});for(const t of tracks)await localParticipant.publishTrack(t,{source:t.source});setScreenTrack(tracks.find(t=>t.kind===Track.Kind.Video)||null);setScreenOn(true);send({type:'system',text:`${credentials.participantName} começou a compartilhar a tela.`});}catch(e){setNotice('Não foi possível compartilhar. Use Chrome/Edge no computador e permita o acesso à tela e ao áudio.');}}
  async function stopScreen(){if(!screenOn)return;for(const p of localParticipant.trackPublications.values()){if(p.source===Track.Source.ScreenShare||p.source===Track.Source.ScreenShareAudio){p.track?.stop();await localParticipant.unpublishTrack(p.track!);}}setScreenOn(false);setScreenTrack(null);}
  async function copyInvite(){await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${credentials.roomName}`);setCopied(true);setTimeout(()=>setCopied(false),1800);}
  const remoteScreen=participants.flatMap(p=>[...p.trackPublications.values()].filter(pub=>pub.source===Track.Source.ScreenShare&&pub.track).map(pub=>({p,pub})));
  const localScreen=screenTrack;
  return <div className="room-shell"><header className="room-header"><div className="brand"><span className="brand-icon"><Clapperboard size={19}/></span>watch<span>together</span></div><div className="room-meta"><span className="live-dot"/> SALA PRIVADA <b>{credentials.roomName}</b></div><div className="header-actions"><button className="ghost" onClick={copyInvite}><Copy size={16}/>{copied?'Copiado!':'Convidar'}</button><button className="leave" onClick={onLeave}><LogOut size={16}/> Sair</button></div></header>
  <main className="room-layout"><section className="watch-area"><div className="stage">
    {remoteScreen.length>0?<div className="screen-stage"><SharedScreen track={remoteScreen[0].pub.track!}/><div className="screen-label"><MonitorUp size={14}/> Tela de {remoteScreen[0].p.name}</div></div>:localScreen?<div className="screen-placeholder"><MonitorUp size={38}/><h3>Você está compartilhando sua tela</h3><p>Seus amigos estão recebendo a transmissão.</p></div>:videoId?<div className="youtube-wrap"><div id="youtube-player"/></div>:<div className="empty-stage"><div className="film-icon"><Film size={34}/></div><h2>O que vamos assistir hoje?</h2><p>Compartilhe sua tela ou adicione um vídeo do YouTube.</p><div className="stage-actions"><button className="primary" onClick={shareScreen}><MonitorUp size={17}/> Compartilhar tela</button><button className="secondary" onClick={()=>document.getElementById('video-link')?.focus()}><Link2 size={17}/> Adicionar link</button></div></div>}
    </div>
    <div className="toolbar"><div className="toolbar-left"><span className={`connection ${connection===ConnectionState.Connected?'ok':''}`}/><span>{connection===ConnectionState.Connected?'Conectado': 'Conectando...'}</span><span className="divider-v"/><Users size={15}/><span>{participants.length}/10</span></div><div className="toolbar-right">{screenOn?<button className="danger" onClick={stopScreen}><X size={16}/> Parar compartilhamento</button>:<button className="control" onClick={shareScreen}><MonitorUp size={17}/> Compartilhar tela</button>}<span className="audio-status"><Volume2 size={16}/> Áudio da sala ativo</span></div></div>
    <div className="link-panel"><div className="link-title"><Play size={16}/> <b>Assistir por link</b><small>YouTube sincronizado</small></div><div className="link-input"><input id="video-link" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addVideo()} placeholder="Cole o link do YouTube aqui..."/><button className="primary" onClick={addVideo}>Adicionar</button></div>{notice&&<div className="notice">{notice}</div>}</div>
    <div className="participants-strip"><b>Na sala</b>{participants.map(p=><div className="person" key={p.identity}><span className="avatar">{p.name?.slice(0,1).toUpperCase()||'?'}</span><span>{p.name}{p.identity===participants[0]?.identity&&<Crown size={12}/>}</span></div>)}</div>
  </section><aside className="chat-panel"><div className="chat-head"><div><MessageCircle size={18}/><b>Chat da sala</b></div><span>{participants.length} online</span></div><div className="chat-messages">{messages.map(m=><div className={`message ${m.system?'system':''}`} key={m.id}>{!m.system&&<div className="message-top"><b>{m.name}</b><time>{m.time}</time></div>}<p>{m.text}</p></div>)}{messages.length===0&&<div className="chat-empty"><MessageCircle size={25}/><p>O papo começa aqui.</p><small>Envie uma mensagem para seus amigos.</small></div>}<div ref={chatEnd}/></div><div className="chat-compose"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Digite uma mensagem..."/><button onClick={sendChat} disabled={!draft.trim()}><Send size={17}/></button></div><div className="chat-foot">As mensagens são compartilhadas em tempo real</div></aside></main><footer className="room-footer"><span><ShieldCheck size={14}/> Sua sala é privada</span><span>WATCHTOGETHER • ASSISTA JUNTO</span></footer></div>;
}