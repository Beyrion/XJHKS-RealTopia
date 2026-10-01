const endpoint=process.env.REALTOPIA_CDP??"http://127.0.0.1:19222";
const expression=process.argv.slice(2).join(" ");
if(!expression)throw new Error("usage: node scripts/device-webview-eval.mjs <javascript expression>");
const targets=await fetch(`${endpoint}/json`).then(response=>response.json());
const target=targets.find(value=>value.type==="page"&&value.title==="RealTopia Link")??targets.find(value=>value.type==="page");
if(!target)throw new Error("RealTopia WebView target not found");
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
const result=await new Promise((resolve,reject)=>{
  const id=1;
  const timer=setTimeout(()=>reject(new Error("CDP evaluation timed out")),5000);
  socket.addEventListener("message",event=>{const message=JSON.parse(event.data);if(message.id!==id)return;clearTimeout(timer);message.error?reject(new Error(message.error.message)):resolve(message.result)});
  socket.send(JSON.stringify({id,method:"Runtime.evaluate",params:{expression,awaitPromise:true,returnByValue:true,userGesture:true}}));
});
socket.close();
process.stdout.write(`${JSON.stringify(result)}\n`);
