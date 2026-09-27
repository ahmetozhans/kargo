import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate, checkOrigin} from '../api/auth.js';

test('account registration and sign-in use a derived password and issue a secure cookie',async()=>{
  let saved,attempts=0;
  const sql=async(strings,...args)=>{
    const query=strings.join('?');
    if(query.includes('kargo_auth_attempts'))return [{attempts:++attempts}];
    if(query.includes('INSERT INTO kargo_users')){saved={id:args[0],email:args[1],salt:args[2],password_hash:args[3]};return [{id:saved.id,email:saved.email}]}
    if(query.includes('SELECT id,email,salt,password_hash'))return saved?[saved]:[];
    if(query.includes('INSERT INTO kargo_sessions'))return [];
    throw new Error('Unexpected SQL: '+query);
  };
  const req={method:'POST',url:'/api/login',headers:{host:'localhost:3000',origin:'http://localhost:3000','x-forwarded-for':'127.0.0.1'}};
  const headers={};const res={setHeader:(name,value)=>headers[name]=value};
  const user=await authenticate(req,res,sql,{email:'Test@Example.com',password:'correct horse battery staple',register:true});
  assert.equal(user.email,'test@example.com');
  assert.notEqual(saved.password_hash,'correct horse battery staple');
  assert.match(headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await authenticate(req,res,sql,{email:'test@example.com',password:'correct horse battery staple'})).id,user.id);
  await assert.rejects(authenticate(req,res,sql,{email:'test@example.com',password:'wrong passphrase'}),{status:401});
  assert.equal(checkOrigin({...req,headers:{...req.headers,origin:'https://foreign.example'}}),false);
});
