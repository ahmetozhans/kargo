import {createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify, timingSafeEqual} from 'node:crypto';
import {currentUser, issueSession} from './auth.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const random=()=>randomBytes(32).toString('hex');
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const stateCookie='kargo_apple_state';

export function appleEnabled(){
  if(!['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','APPLE_REDIRECT_URI']
    .every(name=>Boolean(process.env[name])))return false;
  try{const url=new URL(process.env.APPLE_REDIRECT_URI);return url.protocol==='https:'&&url.pathname==='/api/apple/callback'&&!url.search&&!url.hash}catch{return false}
}

function redirectUri(){
  const uri=new URL(process.env.APPLE_REDIRECT_URI);
  if(uri.protocol!=='https:'||uri.pathname!=='/api/apple/callback'||uri.search||uri.hash)throw new Error('Invalid Apple redirect URI');
  return uri.toString();
}

function goHome(res,reason=''){
  res.writeHead(303,{Location:reason?`/?apple_error=${encodeURIComponent(reason)}`:'/', 'Cache-Control':'no-store'}).end();
}

async function appleTables(sql){
  await sql`CREATE TABLE IF NOT EXISTS kargo_apple_states (state_hash text PRIMARY KEY, nonce text NOT NULL, link_user_id text, expires_at timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS kargo_apple_identities (apple_sub text PRIMARY KEY, user_id text NOT NULL REFERENCES kargo_users(id) ON DELETE CASCADE)`;
}

export async function startApple(req,res,sql,url){
  if(!appleEnabled())return res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}).end('Apple ile giriş henüz yapılandırılmadı.');
  await appleTables(sql);
  const link=url.searchParams.get('link')==='1';
  const user=link?await currentUser(req,sql):null;
  if(link&&!user)return goHome(res,'session');
  const state=random(),nonce=random();
  await sql`INSERT INTO kargo_apple_states (state_hash,nonce,link_user_id,expires_at) VALUES (${hash(state)},${nonce},${user?.id||null},${new Date(Date.now()+600000).toISOString()})`;
  res.setHeader('Set-Cookie',`${stateCookie}=${state}; Path=/api/apple; HttpOnly; Secure; SameSite=None; Max-Age=600`);
  const authorization=new URL('https://appleid.apple.com/auth/authorize');
  authorization.search=new URLSearchParams({client_id:process.env.APPLE_CLIENT_ID,redirect_uri:redirectUri(),response_type:'code',response_mode:'form_post',scope:'email',state,nonce}).toString();
  res.writeHead(302,{Location:authorization.toString(),'Cache-Control':'no-store'}).end();
}

export function clientSecret(){
  const now=Math.floor(Date.now()/1000);
  const header=encoded({alg:'ES256',kid:process.env.APPLE_KEY_ID,typ:'JWT'});
  const payload=encoded({iss:process.env.APPLE_TEAM_ID,iat:now,exp:now+300,sub:process.env.APPLE_CLIENT_ID,aud:'https://appleid.apple.com'});
  const content=`${header}.${payload}`;
  const pem=process.env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n');
  const signature=sign('sha256',Buffer.from(content),{key:createPrivateKey(pem),dsaEncoding:'ieee-p1363'}).toString('base64url');
  return `${content}.${signature}`;
}

export async function verifyIdentity(idToken,nonce){
  const parts=String(idToken||'').split('.');
  if(parts.length!==3||idToken.length>12000)throw new Error('Invalid Apple identity token');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  if(header.alg!=='RS256'||!header.kid)throw new Error('Unexpected Apple signing key');
  const response=await fetch('https://appleid.apple.com/auth/keys',{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Apple public key unavailable');
  const keys=await response.json();
  const jwk=keys.keys?.find(key=>key.kid===header.kid&&key.kty==='RSA'&&key.use==='sig');
  if(!jwk||!verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Apple signature invalid');
  const identity=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  const now=Math.floor(Date.now()/1000);
  if(identity.iss!=='https://appleid.apple.com'||identity.aud!==process.env.APPLE_CLIENT_ID||identity.nonce!==nonce||!identity.sub||identity.exp<=now||identity.iat>now+60)throw new Error('Apple identity claims invalid');
  return identity;
}

async function callbackBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  let input='';
  for await(const chunk of req){input+=chunk;if(input.length>16000)throw new Error('Apple response too large')}
  return Object.fromEntries(new URLSearchParams(input));
}

export async function finishApple(req,res,sql){
  res.setHeader('Set-Cookie',`${stateCookie}=; Path=/api/apple; HttpOnly; Secure; SameSite=None; Max-Age=0`);
  if(!appleEnabled())return goHome(res,'setup');
  try{
    await appleTables(sql);
    const form=await callbackBody(req);
    const state=String(form.state||'');
    const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(stateCookie+'='))?.slice(stateCookie.length+1)||'';
    if(!/^[a-f0-9]{64}$/.test(state)||!/^[a-f0-9]{64}$/.test(cookie)||!timingSafeEqual(Buffer.from(state,'hex'),Buffer.from(cookie,'hex')))throw new Error('Apple state mismatch');
    const rows=await sql`DELETE FROM kargo_apple_states WHERE state_hash=${hash(state)} AND expires_at>now() RETURNING nonce,link_user_id`;
    if(rows.length!==1||form.error||!form.code||String(form.code).length>4000)throw new Error('Apple authorization failed');
    const token=await fetch('https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:form.code,client_id:process.env.APPLE_CLIENT_ID,client_secret:clientSecret(),redirect_uri:redirectUri()}),signal:AbortSignal.timeout(10000)});
    if(!token.ok)throw new Error('Apple code exchange failed');
    const data=await token.json();
    const identity=await verifyIdentity(data.id_token,rows[0].nonce);
    const existing=await sql`SELECT user_id FROM kargo_apple_identities WHERE apple_sub=${identity.sub}`;
    let userId=existing[0]?.user_id;
    if(rows[0].link_user_id){
      if(userId&&userId!==rows[0].link_user_id)return goHome(res,'linked');
      userId=rows[0].link_user_id;
      if(!existing.length)await sql`INSERT INTO kargo_apple_identities (apple_sub,user_id) VALUES (${identity.sub},${userId}) ON CONFLICT DO NOTHING`;
    }else if(!userId){
      const email=identity.email_verified===true||identity.email_verified==='true'?String(identity.email||'').toLowerCase():'';
      const address=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:`apple-${hash(identity.sub).slice(0,32)}@login.kargo.invalid`;
      const taken=await sql`SELECT id FROM kargo_users WHERE email=${address}`;
      if(taken.length)return goHome(res,'existing');
      userId=randomBytes(20).toString('hex');
      const salt=randomBytes(16).toString('hex'),unusablePassword=randomBytes(64).toString('hex');
      await sql`INSERT INTO kargo_users (id,email,salt,password_hash) VALUES (${userId},${address},${salt},${unusablePassword})`;
      await sql`INSERT INTO kargo_apple_identities (apple_sub,user_id) VALUES (${identity.sub},${userId})`;
    }
    const users=await sql`SELECT id,email FROM kargo_users WHERE id=${userId}`;
    if(!users.length)throw new Error('Apple user missing');
    await issueSession(res,sql,users[0]);
    res.setHeader('Set-Cookie',[res.getHeader('Set-Cookie'),`${stateCookie}=; Path=/api/apple; HttpOnly; Secure; SameSite=None; Max-Age=0`]);
    return goHome(res);
  }catch{return goHome(res,'failed')}
}
