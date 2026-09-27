import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, verify as verifySignature} from 'node:crypto';
import {appleEnabled, clientSecret, startApple, finishApple, verifyIdentity} from '../api/apple.js';

test('Apple authorization has one-time state and a signed client credential',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const previous=Object.fromEntries(['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','APPLE_REDIRECT_URI'].map(name=>[name,process.env[name]]));
  Object.assign(process.env,{APPLE_CLIENT_ID:'com.example.kargo.web',APPLE_TEAM_ID:'ABC123TEAM',APPLE_KEY_ID:'KEY123ABCD',APPLE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),APPLE_REDIRECT_URI:'https://kargo-six.vercel.app/api/apple/callback'});
  try{
    assert.equal(appleEnabled(),true);
    const jwt=clientSecret().split('.');
    assert.equal(jwt.length,3);
    assert.equal(JSON.parse(Buffer.from(jwt[1],'base64url')).aud,'https://appleid.apple.com');
    assert.equal(verifySignature('sha256',Buffer.from(jwt.slice(0,2).join('.')),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(jwt[2],'base64url')),true);
    const headers={};let response={};
    const res={setHeader:(name,value)=>headers[name]=value,writeHead:(status,fields)=>{response={status,fields};return res},end:()=>res};
    const sql=async(strings,...args)=>{
      const statement=strings.join('?');
      if(statement.startsWith('CREATE TABLE'))return [];
      if(statement.startsWith('INSERT INTO kargo_apple_states')){assert.match(args[0],/^[a-f0-9]{64}$/);return []}
      throw new Error('Unexpected query');
    };
    await startApple({headers:{}},res,sql,new URL('https://kargo-six.vercel.app/api/apple/start'));
    assert.equal(response.status,302);
    const url=new URL(response.fields.Location);
    assert.equal(url.host,'appleid.apple.com');
    assert.equal(url.searchParams.get('response_mode'),'form_post');
    assert.match(headers['Set-Cookie'],/HttpOnly; Secure; SameSite=None/);
    const state=url.searchParams.get('state');
    assert.ok(headers['Set-Cookie'].includes(state));
    await finishApple({body:{state,code:'fake-code'},headers:{cookie:'kargo_apple_state='+('0'.repeat(64))}},res,sql);
    assert.equal(response.status,303);
    assert.equal(response.fields.Location,'/?apple_error=failed');
  }finally{
    for(const [name,value] of Object.entries(previous)){if(value===undefined)delete process.env[name];else process.env[name]=value}
  }
});

test('Apple identity must have a valid signature and match the requested nonce',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const originalFetch=globalThis.fetch,previousClient=process.env.APPLE_CLIENT_ID;
  process.env.APPLE_CLIENT_ID='com.example.kargo.web';
  globalThis.fetch=async()=>({ok:true,json:async()=>({keys:[{...publicKey.export({format:'jwk'}),kid:'apple-test',use:'sig'}]})});
  try{
    const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'apple-test'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:process.env.APPLE_CLIENT_ID,sub:'apple-user',nonce:'expected-nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
    const content=`${header}.${payload}`;
    const token=`${content}.${sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url')}`;
    assert.equal((await verifyIdentity(token,'expected-nonce')).sub,'apple-user');
    await assert.rejects(verifyIdentity(token,'wrong-nonce'),/claims invalid/);
    await assert.rejects(verifyIdentity(token.slice(0,-2)+'aa','expected-nonce'),/signature invalid/);
  }finally{globalThis.fetch=originalFetch;if(previousClient===undefined)delete process.env.APPLE_CLIENT_ID;else process.env.APPLE_CLIENT_ID=previousClient}
});
