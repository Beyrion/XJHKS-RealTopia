import { useEffect, useState } from "react";
import { ModelRepositoryList } from "../../components/settings/ModelRepositoryList";
import { Icon } from "../../components/ui/Icon";
import { SettingCard } from "../../components/ui/SettingCard";
import { Toggle } from "../../components/ui/Toggle";
import type { ModelSettings } from "../../models";
import { modelHub } from "../../services/modelHub";
import { nativeService } from "../../services/native";
import { useAppStore } from "../../store/AppStore";

export default function IntelligenceSettingsPage() {
  const { modelDownloads, refreshModelDownload, retryLastRecording, notify } =
    useAppStore();
  const [settings, setSettings] = useState<ModelSettings>(() =>
    modelHub.load(),
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    void modelHub
      .refreshSecureConfig()
      .then((next) => setSettings({ ...next }))
      .catch(() => undefined);
  }, []);

  const patchCloud = (patch: Partial<ModelSettings["cloud"]>) =>
    setSettings((current) => ({
      ...current,
      cloud: { ...current.cloud, ...patch },
    }));
  const patchRouting = (patch: Partial<ModelSettings["routing"]>) =>
    setSettings((current) => ({
      ...current,
      routing: { ...current.routing, ...patch },
    }));
  const validate = () => {
    if (!/^https:\/\//.test(settings.cloud.baseUrl.trim()))
      throw new Error("Base URL 必须使用 HTTPS");
  };
  const save = async () => {
    validate();
    const next = await modelHub.saveSecureConfig(settings, apiKey);
    setSettings({ ...next });
    setApiKey("");
    return next;
  };

  return (
    <div className="setting-view">
      <div className="setting-head">
        <h1>智能</h1>
      </div>
      <SettingCard title="ModelScope 端侧模型">
        <ModelRepositoryList
          statuses={modelDownloads}
          onDownload={(modelId) =>
            void nativeService
              .startModelDownload(modelId)
              .then(() => {
                notify("模型已加入系统下载队列");
                window.setTimeout(() => void refreshModelDownload(true), 500);
              })
              .catch((error) =>
                notify(
                    error instanceof Error ? error.message : "模型下载启动失败",
                ),
              )
          }
          onOpen={(modelId) =>
            void nativeService
              .openModelRepository(modelId)
              .catch(() => notify("无法打开 ModelScope 页面"))
          }
        />
      </SettingCard>
      <SettingCard title="云侧模型">
        <div className="model">
          <span className="model-icon cloud-model">
            <Icon name="BrainCircuit" />
          </span>
          <span>
            <b>{settings.cloud.provider}</b>
            <small>
              {settings.cloud.baseUrl} ·{" "}
              {settings.cloud.hasApiKey ? "密钥已安全保存" : "尚未配置密钥"}
            </small>
          </span>
          <button
            id="test-model"
            onClick={() =>
              void save()
                .then(() => modelHub.testCloud())
                .then((result) =>
                  notify(`连接成功 · ${result.model} · ${result.latencyMs} ms`),
                )
                .catch((error) =>
                  notify(
                    error instanceof Error ? error.message : "云端连接失败",
                  ),
                )
            }
          >
            <Icon name="Radio" />
            测试连接
          </button>
        </div>
        <label className="select">
          <span>服务商</span>
          <input
            id="model-provider"
            value={settings.cloud.provider}
            onChange={(event) => patchCloud({ provider: event.target.value })}
          />
        </label>
        <label className="select">
          <span>接口地址</span>
          <input
            id="model-base-url"
            inputMode="url"
            value={settings.cloud.baseUrl}
            onChange={(event) => patchCloud({ baseUrl: event.target.value })}
          />
        </label>
        <label className="select">
          <span>默认推理模型</span>
          <input
            id="model-name"
            value={settings.cloud.model}
            onChange={(event) => patchCloud({ model: event.target.value })}
          />
        </label>
        <label className="select">
          <span>录音转写模型</span>
          <input
            id="model-stt"
            value={settings.cloud.sttModel}
            onChange={(event) => patchCloud({ sttModel: event.target.value })}
          />
        </label>
        <label className="secret">
          <span>访问密钥</span>
          <input
            id="model-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button
            id="show-key"
            onClick={() => setShowKey((current) => !current)}
          >
            显示
          </button>
        </label>
        <div className="buttons right">
          {settings.cloud.hasApiKey && (
            <button
              id="clear-model-key"
              onClick={() => {
                if (!confirm("清除本机安全存储中的云端 API Key？")) return;
                void modelHub
                  .clearSecureApiKey()
                  .then((next) => {
                    setSettings({ ...next });
                    notify("API Key 已清除");
                  })
                  .catch(() => notify("API Key 清除失败"));
              }}
            >
              清除密钥
            </button>
          )}
          <button
            className="primary"
            id="save-model"
            onClick={() =>
              void save()
                .then(() => {
                  retryLastRecording();
                  notify("配置与密钥已安全保存");
                })
                .catch((error) =>
                  notify(
                    error instanceof Error ? error.message : "模型配置无效",
                  ),
                )
            }
          >
            <Icon name="ShieldCheck" />
            安全保存
          </button>
        </div>
      </SettingCard>
      <SettingCard title="智能路由">
        <Toggle
          label="隐私内容始终使用端侧"
          id="private"
          checked={settings.routing.privateOnEdge}
          onChange={(privateOnEdge) => patchRouting({ privateOnEdge })}
        />
        <Toggle
          label="复杂任务允许使用云端"
          id="cloud"
          checked={settings.routing.complexOnCloud}
          onChange={(complexOnCloud) => patchRouting({ complexOnCloud })}
        />
      </SettingCard>
    </div>
  );
}
