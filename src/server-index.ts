import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const app=express();
const port=Number(process.env.PORT||3001);
const livekitUrl=process.env.LIVEKIT_URL;
const apiKey=process.env.LIVEKIT_API_KEY;
const apiSecret=process.env.LIVEKIT_API_SECRET;
if(!livekitUrl||!apiKey||!apiSecret) console.warn('Configure LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET no server/.env');
const clientOrigin=(process.env.CLIENT_ORIGIN||'http://localhost:5173').replace(/\/+$/, '');
app.use(cors({origin:clientOrigin,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'20kb'}));
app.get('/health',(_req,res)=>res.json({ok:true,service:'watchtogether-token-service'}));
app.post('/api/token',async(req,res)=>{
  try{
    const roomName=String(req.body?.roomName||'');
    const participantName=String(req.body?.participantName||'').trim().slice(0,32);
    if(!/^wt-(?:[A-HJ-NP-Z2-9]{7}|[a-zA-Z0-9-]{8,40})$/i.test(roomName)) return res.status(400).json({error:'Código de sala inválido.'});
    if(!participantName) return res.status(400).json({error:'Informe seu nome.'});
    if(!livekitUrl||!apiKey||!apiSecret) return res.status(503).json({error:'Servidor de mídia ainda não configurado.'});
    const identity=`${participantName.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,18)||'guest'}-${crypto.randomUUID().slice(0,8)}`;
    const token=new AccessToken(apiKey,apiSecret,{identity,name:participantName,ttl:'2h'});
    token.addGrant({roomJoin:true,room:roomName,canPublish:true,canSubscribe:true,canPublishData:true});
    const jwt=await token.toJwt();
    res.json({token:jwt,serverUrl:livekitUrl,isHost:false});
  }catch(err){console.error(err);res.status(500).json({error:'Falha ao gerar acesso à sala.'});}
});
app.listen(port,()=>console.log(`WatchTogether API em http://localhost:${port}`));