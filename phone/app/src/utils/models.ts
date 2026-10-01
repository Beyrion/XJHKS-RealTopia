import { invoke } from "@tauri-apps/api/core";

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

export interface ModelProvider {
  readonly id: string;
  readonly side: ModelSide;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelSettings {
  edge: { name:string; stt:string; quantization:string };
  cloud: { provider:string; baseUrl:string; model:string; sttModel:string; hasApiKey:boolean };
  routing: { privateOnEdge:boolean; complexOnCloud:boolean };
}

const defaults: ModelSettings = {
  edge: { name:"Local Quest Planner", stt:"Qwen3-ASR 0.6B INT8 · MNN", quantization:"INT8" },
  cloud: { provider:"阿里云百炼 · OpenAI Compatible", baseUrl:"https://llm-91vwfbm1df53hn0g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", model:"qwen-plus", sttModel:"qwen3-asr-flash", hasApiKey:false },
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

type NativeCloudResult={text:string;provider:string;model:string;side:"cloud";latency_ms:number};
type NativeCloudConfig={provider:string;base_url:string;model:string;stt_model:string;has_api_key:boolean};

class SecureCloudProvider implements ModelProvider {
  readonly id="android-keystore-cloud";readonly side="cloud" as const;
  constructor(private readonly settings:ModelSettings["cloud"]){ }
  async complete(request:ModelRequest):Promise<ModelResponse>{
    if(!this.settings.hasApiKey)throw new Error("请先安全配置百炼 API Key");
    const result=await invoke<NativeCloudResult>("cloud_complete",{prompt:request.prompt,system:request.system??null,json:request.json??false});
    return {text:result.text,provider:result.provider,model:result.model,side:"cloud",latencyMs:result.latency_ms};
  }
}

class ModelHub {
  private providers = new Map<ModelSide, ModelProvider>([["edge",new LocalEdgeProvider()]]);
  register(provider:ModelProvider){this.providers.set(provider.side,provider)}
  route(request:ModelRequest,settings=this.load()):ModelSide{
    if(request.purpose==="speech"||(request.private&&settings.routing.privateOnEdge))return "edge";
    return settings.routing.complexOnCloud&&settings.cloud.hasApiKey?"cloud":"edge";
  }
  async complete(request:ModelRequest){
    const settings=this.load();
    if(settings.cloud.hasApiKey)this.register(new SecureCloudProvider(settings.cloud));
    const side=this.route(request,settings),provider=this.providers.get(side);
    if(!provider)throw new Error(`${side} model provider is not configured`);
    try{return await provider.complete(request)}catch(error){
      if(side==="edge")throw error;
      const fallback=this.providers.get("edge");if(!fallback)throw error;
      return fallback.complete(request);
    }
  }
  async completeCloud(request:ModelRequest){
    const settings=this.load();
    if(!settings.cloud.hasApiKey)throw new Error("请先在设置 → 智能中安全配置百炼 API Key");
    return new SecureCloudProvider(settings.cloud).complete({...request,private:false});
  }
  async testCloud(){
    const settings=this.load();if(!settings.cloud.hasApiKey)throw new Error("请先安全保存百炼 API Key");const provider=new SecureCloudProvider(settings.cloud);return provider.complete({purpose:"memory",prompt:"Reply with REALTOPIA_OK only.",system:"This is a provider connectivity check.",private:false});
  }
  async refreshSecureConfig(){
    const value=await invoke<NativeCloudConfig>("cloud_config");const settings=this.load();settings.cloud={provider:value.provider,baseUrl:value.base_url,model:value.model,sttModel:value.stt_model,hasApiKey:value.has_api_key};this.save(settings);return settings;
  }
  async saveSecureConfig(settings:ModelSettings,apiKey?:string){
    const value=await invoke<NativeCloudConfig>("save_cloud_config",{provider:settings.cloud.provider,baseUrl:settings.cloud.baseUrl,model:settings.cloud.model,sttModel:settings.cloud.sttModel,apiKey:apiKey?.trim()||null});settings.cloud={provider:value.provider,baseUrl:value.base_url,model:value.model,sttModel:value.stt_model,hasApiKey:value.has_api_key};this.save(settings);return settings;
  }
  async clearSecureApiKey(){
    const value=await invoke<NativeCloudConfig>("clear_cloud_api_key");const settings=this.load();settings.cloud={provider:value.provider,baseUrl:value.base_url,model:value.model,sttModel:value.stt_model,hasApiKey:value.has_api_key};this.save(settings);return settings;
  }
  load():ModelSettings {
    try{const saved=JSON.parse(localStorage.getItem("realtopia.models")??"{}") as Partial<ModelSettings>&{cloud?:Partial<ModelSettings["cloud"]>&{apiKey?:string}};const settings={edge:{...defaults.edge,...saved.edge},cloud:{...defaults.cloud,...saved.cloud},routing:{...defaults.routing,...saved.routing}};delete (settings.cloud as ModelSettings["cloud"]&{apiKey?:string}).apiKey;localStorage.setItem("realtopia.models",JSON.stringify(settings));return settings}catch{return structuredClone(defaults)}
  }
  save(settings:ModelSettings){localStorage.setItem("realtopia.models",JSON.stringify(settings))}
}

export const modelHub = new ModelHub();
