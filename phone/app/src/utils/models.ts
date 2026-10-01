/** Provider-neutral model contracts. Business code never imports a vendor SDK. */
export type ModelSide = "edge" | "cloud";
export type ModelPurpose = "speech" | "task-planning" | "memory" | "vision";

export interface ModelRequest {
  purpose: ModelPurpose;
  prompt: string;
  system?: string;
  images?: Uint8Array[];
  private?: boolean;
  json?: boolean;
}

export interface ModelResponse {
  text: string;
  provider: string;
  model: string;
  side: ModelSide;
  latencyMs: number;
}

export interface AudioRequest {
  pcm:Uint8Array;
  sampleRate:number;
  channels:number;
  language?:string;
}

export interface ModelProvider {
  readonly id: string;
  readonly side: ModelSide;
  complete(request: ModelRequest): Promise<ModelResponse>;
  transcribe?(request:AudioRequest):Promise<ModelResponse>;
}

export interface ModelSettings {
  edge: { name:string; stt:string; quantization:string };
  cloud: { provider:string; baseUrl:string; model:string; sttModel:string; apiKey:string };
  routing: { privateOnEdge:boolean; complexOnCloud:boolean };
}

const defaults: ModelSettings = {
  edge: { name:"Local Quest Planner", stt:"Qwen3-ASR 0.6B INT8 · MNN", quantization:"INT8" },
  cloud: { provider:"OpenAI Compatible", baseUrl:"https://api.openai.com/v1", model:"gpt-4.1-mini", sttModel:"whisper-1", apiKey:"" },
  routing: { privateOnEdge:true, complexOnCloud:true },
};

function goalFrom(prompt:string){return prompt.match(/<goal>([\s\S]*?)<\/goal>/)?.[1].trim()??prompt.trim()}
function localPlan(goal:string){
  const people=["林澄","周野","沈弦","妈妈"].filter(name=>goal.includes(name));
  const deadline=goal.match(/(今天|明天|后天|周[一二三四五六日天](?:上午|下午|晚上)?|下(?:周|个月)[^，。；]*)/)?.[1]??"待安排";
  const parts=goal.split(/(?:，|。|；|然后|并且)/).map(x=>x.trim()).filter(Boolean);
  const steps=parts.length>1?parts:goal.includes("去")?["确认时间与地点",goal,"完成后记录结果"]:["明确完成标准",goal,"回顾并记录结果"];
  const urgent=/(今天|明天|尽快|马上|截止|前)/.test(goal);
  return {title:goal.replace(/^(我想|我要|请帮我|记得)/,"").slice(0,28),deadline,priority:urgent?"首要":"普通",person:people[0]??null,steps:steps.slice(0,5),reward:people.length?`好感度 +8 · ${people[0]}`:"生命力 +5"};
}

class LocalEdgeProvider implements ModelProvider {
  readonly id="local-quest-planner-v1";readonly side="edge" as const;
  async complete(request:ModelRequest):Promise<ModelResponse>{
    const started=performance.now();
    const text=request.purpose==="task-planning"?JSON.stringify(localPlan(goalFrom(request.prompt))):goalFrom(request.prompt).replace(/\s+/g," ").slice(0,240);
    return {text,provider:this.id,model:"deterministic-edge-v1",side:this.side,latencyMs:Math.round(performance.now()-started)};
  }
}

class OpenAICompatibleProvider implements ModelProvider {
  readonly id="openai-compatible";readonly side="cloud" as const;
  constructor(private readonly settings:ModelSettings["cloud"]){ }
  async complete(request:ModelRequest):Promise<ModelResponse>{
    if(!this.settings.apiKey)throw new Error("cloud API key is not configured");
    const started=performance.now();
    const endpoint=`${this.settings.baseUrl.replace(/\/$/,"")}/chat/completions`;
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.settings.apiKey}`},body:JSON.stringify({model:this.settings.model,messages:[{role:"system",content:request.system??"You are RealTopia's planning engine."},{role:"user",content:request.prompt}],temperature:.2,response_format:request.json?{type:"json_object"}:undefined})});
    if(!response.ok)throw new Error(`cloud model returned HTTP ${response.status}`);
    const payload=await response.json() as {choices?:{message?:{content?:string}}[]};
    const text=payload.choices?.[0]?.message?.content;
    if(!text)throw new Error("cloud model returned an empty response");
    return {text,provider:this.id,model:this.settings.model,side:this.side,latencyMs:Math.round(performance.now()-started)};
  }
  async transcribe(request:AudioRequest):Promise<ModelResponse>{
    if(!this.settings.apiKey)throw new Error("cloud API key is not configured");
    const started=performance.now(),wav=pcmToWav(request),form=new FormData();
    form.append("model",this.settings.sttModel);form.append("language",request.language??"zh");form.append("file",new Blob([wav],{type:"audio/wav"}),"realtopia-recording.wav");
    const endpoint=`${this.settings.baseUrl.replace(/\/$/,"")}/audio/transcriptions`;
    const response=await fetch(endpoint,{method:"POST",headers:{authorization:`Bearer ${this.settings.apiKey}`},body:form});
    if(!response.ok)throw new Error(`transcription model returned HTTP ${response.status}`);
    const payload=await response.json() as {text?:string};if(!payload.text?.trim())throw new Error("transcription model returned empty text");
    return {text:payload.text.trim(),provider:this.id,model:this.settings.sttModel,side:this.side,latencyMs:Math.round(performance.now()-started)};
  }
}

function pcmToWav(request:AudioRequest){
  if(request.channels!==1||request.sampleRate<=0)throw new Error("only mono PCM is supported");
  const header=new ArrayBuffer(44),view=new DataView(header),write=(offset:number,value:string)=>[...value].forEach((char,index)=>view.setUint8(offset+index,char.charCodeAt(0)));
  write(0,"RIFF");view.setUint32(4,36+request.pcm.byteLength,true);write(8,"WAVEfmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,request.channels,true);view.setUint32(24,request.sampleRate,true);view.setUint32(28,request.sampleRate*request.channels*2,true);view.setUint16(32,request.channels*2,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,request.pcm.byteLength,true);
  const wav=new Uint8Array(44+request.pcm.byteLength);wav.set(new Uint8Array(header));wav.set(request.pcm,44);return wav;
}

class ModelHub {
  private providers = new Map<ModelSide, ModelProvider>([["edge",new LocalEdgeProvider()]]);
  register(provider:ModelProvider){this.providers.set(provider.side,provider)}
  route(request:ModelRequest,settings=this.load()):ModelSide{
    if(request.purpose==="speech"||(request.private&&settings.routing.privateOnEdge))return "edge";
    return settings.routing.complexOnCloud&&settings.cloud.apiKey?"cloud":"edge";
  }
  async complete(request:ModelRequest){
    const settings=this.load();
    if(settings.cloud.apiKey)this.register(new OpenAICompatibleProvider(settings.cloud));
    const side=this.route(request,settings),provider=this.providers.get(side);
    if(!provider)throw new Error(`${side} model provider is not configured`);
    try{return await provider.complete(request)}catch(error){
      if(side==="edge")throw error;
      const fallback=this.providers.get("edge");if(!fallback)throw error;
      return fallback.complete(request);
    }
  }
  async transcribe(request:AudioRequest){
    const settings=this.load();if(!settings.cloud.apiKey)throw new Error("请先配置支持音频转写的云端 API Key");
    const provider=new OpenAICompatibleProvider(settings.cloud);this.register(provider);if(!provider.transcribe)throw new Error("cloud provider does not support transcription");return provider.transcribe(request);
  }
  async testCloud(){
    const settings=this.load();if(!settings.cloud.apiKey)throw new Error("请先填写云端 API Key");const provider=new OpenAICompatibleProvider(settings.cloud);return provider.complete({purpose:"memory",prompt:"Reply with REALTOPIA_OK only.",system:"This is a provider connectivity check.",private:false});
  }
  load():ModelSettings {
    try{const saved=JSON.parse(localStorage.getItem("realtopia.models")??"{}") as Partial<ModelSettings>;return {edge:{...defaults.edge,...saved.edge},cloud:{...defaults.cloud,...saved.cloud},routing:{...defaults.routing,...saved.routing}}}catch{return structuredClone(defaults)}
  }
  save(settings:ModelSettings){localStorage.setItem("realtopia.models",JSON.stringify(settings))}
}

export const modelHub = new ModelHub();
