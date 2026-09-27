import test from 'node:test';
import assert from 'node:assert/strict';
import {scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
import {authenticate, setupOwner, checkOrigin} from '../api/auth.js';
import handler from '../api/index.js';

test('existing account sign-in uses a derived password and issues a secure cookie',async()=>{
  const saved={id:'existing-user',email:'test@example.com',salt:'a-secure-random-salt'};
  saved.password_hash=(await promisify(scryptCallback)('correct horse battery staple',saved.salt,64)).toString('hex');
  let attempts=0;
  const sql=async(strings,...args)=>{
    const query=strings.join('?');
    if(query.includes('kargo_auth_attempts'))return [{attempts:++attempts}];
    if(query.includes('SELECT id,email,salt,password_hash'))return [saved];
    if(query.includes('INSERT INTO kargo_sessions'))return [];
    throw new Error('Unexpected SQL: '+query);
  };
  const req={method:'POST',url:'/api/login',headers:{host:'localhost:3000',origin:'http://localhost:3000','x-forwarded-for':'127.0.0.1'}};
  const headers={};const res={setHeader:(name,value)=>headers[name]=value};
  const user=await authenticate(req,res,sql,{email:'Test@Example.com',password:'correct horse battery staple'});
  assert.equal(user.email,'test@example.com');
  assert.notEqual(saved.password_hash,'correct horse battery staple');
  assert.match(headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await authenticate(req,res,sql,{email:'test@example.com',password:'correct horse battery staple'})).id,user.id);
  await assert.rejects(authenticate(req,res,sql,{email:'test@example.com',password:'wrong passphrase'}),{status:401});
  assert.equal(checkOrigin({...req,headers:{...req.headers,origin:'https://foreign.example'}}),false);
});

test('public registration endpoint rejects requests before accessing the database',async()=>{
  const req={url:'/api/register',method:'POST',headers:{origin:'https://kargo-six.vercel.app',host:'kargo-six.vercel.app'}};
  let status,payload;
  const res={writeHead:(code)=>{status=code;return res},end:(data)=>{payload=JSON.parse(data);return res}};
  await handler(req,res);
  assert.equal(status,403);
  assert.equal(payload.code,'REGISTRATION_CLOSED');
});

test('removed Apple endpoint is unavailable',async()=>{
  const req={url:'/api/apple/start',method:'GET',headers:{host:'kargo-six.vercel.app'}};
  let status;
  const res={writeHead:code=>{status=code;return res},end:()=>res};
  await handler(req,res);
  assert.equal(status,404);
});

test('owner setup needs a private secret and succeeds only once',async()=>{
  const old=process.env.KARGO_SETUP_SECRET;
  process.env.KARGO_SETUP_SECRET='setup-test-token-that-is-longer-than-forty-characters';
  let created=false,storedHash;
  const sql=async(strings,...args)=>{
    const query=strings.join('?');
    if(query.includes('INSERT INTO kargo_users')){if(created)return [];created=true;storedHash=args[3];return [{id:'owner',email:args[1]}]}
    if(query.includes('INSERT INTO kargo_sessions'))return [];
    throw new Error('Unexpected SQL: '+query);
  };
  const res={setHeader:()=>{}};
  try{
    const input={email:'owner@example.com',password:'correct horse battery staple',setupSecret:process.env.KARGO_SETUP_SECRET};
    await assert.rejects(setupOwner(res,sql,{...input,setupSecret:'wrong'}),{status:403});
    assert.equal((await setupOwner(res,sql,input)).id,'owner');
    assert.notEqual(storedHash,input.password);
    await assert.rejects(setupOwner(res,sql,input),{status:409});
  }finally{if(old===undefined)delete process.env.KARGO_SETUP_SECRET;else process.env.KARGO_SETUP_SECRET=old}
});
