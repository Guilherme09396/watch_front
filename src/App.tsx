import { useEffect, useRef, useState } from 'react';

import { LiveKitRoom, useConnectionState, useLocalParticipant, useParticipants, useRoomContext } from '@livekit/components-react';

import { ConnectionState, RoomEvent, Track, createLocalScreenTracks } from 'livekit-client';

import { Copy, Link2, LogOut, MonitorUp, Play, Send, Users, Volume2, Film, MessageCircle, Crown, ShieldCheck, Clapperboard, X, Maximize2, Minimize2 } from 'lucide-react';



const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type Credentials = { token:string; serverUrl:string; roomName:string; participantName:string; isHost:boolean };

type ChatMessage = { id:string; name:string; text:string; time:string; system?:boolean };

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomRoom = () => {

  const bytes = crypto.getRandomValues(new Uint8Array(7));

  return 'wt-' + Array.from(bytes, value => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');

};

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

      if (!/^wt-(?:[A-HJ-NP-Z2-9]{7}|[a-zA-Z0-9-]{8,40})$/i.test(roomName)) throw new Error('Código de sala inválido.');

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

  if (credentials) return <LiveKitRoom serverUrl={credentials.serverUrl} token={credentials.token} connect audio video options={{adaptiveStream:true,dynacast:true}}><WatchRoom credentials={credentials} onLeave={()=>{setCredentials(null);history.replaceState({},'',location.pathname);}}/></LiveKitRoom>;

  return <main className="landing"><nav className="topbar"><div className="brand"><span className="brand-icon"><Clapperboard size={21}/></span>watch<span>together</span></div><div className="secure"><ShieldCheck size={15}/> Salas privadas</div></nav>

    <section className="hero"><div className="eyebrow"><span className="pulse"/> SUA SESSÃO, SUA GALERA</div><h1>O melhor da diversão<br/><em>é assistir junto.</em></h1><p className="lead">Crie uma sala privada, compartilhe a tela ou um vídeo e curta o momento com seus amigos, mesmo de longe.</p>

    <div className="join-card"><label>SEU NOME</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Como podemos te chamar?" maxLength={32}/><button className="primary full" disabled={busy} onClick={()=>enter('',true)}><Film size={18}/> Criar sala privada</button><div className="or"><span/> ou entre em uma sala <span/></div><div className="join-row"><input value={roomCode} onChange={e=>setRoomCode(e.target.value)} placeholder="Cole o código da sala"/><button className="secondary" disabled={busy} onClick={()=>enter(roomCode,false)}>Entrar <Link2 size={16}/></button></div>{error&&<p className="error">{error}</p>}</div>

    <div className="features"><div><MonitorUp/><b>Compartilhe sua tela</b><small>Com áudio quando suportado</small></div><div><Play/><b>Vídeos sincronizados</b><small>YouTube e links compatíveis</small></div><div><Users/><b>Até 10 pessoas</b><small>Uma sala só de vocês</small></div></div></section><footer>WATCHTOGETHER <span>•</span> FEITO PARA ASSISTIR JUNTO</footer></main>;

}





function SharedScreen({ track }: { track: Track }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      className="screen-video"
      autoPlay
      playsInline
      muted
    />
  );
}


function RemoteAudioOutput({track,volume}:{track:Track;volume:number}) {
  const audioRef=useRef<HTMLAudioElement>(null);
  useEffect(()=>{
    const element=audioRef.current;
    if(!element)return;
    track.attach(element);
    element.autoplay=true;
    element.play().catch(()=>{});
    return()=>{track.detach(element);};
  },[track]);
  useEffect(()=>{if(audioRef.current)audioRef.current.volume=volume/100;},[volume]);
  return <audio ref={audioRef} className="watchtogether-remote-audio" autoPlay />;
}

function WatchRoom({credentials,onLeave}:{credentials:Credentials;onLeave:()=>void}) {

  const room = useRoomContext(); const participants = useParticipants(); const {localParticipant}=useLocalParticipant();

  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [draft,setDraft]=useState('');
  const [url,setUrl]=useState('');
  const [videoId,setVideoId]=useState('');
  const [playing,setPlaying]=useState(false);
  const [notice,setNotice]=useState('');
  const [screenOn,setScreenOn]=useState(false);
  const [screenTrack,setScreenTrack]=useState<Track|null>(null);
  const [copied,setCopied]=useState(false);
  const [volume,setVolume]=useState(100);
  const [needsPlaybackGesture,setNeedsPlaybackGesture]=useState(false);
  const latestControl=useRef<any>(null);
  const playerReady=useRef(false);
  const volumeRef=useRef(100);
  const videoIdRef=useRef('');
  const hostIdentityRef=useRef<string|null>(credentials.isHost ? room.localParticipant.identity : null);
  const isHost=credentials.isHost;
  const isHostRef=useRef(isHost);
  isHostRef.current=isHost;
  volumeRef.current=volume;
  videoIdRef.current=videoId;
  const chatEnd=useRef<HTMLDivElement>(null);
  const stageRef=useRef<HTMLDivElement>(null);
  const player=useRef<any>(null);
  const [expanded,setExpanded]=useState(false);
  const [nativeFullscreen,setNativeFullscreen]=useState(false);
  const connection=useConnectionState();
  const [reconnectError,setReconnectError]=useState('');

  useEffect(()=>{
    const handler=(payload:Uint8Array, participant?:any)=>{
      try {
        const data=JSON.parse(new TextDecoder().decode(payload));
        if(data.type==='chat') { setMessages(m=>[...m,data.message]); return; }
        if(data.type==='video') {
          latestControl.current=null;
          setNeedsPlaybackGesture(false);
          if(participant?.identity) hostIdentityRef.current=participant.identity;
          if(data.videoId===videoIdRef.current && playerReady.current) {
            player.current?.pauseVideo?.();
            player.current?.seekTo?.(0,true);
          }
          setVideoId(data.videoId);
          videoIdRef.current=data.videoId;
          setUrl(data.url || '');
          setPlaying(false);
          return;
        }
        if(data.type==='control' && data.videoId===videoIdRef.current && !isHostRef.current) {
          if(participant?.identity) {
            if(!hostIdentityRef.current) hostIdentityRef.current=participant.identity;
            if(participant.identity!==hostIdentityRef.current) return;
          }
          latestControl.current=data;
          setPlaying(Boolean(data.playing));
          applyRemoteYouTubeControl(data);
          return;
        }
        if(data.type==='system') {
          setMessages(m=>[...m,{id:crypto.randomUUID(),name:'WatchTogether',text:data.text,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),system:true}]);
        }
      } catch(error) { console.warn('Mensagem da sala inválida:',error); }
    };
    room.on(RoomEvent.DataReceived,handler);
    return()=>{room.off(RoomEvent.DataReceived,handler);};
  },[room,participants]);

  useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth'});},[messages]);

  useEffect(()=>{const sync=()=>setNativeFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);

  async function toggleStageFullscreen(){

    if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}

    const stage=stageRef.current;

    if(stage?.requestFullscreen){try{await stage.requestFullscreen();setExpanded(false);return;}catch{}}

    setExpanded(value=>!value);

  }

  function applyRemoteYouTubeControl(data:any) {
    const yt=player.current;
    if(!yt || !playerReady.current || isHostRef.current) return;
    const elapsed=data.playing && data.sentAt ? Math.max(0,(Date.now()-Number(data.sentAt))/1000) : 0;
    const target=Math.max(0,Number(data.time || 0)+elapsed);
    const current=Number(yt.getCurrentTime?.() || 0);
    const state=yt.getPlayerState?.();
    if(Math.abs(current-target)>1.8 && state!==3) yt.seekTo(target,true);
    if(data.playing) {
      if(state!==1 && state!==3) yt.playVideo?.();
    } else if(state===1 || state===3) yt.pauseVideo?.();
    if(data.ended) yt.pauseVideo?.();
  }

  useEffect(()=>{
    if(!videoId) return;
    let cancelled=false;
    const w=window as any;
    const createPlayer=()=>{
      if(cancelled || !w.YT?.Player) return;
      player.current?.destroy?.();
      playerReady.current=false;
      player.current=new w.YT.Player('youtube-player',{
        videoId,
        playerVars:{autoplay:0,controls:isHost?1:0,rel:0,playsinline:1,enablejsapi:1,origin:window.location.origin},
        events:{
          onReady:(event:any)=>{
            if(cancelled) return;
            playerReady.current=true;
            event.target.setVolume?.(volumeRef.current);
            if(latestControl.current && !isHostRef.current) applyRemoteYouTubeControl(latestControl.current);
          },
          onStateChange:(event:any)=>{
            if(!isHostRef.current) return;
            const state=event.data;
            if(state===1 || state===2 || state===0) {
              setPlaying(state===1);
              send({type:'control',playing:state===1,ended:state===0,time:Number(event.target.getCurrentTime?.()||0),videoId:videoIdRef.current,sentAt:Date.now()});
            }
          },
          onAutoplayBlocked:()=>{ if(!isHostRef.current) setNeedsPlaybackGesture(true); }
        }
      });
    };
    if(w.YT?.Player) createPlayer();
    else {
      const previous=w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady=()=>{try{previous?.();}catch{}createPlayer();};
      let script=document.querySelector<HTMLScriptElement>('script[data-watchtogether-youtube]');
      if(!script) {
        script=document.createElement('script');
        script.src='https://www.youtube.com/iframe_api';
        script.dataset.watchtogetherYoutube='true';
        document.head.appendChild(script);
      }
    }
    return()=>{cancelled=true;playerReady.current=false;player.current?.destroy?.();player.current=null;};
  },[videoId,isHost]);

  useEffect(()=>{
    volumeRef.current=volume;
    document.querySelectorAll<HTMLAudioElement>('.watchtogether-remote-audio').forEach(el=>{el.volume=volume/100;});
    try {
      player.current?.setVolume?.(volume);
      if(volume===0) player.current?.mute?.(); else player.current?.unMute?.();
    } catch {}
  },[volume,videoId]);

  useEffect(()=>{
    if(!isHost || !videoId) return;
    const interval=window.setInterval(()=>{
      const yt=player.current;
      if(!yt || !playerReady.current) return;
      const state=yt.getPlayerState?.();
      send({type:'control',playing:state===1||state===3,ended:state===0,time:Number(yt.getCurrentTime?.()||0),videoId,sentAt:Date.now(),heartbeat:true});
    },1000);
    return()=>window.clearInterval(interval);
  },[isHost,videoId,room]);

  const [,setAudioRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>setAudioRevision(v=>v+1);
    room.on(RoomEvent.TrackSubscribed,refresh);
    room.on(RoomEvent.TrackUnsubscribed,refresh);
    room.on(RoomEvent.TrackMuted,refresh);
    room.on(RoomEvent.TrackUnmuted,refresh);
    room.on(RoomEvent.ParticipantConnected,refresh);
    room.on(RoomEvent.ParticipantDisconnected,refresh);
    return()=>{
      room.off(RoomEvent.TrackSubscribed,refresh);
      room.off(RoomEvent.TrackUnsubscribed,refresh);
      room.off(RoomEvent.TrackMuted,refresh);
      room.off(RoomEvent.TrackUnmuted,refresh);
      room.off(RoomEvent.ParticipantConnected,refresh);
      room.off(RoomEvent.ParticipantDisconnected,refresh);
    };
  },[room]);

  function send(data:any){room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)),{reliable:true});}

  function sendChat(){const text=draft.trim();if(!text)return;const message={id:crypto.randomUUID(),name:credentials.participantName,text,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})};setMessages(m=>[...m,message]);send({type:'chat',message});setDraft('');}

  function addVideo(){if(!isHost){setNotice('Somente o anfitrião pode escolher e controlar o vídeo.');return;}const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);if(!match){setNotice('Insira um link válido do YouTube. Para outros players, use Compartilhar tela.');return;}setVideoId(match[1]);setPlaying(false);send({type:'video',videoId:match[1],url});setNotice('Vídeo enviado para a sala. O anfitrião controla a reprodução.');}

  async function shareScreen(){

    if(!navigator.mediaDevices?.getDisplayMedia){setNotice('Este navegador/dispositivo não oferece compartilhamento de tela. Tente pelo Chrome ou Edge atualizado em um computador ou Android compatível.');return;}

    try{

      const tracks=await createLocalScreenTracks({

        audio:true,

        video:{displaySurface:'monitor'}

      });

      for(const track of tracks){

        await localParticipant.publishTrack(track,{

          source:track.source,

          simulcast:false,

          ...(track.kind===Track.Kind.Video?{videoEncoding:{maxBitrate:8_000_000,maxFramerate:60}}:{})

        });

      }

      const capturedAudio=tracks.some(track=>track.kind===Track.Kind.Audio);
      const capturedVideo=tracks.find(track=>track.kind===Track.Kind.Video)||null;
      setScreenTrack(capturedVideo);
      setScreenOn(Boolean(capturedVideo));
      capturedVideo?.mediaStreamTrack.addEventListener('ended',()=>{setScreenOn(false);setScreenTrack(null);});

      send({type:'system',text:`${credentials.participantName} começou a compartilhar a tela em alta qualidade.`});

      setNotice(capturedAudio?'Tela compartilhada com áudio. O navegador só captura som quando a opção de compartilhar áudio está disponível e selecionada.':'Tela compartilhada, mas sem faixa de áudio. Encerre e compartilhe novamente marcando “Compartilhar áudio” (ou “Compartilhar áudio da guia” no Chrome/Edge).');

    }catch(error){

      console.error('Falha ao compartilhar tela:',error);

      setNotice('Não foi possível compartilhar a tela. Verifique as permissões do navegador. Em celulares, o compartilhamento completo depende do suporte do navegador e do sistema.');

    }

  }

  async function stopScreen(){if(!screenOn)return;for(const p of localParticipant.trackPublications.values()){if(p.source===Track.Source.ScreenShare||p.source===Track.Source.ScreenShareAudio){p.track?.stop();await localParticipant.unpublishTrack(p.track!);}}setScreenOn(false);setScreenTrack(null);}

  async function copyInvite(){await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${credentials.roomName}`);setCopied(true);setTimeout(()=>setCopied(false),1800);}

  const remoteScreen=participants.flatMap(p=>[...p.trackPublications.values()].filter(pub=>pub.source===Track.Source.ScreenShare&&pub.track).map(pub=>({p,pub})));

  const localScreen=screenTrack;
  const remoteAudioTracks=participants
    .filter(participant=>participant.identity!==localParticipant.identity)
    .flatMap(participant=>[...participant.trackPublications.values()]
      .filter(publication=>publication.kind===Track.Kind.Audio && publication.isSubscribed && publication.track && !publication.isMuted)
      .map(publication=>({key:publication.trackSid || publication.track!.sid,track:publication.track!})));


  return <div className="room-shell">
    <div className="remote-audio-output" aria-hidden="true">
      {remoteAudioTracks.map(item=><RemoteAudioOutput key={item.key} track={item.track} volume={volume}/>)}
    </div><header className="room-header"><div className="brand"><span className="brand-icon"><Clapperboard size={19}/></span>watch<span>together</span></div><div className="room-meta"><span className="live-dot"/> SALA PRIVADA <b>{credentials.roomName}</b></div><div className="header-actions"><button className="ghost" onClick={copyInvite}><Copy size={16}/>{copied?'Copiado!':'Convidar'}</button><button className="leave" onClick={onLeave}><LogOut size={16}/> Sair</button></div></header>

  {connection!==ConnectionState.Connected&&<div className={`connection-banner ${connection===ConnectionState.Disconnected?'failed':''}`}><span>{connection===ConnectionState.Disconnected?'Não foi possível conectar ao servidor de mídia. Confira o LIVEKIT_URL no server/.env.':'Conectando ao servidor de mídia...'}</span>{connection===ConnectionState.Disconnected&&<button onClick={()=>{setReconnectError('');room.connect(credentials.serverUrl,credentials.token).catch(e=>setReconnectError(e instanceof Error?e.message:'Falha ao reconectar.'));}}>Tentar novamente</button>}{reconnectError&&<small>{reconnectError}</small>}</div>}<main className="room-layout"><section className="watch-area"><div ref={stageRef} className={`stage${expanded?' expanded':''}`}>

    <button className="fullscreen-toggle" onClick={toggleStageFullscreen} title={nativeFullscreen||expanded?'Sair da tela cheia':'Expandir transmissão'} aria-label={nativeFullscreen||expanded?'Sair da tela cheia':'Expandir transmissão'}>{nativeFullscreen||expanded?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>

    {remoteScreen.length>0?<div className="screen-stage"><SharedScreen track={remoteScreen[0].pub.track!}/><div className="screen-label"><MonitorUp size={14}/> Tela de {remoteScreen[0].p.name}</div></div>:localScreen?<div className="screen-stage"><SharedScreen track={localScreen}/><div className="screen-label"><MonitorUp size={14}/> Sua tela (pré-visualização)</div></div>:videoId?<div className="youtube-wrap"><div id="youtube-player"/>{needsPlaybackGesture&&<button className="youtube-activate" onClick={()=>{setNeedsPlaybackGesture(false);try{player.current?.unMute?.();player.current?.setVolume?.(volumeRef.current);player.current?.playVideo?.();}catch{}}}>Clique para iniciar o vídeo sincronizado</button>}</div>:<div className="empty-stage"><div className="film-icon"><Film size={34}/></div><h2>O que vamos assistir hoje?</h2><p>Compartilhe sua tela ou adicione um vídeo do YouTube.</p><div className="stage-actions"><button className="primary" onClick={shareScreen}><MonitorUp size={17}/> Compartilhar tela</button><button className="secondary" onClick={()=>document.getElementById('video-link')?.focus()}><Link2 size={17}/> Adicionar link</button></div></div>}

    </div>

    <div className="toolbar"><div className="toolbar-left"><span className={`connection ${connection===ConnectionState.Connected?'ok':''}`}/><span>{connection===ConnectionState.Connected?'Conectado': 'Conectando...'}</span><span className="divider-v"/><Users size={15}/><span>{participants.length}/10</span></div><div className="toolbar-right">{screenOn?<button className="danger" onClick={stopScreen}><X size={16}/> Parar compartilhamento</button>:<button className="control" onClick={shareScreen}><MonitorUp size={17}/> Compartilhar tela</button>}<label className="local-volume" title="Volume somente neste dispositivo"><Volume2 size={16}/><input aria-label="Volume local" type="range" min={0} max={100} value={volume} onChange={e=>setVolume(Number(e.target.value))}/><span>{volume}%</span></label><span className="audio-status">Áudio local</span></div></div>

    <div className="link-panel"><div className="link-title"><Play size={16}/> <b>Assistir por link</b><small>YouTube sincronizado</small></div><div className="link-input"><input id="video-link" value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addVideo()} placeholder="Cole o link do YouTube aqui..."/><button className="primary" onClick={addVideo}>Adicionar</button></div>{notice&&<div className="notice">{notice}</div>}</div>

    <div className="participants-strip"><b>Na sala</b>{participants.map(p=><div className="person" key={p.identity}><span className="avatar">{p.name?.slice(0,1).toUpperCase()||'?'}</span><span>{p.name}{p.identity===participants[0]?.identity&&<Crown size={12}/>}</span></div>)}</div>

  </section><aside className="chat-panel"><div className="chat-head"><div><MessageCircle size={18}/><b>Chat da sala</b></div><span>{participants.length} online</span></div><div className="chat-messages">{messages.map(m=><div className={`message ${m.system?'system':''}`} key={m.id}>{!m.system&&<div className="message-top"><b>{m.name}</b><time>{m.time}</time></div>}<p>{m.text}</p></div>)}{messages.length===0&&<div className="chat-empty"><MessageCircle size={25}/><p>O papo começa aqui.</p><small>Envie uma mensagem para seus amigos.</small></div>}<div ref={chatEnd}/></div><div className="chat-compose"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChat()} placeholder="Digite uma mensagem..."/><button onClick={sendChat} disabled={!draft.trim()}><Send size={17}/></button></div><div className="chat-foot">As mensagens são compartilhadas em tempo real</div></aside></main><footer className="room-footer"><span><ShieldCheck size={14}/> Sua sala é privada</span><span>WATCHTOGETHER • ASSISTA JUNTO</span></footer></div>;

}
