import {randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt=promisify(scryptCallback);
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookieName='kargo_session';
const days=30*24*60*60*1000;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function database(){
  const {neon}=await import('@neondatabase/serverless');
  const sql=neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS kargo_users (id text PRIMARY KEY, email text UNIQUE NOT NULL, salt text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kargo_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES kargo_users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS kargo_auth_attempts (attempt_key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS kargo_apple_identities (apple_sub text PRIMARY KEY, user_id text NOT NULL REFERENCES kargo_users(id) ON DELETE CASCADE)`;
  return sql;
}

export function checkOrigin(req){
  if(!['POST','PUT','DELETE'].includes(req.method))return true;
  const origin=req.headers.origin;
  if(!origin)return false;
  try{return new URL(origin).host===req.headers.host && new URL(origin).protocol==='https:' || new URL(origin).origin==='http://localhost:3000' && req.headers.host==='localhost:3000';}catch{return false}
}

export async function currentUser(req,sql){
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
  const token=cookie?.slice(cookieName.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const rows=await sql`SELECT u.id,u.email,EXISTS(SELECT 1 FROM kargo_apple_identities i WHERE i.user_id=u.id) AS apple_linked FROM kargo_sessions s JOIN kargo_users u ON u.id=s.user_id WHERE s.token_hash=${hash(token)} AND s.expires_at>now()`;
  return rows[0]||null;
}

export function clearSession(res){res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)}

export async function issueSession(res,sql,user){
  const token=randomBytes(32).toString('hex');
  await sql`INSERT INTO kargo_sessions (token_hash,user_id,expires_at) VALUES (${hash(token)},${user.id},${new Date(Date.now()+days).toISOString()})`;
  res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days/1000}`);
  return {id:user.id,email:user.email};
}

export async function authenticate(req,res,sql,input){
  const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
  if(!emailPattern.test(email)||email.length>254||password.length<12||password.length>128)throw Object.assign(new Error('Geçerli e-posta ve en az 12 karakterli şifre gir.'),{status:400});
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
  const attemptKey=hash(`${req.method}:${req.url}:${ip}:${email}`);
  const attempts=await sql`INSERT INTO kargo_auth_attempts (attempt_key,attempts,window_start) VALUES (${attemptKey},1,now()) ON CONFLICT (attempt_key) DO UPDATE SET attempts=CASE WHEN kargo_auth_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE kargo_auth_attempts.attempts+1 END,window_start=CASE WHEN kargo_auth_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE kargo_auth_attempts.window_start END RETURNING attempts`;
  if(attempts[0].attempts>8)throw Object.assign(new Error('Çok fazla deneme. 15 dakika sonra yeniden dene.'),{status:429});
  if(input.register){
    const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64);
    const id=randomBytes(20).toString('hex');
    const users=await sql`INSERT INTO kargo_users (id,email,salt,password_hash) VALUES (${id},${email},${salt},${derived.toString('hex')}) ON CONFLICT (email) DO NOTHING RETURNING id,email`;
    if(!users.length)throw Object.assign(new Error('Bu e-posta zaten kayıtlı. Giriş yap.'),{status:409});
    return issueSession(res,sql,users[0]);
  }
  const users=await sql`SELECT id,email,salt,password_hash FROM kargo_users WHERE email=${email}`;
  const user=users[0],derived=await scrypt(password,user?.salt||'00000000000000000000000000000000',64);
  if(!user||!timingSafeEqual(derived,Buffer.from(user.password_hash,'hex')))throw Object.assign(new Error('E-posta veya şifre hatalı.'),{status:401});
  return issueSession(res,sql,user);
}

export async function endSession(req,res,sql){
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
  const token=cookie?.slice(cookieName.length+1);
  if(token&&/^[a-f0-9]{64}$/.test(token))await sql`DELETE FROM kargo_sessions WHERE token_hash=${hash(token)}`;
  clearSession(res);
}
