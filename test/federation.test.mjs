import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function load(entry) {
  const built = await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',external:['@getpaseo/plugin','@getpaseo/plugin/client','zod']});
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
  return module.exports;
}
const census = {
  projects:[{projectId:'project',displayName:'Copied project',customName:null,rootPath:'/fixture',kind:null,archivedAt:null}],
  workspaces:[{workspaceId:'workspace',projectId:'project',cwd:'/fixture',kind:null,displayName:'Copied workspace',title:null,branch:null,createdAt:null,updatedAt:null,archivedAt:null,pinnedAt:null,autoArchivedChangeRequestUrl:null,labels:[]}],
  agents:[{id:'agent',workspaceId:'workspace',provider:'claude',title:'Copied agent',status:'idle',archivedAt:null,createdAt:'2026-10-01T00:00:00Z',lastActivityAt:null,model:null,transcript:{searchable:true,fileCount:1}}, {id:'orphan',workspaceId:null,provider:'claude',title:null,status:'idle',archivedAt:null,createdAt:'2026-10-01T00:00:00Z',lastActivityAt:null,model:null,transcript:{searchable:true,fileCount:1}}],
  generatedAt:'2026-10-01T00:00:00Z',
};
const answer = {matches:[{agentId:'agent',snippets:[],truncated:false,hitCount:1}],searchedAgents:2,unsearchableAgents:['orphan'],durationMs:10,outputTruncated:false,mode:'ranked'};

test('copied project, workspace, agent and orphan IDs stay separate across hosts',async()=>{
  const {scopeHistory,scopeSearch,mergeSearch,sourceKey,hostKey}=await load('shared/host-model.ts');
  const a=scopeHistory({serverId:'a',label:'Laptop'},census), b=scopeHistory({serverId:'b',label:'Server'},census);
  assert.equal(new Set([...a.rows,...b.rows].map(row=>row.id)).size,4);
  assert.notEqual(a.data.projects[0].projectId,b.data.projects[0].projectId);
  assert.deepEqual(sourceKey(b.rows.find(row=>!row.synthetic).agents[0].id),{hostId:'b',id:'agent'});
  assert.equal(b.rows[0].host.label,'Server');
  assert.notEqual(hostKey('a,b','c'),hostKey('a','b,c'));
  const merged=mergeSearch([scopeSearch('a',answer),scopeSearch('b',{...answer,outputTruncated:true,mode:'regex',fallback:'no-sqlite'})]);
  assert.equal(new Map(merged.matches.map(match=>[match.agentId,match])).size,2);
  assert.equal(merged.searchedAgents,4);
  assert.equal(merged.outputTruncated,true);
  assert.equal(merged.mode,'regex','mixed engines must not compare incompatible scores');
  assert.deepEqual(merged.unsearchableAgents,[hostKey('a','orphan'),hostKey('b','orphan')]);
});

test('host capabilities are replaced on reload, cleaned up, and never fall back to the local host',async()=>{
  const {createFederation,federation,rpcForHost,hostAvailability}=await load('client/federation.ts');
  const registry=createFederation();
  let notices=0;
  const unsubscribe=registry.subscribe(()=>notices++);
  const calls=[];
  const first=registry.register('a',async()=> 'old');
  const last=registry.register('a',async()=> 'new');
  first();
  assert.equal(await registry.get('a').rpc({},{}),'new');
  last(); assert.equal(registry.get('a'),undefined);
  assert.equal(notices,3);unsubscribe();
  const release=federation.register('remote',async(contract,input)=> {calls.push({contract,input});return 'remote answer';});
  try {
    assert.equal(await rpcForHost('remote')({name:'probe'},{}),'remote answer');
    assert.throws(()=>rpcForHost('unknown')({name:'probe'},{}),/Install or update/);
    assert.equal(calls.length,1);
    assert.deepEqual(hostAvailability([{serverId:'remote',label:'Remote',status:'online'},{serverId:'remote',label:'Remote',status:'offline'},{serverId:'missing',label:'Missing',status:'online'}]).map(host=>host.ready),[true,false,false]);
  } finally {release();}
});

test('late identity replies cannot register a stopped installation',async()=>{
  const {registerHost,federation}=await load('client/federation.ts');
  let resolve;
  const cleanup=registerHost({rpc:()=>new Promise(done=> {resolve=done;})});
  cleanup();resolve({serverId:'stopped',protocol:1});
  await Promise.resolve();await Promise.resolve();
  assert.equal(federation.get('stopped'),undefined);
});

test('independently evaluated host bundles share the same credential-free registry',async()=>{
  const a=await load('client/federation.ts'), b=await load('client/federation.ts');
  assert.equal(a.federation,b.federation);
  const release=a.federation.register('bundle-host',async()=> 'correct daemon');
  try {assert.equal(await b.rpcForHost('bundle-host')({name:'probe'},{}),'correct daemon');}
  finally {release();}
});

test('opening and restoring a copied session explicitly targets its source host',async()=>{
  const {scopeHistory}=await load('shared/host-model.ts');
  const {federation}=await load('client/federation.ts');
  const calls=[], navigations=[], mutations=[];
  const release=federation.register('remote-origin',async(contract,input)=>{calls.push({method:contract.name,input});return {agentId:input.agentId};});
  const externals=['@getpaseo/plugin','@getpaseo/plugin/client','@getpaseo/plugin/client/react-native','@tanstack/react-query','react','react/jsx-runtime','react-native','zod'];
  const built=await build({entryPoints:['client/workspace-card.tsx'],bundle:true,write:false,platform:'node',format:'cjs',external:externals});
  const element=(type,props)=>({type,props});
  const modules={
    '@getpaseo/plugin':require('@getpaseo/plugin'),zod:require('zod'),
    '@getpaseo/plugin/client':{},
    '@getpaseo/plugin/client/react-native':{Icon:'Icon',Modal:'Modal',useToast:()=>({error(){}})},
    '@tanstack/react-query':{useMutation(options){mutations.push(options);return {isPending:false,mutate(){}};},useQueryClient:()=>({invalidateQueries:async()=>{}})},
    react:{memo:x=>x,useCallback:x=>x,useMemo:x=>x(),useRef:x=>({current:x}),useState:x=>[typeof x==='function'?x():x,()=>{}]},
    'react/jsx-runtime':{jsx:element,jsxs:element},
    'react-native':{StyleSheet:{create:x=>x,hairlineWidth:1},View:'View',Text:'Text',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator'},
  };
  const module={exports:{}};
  new Function('require','module','exports',built.outputFiles[0].text)(id=>modules[id],module,module.exports);
  const row=scopeHistory({serverId:'remote-origin',label:'Remote'},census).rows.find(row=>!row.synthetic);
  const tree=module.exports.WorkspaceCard({row,agents:row.agents,matches:null,searchActive:false,theme:{colors:{}},scheme:'light',nowMs:Date.now(),host:row.host,navigation:{openWorkspace:input=>navigations.push(input),openAgent:input=>navigations.push(input)}});
  const nodes=[];
  function visit(node){if(!node)return;if(Array.isArray(node)){node.forEach(visit);return;}if(typeof node.type==='function'){visit(node.type(node.props));return;}nodes.push(node);visit(node.props?.children);}
  try {
    visit(tree);
    nodes.find(node=>node.type==='Pressable' && node.props.accessibilityLabel?.startsWith('Open workspace on Remote:')).props.onPress();
    assert.deepEqual(navigations.pop(),{workspaceId:'workspace',serverId:'remote-origin'});
    await mutations[0].mutationFn();mutations[0].onSuccess();
    assert.deepEqual(calls,[{method:'agents-history.restore-agent',input:{agentId:'agent'}}]);
    assert.deepEqual(navigations.pop(),{agentId:'agent',serverId:'remote-origin'});
  } finally {release();}
});
